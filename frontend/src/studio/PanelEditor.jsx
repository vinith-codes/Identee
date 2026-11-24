// studio/PanelEditor.jsx — free placement phase 3 (15 Nov 2026, docs/FREE_PLACEMENT.md)
//
// A whole side of the tee (front, back or a sleeve) drawn flat at its true size for the chosen tee size, with every
// print on that side. The customer picks any thing and drags it ANYWHERE inside the safe zone, across the old print
// areas' edges; when it is let go the page works out where it now belongs (panelDrag.js dropThing). Faint dashed
// frames show the print areas (on a phone only while dragging, so the small screen stays clean), hatched bands the
// "no print" strips (collar, side seams, hem). It snaps to the centre line and to the print areas' centre and top lines
// and names the line; a label says the real size and place while dragging or resizing.
// Phones: one finger moves the selected thing (a tap never moves anything: 5 px first), two fingers zoom and pan the
// view — or resize and turn the thing when the first finger came down on the thing that was already selected. Laptops:
// drag the empty fabric to pan, Ctrl + wheel (or a trackpad pinch) to zoom. "Zoom in" / "Whole front" come from the
// page through the ref.
// Built like AreaEditor.jsx: one Konva stage made once; the prints are rebuilt only when the design changes (not when
// the selection does, which would cut off a drag that has just started). Three layers, so a drag frame redraws only
// what moves: the tee, its bands and frames (redrawn only when the view changes), the prints, and the handles / guides.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Konva from "konva";
import { buildNodes, cachedImage, imageSrcs, loadImage } from "./konvaRender";
import { extentOf } from "./panelModel";
import { acrossAt, boxLeft, boxRect, clampView, keepThing, labelBox, liveLabel, rulesFor, snapDrag, wholeView, zoomAt, zoomToBox } from "./panelDrag";

const MARGIN_CM = 1; // fabric shown round the side
const PAD_PX = 5; // a finger moves this far before a drag starts (a tap never moves anything)
const SMALL_PX = 60; // a thing smaller than this on screen is zoomed to when it is added (its handles would cover it)
const CORNERS = { front: ["Your right", "Your left"], back: ["Your left", "Your right"], left: ["Front", "Back"], right: ["Back", "Front"] };
const NAME_MIN = 30; // a players' name keeps a print this wide (panelModel.js NAME_MIN_CM)

// Group (centre-based) -> stored box in % of its print (top-left, unturned), as AreaEditor.jsx
function boxFromGroup(g, W, H) {
  const w = g.getAttr("boxW") * g.scaleX();
  const h = g.getAttr("boxH") * g.scaleY();
  return { x: ((g.x() - w / 2) / W) * 100, y: ((g.y() - h / 2) / H) * 100, width: (w / W) * 100, height: (h / H) * 100 };
}
const lum = (hex) => {
  const n = parseInt(String(hex || "#000").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
// the "no print" bands' hatching: thin diagonal lines, dark on a light tee, light on a dark one
function hatch(dark) {
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d");
  g.strokeStyle = dark ? "rgba(255,255,255,.34)" : "rgba(20,17,16,.26)";
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(6, 10);
  g.lineTo(10, 6);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.stroke();
  return c;
}
// how far a thing's outline (x, y, hw, hh: cm) reaches past the lines L, added up (0 = inside)
const overBy = (t, L) => Math.max(0, L.x0 - (t.x - t.hw)) + Math.max(0, t.x + t.hw - L.x1) + Math.max(0, L.y0 - (t.y - t.hh)) + Math.max(0, t.y + t.hh - L.y1);
// the line it reaches past first, in the label's words
const lineHit = (t, L) => (t.y - t.hh < L.y0 - 1e-6 ? "collar" : t.y + t.hh > L.y1 + 1e-6 ? "hem" : t.x - t.hw < L.x0 - 1e-6 || t.x + t.hw > L.x1 + 1e-6 ? "side" : null);
// the middle of a Transformer box (absolute px; x, y = its turned top-left corner, rotation in radians)
const boxMiddle = (b) => ({ x: b.x + (b.width / 2) * Math.cos(b.rotation) - (b.height / 2) * Math.sin(b.rotation), y: b.y + (b.width / 2) * Math.sin(b.rotation) + (b.height / 2) * Math.cos(b.rotation) });

/**
 *   view     panelDrag.js panelView: the side in cm, its safe zone and limit (and `grow`: a growing print's)
 *   prints   [{ key, label, box (panelBox, cm), W, H (its picture's px, as the 3D tee draws it), elements, spot (a free
 *            place: its box is made round its things), grows (a free place that grows with the tee) }]: every print
 *            on this side with things
 *   openBox  { key, label, box } the print open when it has nothing in it yet (its dashed box and name tab), or null
 *   frames   [{ key, box }] the print areas this tee offers on this side (dashed)
 *   lines    panelDrag.js snapLines
 *   onDrop(element)   a thing let go (or resized / turned): the same element, x / y / … as % of its print's box
 *   onLive(key, elements)   while dragging inside its print's box (the 3D tee follows); outside it the tee waits
 *   onNewHere({ x, y })   "+ New print here" tapped on the empty fabric (panel cm)
 *   onEdit(id)   a double tap on a thing: back to its normal editor
 *   onZoomed(bool)   the view zoomed in or back to the whole side
 *   cw, ch   the canvas size (px), set by the page when the panel opens (the keyboard can't make it jump)
 *   nudged   counts the nudges (arrow keys, Centre): each one shows the thing's new size and place for a moment
 *   children  drawn over the canvas (the laptop's Zoom in button)
 */
const PanelEditor = forwardRef(function PanelEditor({ view, prints, openBox = null, frames, lines, fabric, selectedId, activeKey, onSelect, onDrop, onLive, onNewHere, onHover, onEdit, onZoomed, nudged = 0, narrow, cw, ch, children }, ref) {
  const holder = useRef(null);
  const chip = useRef(null);
  const st = useRef({ vs: { z: 1, tx: 0, ty: 0 }, toldWorn: false });
  st.current.props = { view, prints, openBox, lines, selectedId, activeKey, onSelect, onDrop, onLive, onNewHere, onHover, onEdit, onZoomed, narrow, cw, ch };
  const [offer, setOffer] = useState(null); // "+ New print here": { left, top, x, y }
  const offerRef = useRef(null);
  offerRef.current = setOffer;

  // the panel's place on the canvas (panelDrag.js wholeView): px per cm at zoom 1, and where cm 0, 0 is
  const geo = () => {
    const { view: v, cw: w, ch: h } = st.current.props;
    const pw = v.w + 2 * MARGIN_CM;
    const ph = v.above + v.len + 2 * MARGIN_CM;
    return { cw: w, ch: h, k: Math.min(w / pw, h / ph), pw, ph, ox: MARGIN_CM, oy: MARGIN_CM + v.above };
  };
  const hint = () => (narrow ? "Drag a print anywhere · two fingers to zoom" : "Drag a print anywhere · Ctrl + scroll to zoom");
  const say = (text) => {
    if (chip.current && chip.current.textContent !== text) chip.current.textContent = text;
  };
  // the open print (with things, or the empty one just made)
  const openPrint = () => {
    const { prints: list, activeKey: key, openBox: empty } = st.current.props;
    return list.find((p) => p.key === key) || (empty && empty.key === key ? empty : null);
  };

  // create the stage once
  useEffect(() => {
    const stage = new Konva.Stage({ container: holder.current, width: cw, height: ch });
    // the tee, its bands and frames: drawn again only when the view changes (never on a drag frame)
    const bgLayer = new Konva.Layer({ listening: false });
    const vwBg = new Konva.Group();
    const bg = new Konva.Group();
    const framesG = new Konva.Group();
    vwBg.add(bg, framesG);
    bgLayer.add(vwBg);
    // the prints
    const layer = new Konva.Layer();
    const vw = new Konva.Group();
    const printsG = new Konva.Group();
    vw.add(printsG);
    layer.add(vw);
    // the handles, the open print's box, the snap guides and tags
    const uiLayer = new Konva.Layer();
    const vwUi = new Konva.Group({ listening: false });
    const over = new Konva.Group({ listening: false });
    vwUi.add(over);
    stage.add(bgLayer, layer, uiLayer);
    const tr = new Konva.Transformer({
      keepRatio: true,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      rotateAnchorOffset: 30,
      anchorSize: 20,
      anchorCornerRadius: 10,
      anchorStroke: "#8C6A1F",
      anchorFill: "#FFFFFF",
      borderStroke: "#C9A24B",
      borderDash: [8, 6],
      rotationSnaps: [0, 90, 180, 270],
      ignoreStroke: true,
      // a corner pulled past the opposite one stops there: it must not turn the words upside down (15 Nov 2026 verify)
      flipEnabled: false,
      // (a 20 px handle with a 44 px area for a finger — less on a thing so small on screen that four 44 px areas would
      // cover all of it, so its middle can still be grabbed and dragged: a 6 x 1.5 cm left-chest word at the whole
      // front on a laptop could only be resized, 15 Nov 2026 verify)
      anchorStyleFunc: (a) => {
        const back = a.getParent()?.findOne(".back");
        const big = back ? Math.max(Math.abs(back.width()), Math.abs(back.height())) : Infinity;
        a.hitStrokeWidth(Math.max(0, Math.min(24, big - 36)));
      },
    });
    const tag = new Konva.Label({ visible: false, listening: false });
    tag.add(new Konva.Tag({ fill: "#15130F", cornerRadius: 6 }));
    tag.add(new Konva.Text({ text: "", fontSize: 12, fontStyle: "bold", fill: "#F6DFA0", padding: 5 }));
    const nameTab = new Konva.Label({ visible: false, listening: false });
    nameTab.add(new Konva.Tag({ fill: "#C9A24B", cornerRadius: [6, 6, 0, 0] }));
    nameTab.add(new Konva.Text({ text: "", fontSize: 11, fontStyle: "bold", fill: "#15130F", padding: 4 }));
    uiLayer.add(vwUi, tr, tag, nameTab);
    st.current = { ...st.current, stage, bgLayer, layer, uiLayer, vws: [vwBg, vw, vwUi], vw, bg, framesG, printsG, over, tr, tag, nameTab, groups: new Map(), printOf: new Map() };

    // the empty fabric: pan when dragged; a tap deselects, or (nothing selected) offers a new print there. (A second
    // finger is two-finger zoom, never a tap or a pan: onTouchStart.)
    stage.on("pointerdown", (e) => {
      if (e.evt && e.evt.isPrimary === false) return;
      offerRef.current(null);
      if (e.target !== stage) return;
      const p = stage.getPointerPosition();
      st.current.downOn = null;
      st.current.pan = p && { x0: p.x, y0: p.y, vs0: { ...st.current.vs }, moved: false, wasSel: st.current.props.selectedId != null };
    });
    stage.on("pointermove", (e) => {
      const pan = st.current.pan;
      if (!pan || st.current.pinch || (e.evt && e.evt.isPrimary === false)) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      if (!pan.moved && Math.hypot(p.x - pan.x0, p.y - pan.y0) < PAD_PX) return;
      pan.moved = true;
      setView(clampView(geo(), { ...pan.vs0, tx: pan.vs0.tx + p.x - pan.x0, ty: pan.vs0.ty + p.y - pan.y0 }));
    });
    stage.on("pointerup", (e) => {
      if (e.evt && e.evt.isPrimary === false) return;
      const pan = st.current.pan;
      st.current.pan = null;
      if (!pan || pan.moved || st.current.pinchEnded > performance.now() - 300) return;
      const { props } = st.current;
      if (pan.wasSel) return props.onSelect(null);
      // a tap on the empty fabric inside the safe zone: "+ New print here"
      const at = vw.getAbsoluteTransform().copy().invert().point({ x: pan.x0, y: pan.y0 });
      const lim = props.view.limit;
      if (at.x < lim.x0 || at.x > lim.x1 || at.y < lim.y0 || at.y > lim.y1) return;
      offerRef.current({ left: Math.min(props.cw - 150, Math.max(4, pan.x0 - 70)), top: Math.min(props.ch - 50, Math.max(4, pan.y0 - 54)), x: at.x, y: at.y });
    });
    const endPan = () => {
      st.current.pan = null;
    };
    window.addEventListener("pointerup", endPan);

    // two fingers: started on the thing that was already selected, they resize and turn it; anywhere else they zoom
    // and pan the view. Konva readies a drag for every finger that lands on a print: those are all called off, so a
    // pinch never moves (and drops) the print under a finger — the two-finger change is one commit, when they let go.
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ang = (a, b) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
    const mid = (a, b) => {
      const r = holder.current.getBoundingClientRect();
      return { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
    };
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      offerRef.current(null);
      const [a, b] = e.touches;
      const sel = st.current.selGroup;
      const onSel = sel && st.current.downOn === sel.id();
      st.current.pan = null;
      st.current.pinching = true; // (set first: the drags stopped below end with a dragend, which then does nothing)
      const stopped = [];
      st.current.groups.forEach((g) => {
        if (g.isDragging()) {
          g.stopDrag();
          stopped.push(g);
        } else {
          // (a drag only readied — the finger hasn't moved 5 px yet — is forgotten: Konva drops it when the node
          // stops being draggable)
          g.draggable(false);
          g.draggable(true);
        }
      });
      if (onSel) {
        lift(sel);
        pickRules(sel);
        st.current.pinch = { mode: "thing", g: sel, d0: dist(a, b), a0: ang(a, b), s0: sel.scaleX(), r0: sel.rotation() };
      } else st.current.pinch = { mode: "view", d0: dist(a, b), m0: mid(a, b), vs0: { ...st.current.vs }, stopped };
    };
    const onTouchMove = (e) => {
      const pinch = st.current.pinch;
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const [a, b] = e.touches;
      if (pinch.mode === "thing") {
        const g = pinch.g;
        let s = Math.max(0.15, Math.min(8, pinch.s0 * (dist(a, b) / pinch.d0)));
        // no bigger than the biggest print (less the 0.5 cm its box adds round it) or the room inside the safe zone, as
        // the corner handles (boundBoxFunc)
        const one = thingAt(g);
        const r = rulesOf(g, one);
        const w1 = (2 * one.hw) / g.scaleX();
        const h1 = (2 * one.hh) / g.scaleY();
        const fit = Math.min((r.limit.x1 - r.limit.x0) / w1, (r.limit.y1 - r.limit.y0) / h1);
        const most = Math.min((r.maxW - 1) / w1, (r.maxH - 1) / h1);
        const area = areaOf(g);
        const cap = Math.max(Math.min(most, fit), area ? Math.min((area.x1 - area.x0) / w1, (area.y1 - area.y0) / h1) : 0, Math.min(pinch.s0, g.scaleX()));
        const big = s > cap && most <= fit + 1e-9 ? [r.maxW, r.maxH] : null;
        s = Math.min(s, cap);
        g.scale({ x: s, y: s });
        g.rotation(pinch.r0 + ((ang(a, b) - pinch.a0) * 180) / Math.PI);
        tr.forceUpdate();
        follow(g, { fit: true, big });
        return;
      }
      const m = mid(a, b);
      const z = zoomAt(geo(), pinch.vs0, dist(a, b) / pinch.d0, pinch.m0.x, pinch.m0.y);
      setView(clampView(geo(), { ...z, tx: z.tx + m.x - pinch.m0.x, ty: z.ty + m.y - pinch.m0.y }));
    };
    const onTouchEnd = (e) => {
      const pinch = st.current.pinch;
      if (!pinch || e.touches.length >= 2) return;
      st.current.pinch = null;
      st.current.pinching = false;
      st.current.pinchEnded = performance.now();
      if (pinch.mode === "thing") letGo(pinch.g);
      // (a thing the first finger was dragging when the second came down stays where it was moved to)
      else pinch.stopped.forEach((g) => letGo(g));
    };
    // laptops: Ctrl + wheel (a trackpad pinch sends the same) zooms round the pointer — a mouse wheel's notch (about
    // 100) a step of 1.22 x, not 2.7 x
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = holder.current.getBoundingClientRect();
      const d = Math.max(-20, Math.min(20, e.deltaY));
      setView(zoomAt(geo(), st.current.vs, Math.exp(-d * 0.01), e.clientX - r.left, e.clientY - r.top));
    };
    const el = holder.current;
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("pointerup", endPan);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      stage.destroy();
    };
    // the handlers read the latest props from st.current, so this runs once
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the view (zoom and pan): only the view groups move, nothing is rebuilt ---------- */
  function setView(vs) {
    const was = st.current.vs.z > 1.01;
    st.current.vs = vs;
    applyView();
    const now = vs.z > 1.01;
    if (now !== was) st.current.props.onZoomed?.(now);
  }
  function applyView() {
    const { vws, bgLayer, layer, uiLayer, tr, bands, pattern, outline } = st.current;
    if (!vws) return;
    const g = geo();
    const { z, tx, ty } = st.current.vs;
    const s = g.k * z;
    vws.forEach((v) => v.setAttrs({ x: tx + g.ox * s, y: ty + g.oy * s, scaleX: s, scaleY: s }));
    // the hatching and the tee's shadow stay the same size on screen however far it is zoomed (Konva draws a shadow in
    // the shape's own units: 14 cm of blur on a phone, 15 Nov 2026 review)
    if (pattern) (bands || []).forEach((b) => b.fillPatternScale({ x: 1 / s, y: 1 / s }));
    if (outline) outline.setAttrs({ shadowBlur: 14 / s, shadowOffsetY: 4 / s });
    tr.forceUpdate();
    placeNameTab();
    bgLayer.batchDraw();
    layer.batchDraw();
    uiLayer.batchDraw();
  }
  // the open print's name, on a small tab just above its box's top-left corner (clear of the handles)
  function placeNameTab() {
    const { nameTab, vw, props } = st.current;
    const pr = openPrint();
    if (!pr) return nameTab.visible(false);
    const v = props.view;
    const at = vw.getAbsoluteTransform().point({ x: boxLeft(v.side, v.w, pr.box), y: pr.box.down });
    nameTab.getText().text(pr.label);
    // (the selected thing's corner handle sits on the box's corner: the tab goes a little higher when one is there)
    const lift = st.current.selGroup && st.current.printOf.get(st.current.selGroup.id())?.key === pr.key ? 12 : 0;
    nameTab.position({ x: at.x, y: at.y - nameTab.height() - lift });
    nameTab.visible(true);
  }

  /* ---------- a thing on the panel, in cm ---------- */
  function thingAt(g) {
    const pr = st.current.printOf.get(g.id());
    const v = st.current.props.view;
    const fx = pr.box.w / pr.W;
    const fy = pr.box.h / pr.H;
    const w = g.getAttr("boxW") * g.scaleX() * fx;
    const h = g.getAttr("boxH") * g.scaleY() * fy;
    const { hw, hh } = extentOf({ w, h, rot: g.rotation() });
    const left = boxLeft(v.side, v.w, pr.box);
    return { pr, fx, fy, left, x: left + g.x() * fx, y: pr.box.down + g.y() * fy, w, h, hw, hh };
  }
  const putAt = (g, t, x, y) => {
    g.x((x - t.left) / t.fx);
    g.y((y - t.pr.box.down) / t.fy);
  };
  // the rules it moves under (a growing print's or a fixed one's: panelDrag.js rulesFor), and its print area's box
  // when it is in one (it may go anywhere inside that, as in the area editor: keepThing)
  function rulesOf(g, t = thingAt(g)) {
    const pr = st.current.printOf.get(g.id());
    const el = pr.elements.find((e) => String(e.id) === g.id());
    return rulesFor(st.current.props.view, t, { grows: !!pr.grows, nameW: el?.role ? (pr.spot ? NAME_MIN : pr.box.w) : 0 });
  }
  function areaOf(g) {
    const pr = st.current.printOf.get(g.id());
    const v = st.current.props.view;
    return pr.spot ? null : boxRect(v.side, v.w, pr.box);
  }
  // a print area's things are cut at its edge (as on the 3D tee and in the print file); while one of them is being
  // moved, resized or turned the cut is lifted, so it can be taken out of its area
  const lift = (g) => {
    const pg = g.getParent();
    if (pg?.getAttr("cut")) pg.setAttrs({ clipWidth: null, clipHeight: null });
  };
  // the hatched bands up to the lines of these rules (a growing print has other lines than a fixed one)
  function pickRules(g) {
    const r = rulesOf(g);
    st.current.rules = r;
    drawBands(r.limit);
    return r;
  }
  function patchFrom(g) {
    const pr = st.current.printOf.get(g.id());
    const el = pr?.elements.find((e) => String(e.id) === g.id());
    if (!el) return null;
    const patch = { ...boxFromGroup(g, pr.W, pr.H), rotation: Math.round(g.rotation()) };
    // (words may grow past their print's box here: the page boxes the print round them again when it is let go)
    if (el.type === "text") patch.fontSizePct = Math.max(1, Math.min(1000, (el.fontSizePct || 15) * g.scaleX()));
    return { ...el, ...patch };
  }
  // while dragging / resizing: the label, the band pushed against, and the 3D tee while it is still inside its print
  function follow(g, { hit = null, big = null, fit = false } = {}) {
    const { props } = st.current;
    const v = props.view;
    let t = thingAt(g);
    if (fit) {
      const kept = keepThing(t, rulesOf(g, t).limit, areaOf(g));
      putAt(g, t, kept.x, kept.y);
      t = thingAt(g);
      hit = kept.hit[0] || null;
    }
    const box = labelBox(t, v.side, v.w);
    const lr = v.side !== "left" && v.side !== "right" && Math.abs(box.across) >= 0.5;
    if (lr) st.current.saidWorn = true;
    say(liveLabel({ side: v.side, box, asWorn: lr && !st.current.toldWorn, hit, big }));
    const lit = hit || null;
    if (st.current.lit !== lit) {
      st.current.lit = lit;
      (st.current.bands || []).forEach((b) => b.opacity(lit && b.getAttr("edge") === lit ? 1 : 0.62));
      st.current.bgLayer.batchDraw();
    }
    const inside = t.x - t.hw >= t.left - 0.05 && t.x + t.hw <= t.left + t.pr.box.w + 0.05 && t.y - t.hh >= t.pr.box.down - 0.05 && t.y + t.hh <= t.pr.box.down + t.pr.box.h + 0.05;
    const next = patchFrom(g);
    if (inside) props.onLive?.(t.pr.key, t.pr.elements.map((e) => (String(e.id) === g.id() ? next : e)));
  }
  function quiet() {
    const { tag, guides, framesG, uiLayer, bgLayer, props } = st.current;
    tag.visible(false);
    (guides || []).forEach((l) => l.visible(false));
    st.current.lit = null;
    st.current.rules = null;
    drawBands(props.view.limit);
    (st.current.bands || []).forEach((b) => b.opacity(0.62));
    if (props.narrow) framesG.visible(false);
    if (st.current.saidWorn) st.current.toldWorn = true;
    say(hint());
    bgLayer.batchDraw();
    uiLayer.batchDraw();
  }
  function letGo(g) {
    const t = thingAt(g);
    const kept = keepThing(t, rulesOf(g, t).limit, areaOf(g));
    putAt(g, t, kept.x, kept.y);
    quiet();
    const next = patchFrom(g);
    if (next) st.current.props.onDrop(next);
  }
  // the "no print" bands: up to where a thing's own outline may go (its print's box adds 0.5 cm round it)
  function drawBands(L) {
    const { bands, props } = st.current;
    if (!bands || st.current.bandsFor === L) return;
    st.current.bandsFor = L;
    const v = props.view;
    const top = -v.above - 1;
    const rects = [
      [0, top, v.w, L.y0 - top],
      [0, L.y1, v.w, v.len + 1 - L.y1],
      [-1, L.y0, L.x0 + 1, L.y1 - L.y0],
      [L.x1, L.y0, v.w + 1 - L.x1, L.y1 - L.y0],
    ];
    bands.forEach((b, i) => {
      const [x, y, w, h] = rects[i];
      b.setAttrs({ x, y, width: Math.max(0, w), height: Math.max(0, h) });
    });
    st.current.bgLayer.batchDraw();
  }

  /* ---------- the tee: (re)built when the side, the size or the colour changes ---------- */
  useEffect(() => {
    const s = st.current;
    const { stage, bg, framesG, bgLayer } = s;
    if (!stage) return;
    stage.size({ width: cw, height: ch });
    const v = view;
    const sleeve = v.side === "left" || v.side === "right";
    const dark = lum(fabric) < 0.5;

    // the side's shape: its body (with the neck curve and a strip of shoulder above the collar seam) or the sleeve
    bg.destroyChildren();
    const outline = (ctx) => {
      if (sleeve) {
        ctx.rect(0, 0, v.w, v.len);
        return;
      }
      const a = v.above;
      const n = v.neckHalf;
      ctx.moveTo(0, -a);
      ctx.lineTo(v.w / 2 - n, -a);
      ctx.bezierCurveTo(v.w / 2 - n, -a * 0.15, v.w / 2 - n * 0.55, 0, v.w / 2, 0);
      ctx.bezierCurveTo(v.w / 2 + n * 0.55, 0, v.w / 2 + n, -a * 0.15, v.w / 2 + n, -a);
      ctx.lineTo(v.w, -a);
      ctx.lineTo(v.w, v.len);
      ctx.lineTo(0, v.len);
      ctx.closePath();
    };
    s.outline = new Konva.Shape({
      sceneFunc: (ctx, shape) => {
        ctx.beginPath();
        outline(ctx);
        ctx.fillStrokeShape(shape);
      },
      fill: fabric,
      stroke: dark ? "rgba(255,255,255,.28)" : "rgba(20,17,16,.22)",
      strokeWidth: 1,
      strokeScaleEnabled: false,
      shadowColor: "rgba(20,17,16,.35)",
      shadowBlur: 14,
      shadowOffsetY: 4,
      shadowOpacity: 0.45,
      // (no stage-size buffer canvas for the shadow: fill and stroke are drawn straight, the shadow on the fill only)
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
    });
    bg.add(s.outline);
    // "no print" bands (drawBands sets their size)
    const pattern = hatch(dark);
    const bandsG = new Konva.Group({ clipFunc: (ctx) => outline(ctx) });
    const bandRects = ["collar", "hem", "side", "side"].map((edge) => new Konva.Rect({ fillPatternImage: pattern, fillPatternRepeat: "repeat", opacity: 0.62, edge, perfectDrawEnabled: false }));
    bandsG.add(...bandRects);
    bg.add(bandsG);
    bg.add(new Konva.Line({ points: [v.w / 2, -v.above, v.w / 2, v.len], stroke: dark ? "rgba(246,223,160,.32)" : "rgba(140,106,31,.32)", strokeWidth: 1, dash: [4, 6], strokeScaleEnabled: false }));
    s.bands = bandRects;
    s.pattern = pattern;
    s.bandsFor = null;
    drawBands(s.rules?.limit || v.limit);

    // the print areas this tee offers on this side: faint dashed frames (phones: only while dragging)
    framesG.destroyChildren();
    for (const f of frames) {
      framesG.add(new Konva.Rect({ x: boxLeft(v.side, v.w, f.box), y: f.box.down, width: f.box.w, height: f.box.h, stroke: dark ? "rgba(246,223,160,.45)" : "rgba(140,106,31,.5)", strokeWidth: 1, dash: [5, 4], strokeScaleEnabled: false }));
    }
    framesG.visible(!narrow);
    applyView();
    bgLayer.batchDraw();
  }, [view, frames, fabric, narrow, cw, ch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the prints: (re)built when the design changes ---------- */
  useEffect(() => {
    const s = st.current;
    const { stage, printsG, over, tr } = s;
    if (!stage) return undefined;
    const v = view;

    // the open print's box, and the snap guides (with strokeScaleEnabled off, Konva draws dashes in screen px)
    over.destroyChildren();
    s.selBox = new Konva.Rect({ stroke: "#C9A24B", strokeWidth: 1.5, dash: [7, 5], strokeScaleEnabled: false, visible: false });
    s.guides = [0, 1].map(() => new Konva.Line({ points: [0, 0, 0, 0], stroke: "#C9A24B", strokeWidth: 1.5, dash: [6, 6], strokeScaleEnabled: false, visible: false }));
    over.add(s.selBox, ...s.guides);

    let alive = true;
    const draw = () => {
      if (!alive) return;
      printsG.destroyChildren();
      s.groups = new Map();
      s.printOf = new Map();
      for (const pr of prints) {
        // (a print area's things are cut at its edge, as the 3D tee and the print file cut them; a free place's box is
        // made round its things)
        const pg = new Konva.Group({ x: boxLeft(v.side, v.w, pr.box), y: pr.box.down, scaleX: pr.box.w / pr.W, scaleY: pr.box.h / pr.H, name: "print", ...(pr.spot ? {} : { clipX: 0, clipY: 0, clipWidth: pr.W, clipHeight: pr.H, cut: true }) });
        pg.on("mouseenter", () => st.current.props.onHover?.(pr.key));
        pg.on("mouseleave", () => st.current.props.onHover?.(null));
        printsG.add(pg);
        const byId = buildNodes(pg, pr.elements, pr.W, pr.H);
        byId.forEach((g, id) => {
          // a shop collection's locked logo (`fixed`, the GTA tees, 23 Nov 2026): drawn, but not picked or moved
          if (pr.elements.some((e) => String(e.id) === String(id) && e.fixed)) {
            g.listening(false);
            return;
          }
          s.groups.set(id, g);
          s.printOf.set(id, pr);
          g.draggable(true);
          g.dragDistance(PAD_PX);
          g.on("pointerdown", (e) => {
            // (a second finger only zooms: it never changes what is selected)
            if (e.evt && e.evt.isPrimary === false) return;
            // (two fingers resize the thing only when the first came down on the thing already selected)
            st.current.downOn = String(st.current.props.selectedId) === id ? id : null;
            st.current.props.onSelect(id);
          });
          g.on("dragstart", () => {
            // (two fingers on the panel: a drag Konva starts for either finger is called off — onTouchStart)
            if (st.current.pinch || st.current.pinching) {
              g.stopDrag();
              return;
            }
            offerRef.current(null);
            st.current.putAt = null;
            st.current.dragArea = areaOf(g);
            lift(g);
            pickRules(g);
            if (st.current.props.narrow) st.current.framesG.visible(true);
            st.current.bgLayer.batchDraw();
          });
          g.on("dragmove", () => {
            if (st.current.pinching) return;
            // (a mouse sends each move twice and Konva leaves the second one where it was put: nothing new to show)
            const was = st.current.putAt;
            if (was && was.x === g.x() && was.y === g.y()) return;
            const { props, guides, tag, uiLayer } = st.current;
            const t = thingAt(g);
            // snap (from where the pointer has it, so moving further breaks it), then keep it inside the limit
            const snap = snapDrag(t, props.lines);
            const kept = keepThing({ ...t, x: snap.x, y: snap.y }, (st.current.rules || rulesOf(g, t)).limit, st.current.dragArea);
            putAt(g, t, kept.x, kept.y);
            const shown = snap.guides.filter((gd) => (gd.dir === "v" ? kept.x === snap.x : kept.y === snap.y));
            guides.forEach((line, i) => {
              const gd = shown[i];
              line.visible(!!gd);
              if (gd) line.points(gd.dir === "v" ? [gd.at, -props.view.above, gd.at, props.view.len] : [0, gd.at, props.view.w, gd.at]);
            });
            if (shown.length && snap.tag) {
              const p = st.current.vw.getAbsoluteTransform().point({ x: kept.x + t.hw, y: kept.y - t.hh });
              tag.getText().text(snap.tag);
              tag.position({ x: Math.min(props.cw - tag.width() - 4, p.x + 6), y: Math.max(2, p.y - tag.height() - 4) });
              tag.visible(true);
            } else tag.visible(false);
            follow(g, { hit: kept.hit[0] || null });
            uiLayer.batchDraw();
            st.current.putAt = { x: g.x(), y: g.y() };
          });
          g.on("dragend", () => {
            if (st.current.pinching) return; // (two fingers took over: they commit once, when they let go)
            letGo(g);
          });
          g.on("transformstart", () => {
            lift(g);
            pickRules(g);
          });
          g.on("transform", () => follow(g, { big: st.current.capped, hit: st.current.trHit }));
          g.on("transformend", () => {
            st.current.capped = null;
            st.current.trHit = null;
            letGo(g);
          });
          g.on("dblclick dbltap", () => st.current.props.onEdit?.(id));
        });
      }
      s.layer.batchDraw();
      select();
    };
    draw();
    // redraw once pictures and fonts are ready (only when something was still loading, as AreaEditor.jsx)
    const all = prints.flatMap((p) => p.elements);
    const waiting = imageSrcs(all).filter((src) => !cachedImage(src));
    if (waiting.length) Promise.allSettled(waiting.map((src) => loadImage(src))).then(draw);
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(draw);
    // Resizing and turning stop at the safe zone and at the biggest print (less the 0.5 cm its box adds round it), so the
    // label always says where the thing will land (15 Nov 2026 review: it went into the bands and jumped back when let
    // go). A thing already past a line (in a print area that reaches past it) may still be made smaller.
    tr.boundBoxFunc((oldBox, newBox) => {
      const g = st.current.selGroup;
      if (!g || !st.current.printOf.get(g.id())) return newBox;
      const scale = geo().k * st.current.vs.z;
      const t = thingAt(g);
      const f = Math.abs(newBox.width) / Math.max(1e-9, Math.abs(oldBox.width));
      const c0 = boxMiddle(oldBox);
      const c1 = boxMiddle(newBox);
      const rot = (newBox.rotation * 180) / Math.PI;
      const w = t.w * f;
      const h = t.h * f;
      if (w < 0.4 || h < 0.4) return oldBox;
      const next = { ...t, x: t.x + (c1.x - c0.x) / scale, y: t.y + (c1.y - c0.y) / scale, w, h, rot, ...extentOf({ w, h, rot }) };
      const r = rulesOf(g, next);
      const area = areaOf(g);
      const inArea = area && overBy(next, area) < 1e-6;
      const tooBig = (x) => 2 * x.hw > r.maxW - 1 + 0.01 || 2 * x.hh > r.maxH - 1 + 0.01;
      if (!inArea && tooBig(next) && (next.hw > t.hw + 1e-6 || next.hh > t.hh + 1e-6)) {
        st.current.capped = [r.maxW, r.maxH];
        return oldBox;
      }
      const over = (x) => Math.min(overBy(x, r.limit), area ? overBy(x, area) : Infinity);
      if (over(next) > over(t) + 1e-6) {
        st.current.trHit = lineHit(next, r.limit);
        return oldBox;
      }
      st.current.capped = null;
      st.current.trHit = null;
      return newBox;
    });
    return () => {
      alive = false;
    };
  }, [view, prints, cw, ch]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new side (or a new size): the whole side in view
  useEffect(() => {
    setView(wholeView(geo()));
    say(hint());
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the selection: only the handles and the open print's box change ---------- */
  function select() {
    const { tr, selBox, groups, uiLayer, props } = st.current;
    if (!tr) return;
    const sel = props.selectedId != null ? groups.get(String(props.selectedId)) : null;
    st.current.selGroup = sel || null;
    tr.nodes(sel ? [sel] : []);
    const pr = openPrint();
    if (selBox) {
      selBox.visible(!!pr);
      if (pr) selBox.setAttrs({ x: boxLeft(props.view.side, props.view.w, pr.box), y: pr.box.down, width: pr.box.w, height: pr.box.h });
    }
    placeNameTab();
    uiLayer.batchDraw();
  }
  useEffect(select, [selectedId, activeKey, prints, openBox]); // eslint-disable-line react-hooks/exhaustive-deps

  // after a nudge (the prints are drawn again by then): the label says where the thing is now, for a moment
  useEffect(() => {
    const g = st.current.selGroup;
    if (!nudged || !g) return undefined;
    const v = st.current.props.view;
    say(liveLabel({ side: v.side, box: labelBox(thingAt(g), v.side, v.w) }));
    const t = setTimeout(() => say(hint()), 1600);
    return () => clearTimeout(t);
  }, [nudged]); // eslint-disable-line react-hooks/exhaustive-deps

  // the box (panel cm) of the selected thing, or of the open print
  const focusBox = (g) => {
    if (g) {
      const t = thingAt(g);
      return { x0: t.x - t.hw, y0: t.y - t.hh, x1: t.x + t.hw, y1: t.y + t.hh };
    }
    const pr = openPrint();
    if (!pr) return null;
    const x0 = boxLeft(st.current.props.view.side, st.current.props.view.w, pr.box);
    return { x0, y0: pr.box.down, x1: x0 + pr.box.w, y1: pr.box.down + pr.box.h };
  };
  useImperativeHandle(ref, () => ({
    // "Zoom in": the selected thing (or the open print) to 60 % of the canvas
    zoomToSelected() {
      const box = focusBox(st.current.selGroup);
      if (box) setView(zoomToBox(geo(), box));
    },
    // a thing just added: zoomed to when it is so small on screen that its handles and name tab would cover it
    zoomIfSmall(id) {
      const g = st.current.groups.get(String(id));
      if (!g) return;
      const r = g.getClientRect();
      if (r.width >= SMALL_PX && r.height >= SMALL_PX) return;
      setView(zoomToBox(geo(), focusBox(g)));
    },
    // "Whole front": back to the whole side
    wholeSide() {
      setView(wholeView(geo()));
    },
  }));

  const [cl, cr] = CORNERS[view.side] || ["", ""];
  return (
    <div className="dr-panel" style={{ width: cw }}>
      <div className="dr-panelchip" role="status" ref={chip}>
        {hint()}
      </div>
      <div ref={holder} className="dr-panelcanvas" style={{ width: cw, height: ch }} />
      <span className="dr-panelcorner l" aria-hidden="true">{cl}</span>
      <span className="dr-panelcorner r" aria-hidden="true">{cr}</span>
      {children}
      {offer && (
        <button
          type="button"
          className="dr-newhere"
          style={{ left: offer.left, top: offer.top + 30 }}
          onClick={() => {
            setOffer(null);
            onNewHere?.({ x: offer.x, y: offer.y, across: acrossAt(view.side, view.w, offer.x) });
          }}
        >
          + New print here
        </button>
      )}
    </div>
  );
});

export default PanelEditor;
