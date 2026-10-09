// studio/AreaEditor.jsx
//
// The flat, true-to-size editor for one print area (Konva). Drag to move,
// corner handles to resize (keeps proportions), top handle to rotate,
// two fingers to pinch / rotate on phones, arrows to nudge. Snaps to the
// centre line. Changes are committed when a gesture ends; while dragging,
// onLive keeps the 3D tee in sync.
import { useEffect, useRef } from "react";
import Konva from "konva";
import { buildNodes, loadImage, imageSrcs } from "./konvaRender";

const SNAP_PX = 10; // in print-area pixels

// Group (centre-based) → stored box in % (top-left, unrotated)
function boxFromGroup(g, W, H) {
  const w = g.getAttr("boxW") * g.scaleX();
  const h = g.getAttr("boxH") * g.scaleY();
  return { x: ((g.x() - w / 2) / W) * 100, y: ((g.y() - h / 2) / H) * 100, width: (w / W) * 100, height: (h / H) * 100 };
}

export default function AreaEditor({ elements, W, H, fabric, selectedId, onSelect, onCommit, onLive, displayWidth = 300 }) {
  const holder = useRef(null);
  const st = useRef({}); // konva objects + latest props for handlers
  st.current.props = { elements, W, H, onSelect, onCommit, onLive, selectedId };

  // create the stage once
  useEffect(() => {
    const stage = new Konva.Stage({ container: holder.current, width: 10, height: 10 });
    const bg = new Konva.Layer({ listening: false });
    const layer = new Konva.Layer();
    const ui = new Konva.Layer();
    stage.add(bg, layer, ui);
    const tr = new Konva.Transformer({
      keepRatio: true,
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      rotateAnchorOffset: 28,
      anchorSize: 14,
      anchorCornerRadius: 7,
      anchorStroke: "#8C6A1F",
      anchorFill: "#FFFFFF",
      borderStroke: "#C9A24B",
      borderDash: [8, 6],
      rotationSnaps: [0, 90, 180, 270],
      ignoreStroke: true,
    });
    // guides stay thin however much a small area is zoomed in
    const guide = new Konva.Line({ points: [0, 0, 0, 0], stroke: "#C9A24B", strokeWidth: 1.5, dash: [6, 6], strokeScaleEnabled: false, visible: false });
    ui.add(tr, guide);
    st.current = { ...st.current, stage, bg, layer, ui, tr, guide };

    // tap on empty space → deselect
    stage.on("pointerdown", (e) => {
      if (e.target === stage) st.current.props.onSelect(null);
    });

    // two-finger pinch / rotate on the selected element
    let pinch = null;
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ang = (a, b) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
    const onTouchMove = (e) => {
      const g = st.current.selGroup;
      if (e.touches.length !== 2 || !g) return;
      e.preventDefault();
      const [a, b] = e.touches;
      if (!pinch) {
        g.stopDrag();
        pinch = { d0: dist(a, b), a0: ang(a, b), s0: g.scaleX(), r0: g.rotation() };
        return;
      }
      const s = Math.max(0.15, Math.min(8, pinch.s0 * (dist(a, b) / pinch.d0)));
      g.scale({ x: s, y: s });
      g.rotation(pinch.r0 + ((ang(a, b) - pinch.a0) * 180) / Math.PI);
      st.current.tr.forceUpdate();
      liveFrom(g);
    };
    const onTouchEnd = (e) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        if (st.current.selGroup) commitFrom(st.current.selGroup);
      }
    };
    const el = holder.current;
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      stage.destroy();
    };
    // the handlers read the latest props from st.current, so this runs once
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // element patch from a moved / scaled group
  function patchFrom(g) {
    const { elements: els, W: w, H: h } = st.current.props;
    const el = els.find((e) => String(e.id) === g.id());
    if (!el) return null;
    const box = boxFromGroup(g, w, h);
    const patch = { ...box, rotation: Math.round(g.rotation()) };
    if (el.type === "text") patch.fontSizePct = Math.max(1, Math.min(100, (el.fontSizePct || 15) * g.scaleX()));
    return { ...el, ...patch };
  }
  function liveFrom(g) {
    const next = patchFrom(g);
    if (!next) return;
    const { elements: els, onLive: live } = st.current.props;
    live?.(els.map((e) => (e.id === next.id ? next : e)));
  }
  function commitFrom(g) {
    const next = patchFrom(g);
    if (!next) return;
    const { elements: els, onCommit: commit } = st.current.props;
    commit(els.map((e) => (e.id === next.id ? next : e)));
  }

  // (re)build whenever the design, size or colour changes
  useEffect(() => {
    const { stage, bg, layer, tr, guide } = st.current;
    if (!stage) return;
    const scale = displayWidth / W;
    stage.size({ width: Math.round(W * scale), height: Math.round(H * scale) });
    stage.scale({ x: scale, y: scale });

    bg.destroyChildren();
    bg.add(new Konva.Rect({ width: W, height: H, fill: fabric }));
    bg.add(new Konva.Line({ points: [W / 2, 0, W / 2, H], stroke: "rgba(201,162,75,.35)", strokeWidth: 1, dash: [4 / scale, 6 / scale], strokeScaleEnabled: false }));
    bg.draw();

    let alive = true;
    const draw = () => {
      if (!alive) return;
      layer.destroyChildren();
      const byId = buildNodes(layer, elements, W, H);
      byId.forEach((g) => {
        g.draggable(true);
        g.on("pointerdown", () => st.current.props.onSelect(g.id()));
        g.on("dragmove", () => {
          // keep the centre inside the print area; snap to the centre line
          g.x(Math.max(0, Math.min(W, g.x())));
          g.y(Math.max(0, Math.min(H, g.y())));
          const snapped = Math.abs(g.x() - W / 2) < SNAP_PX;
          if (snapped) g.x(W / 2);
          guide.points([W / 2, 0, W / 2, H]);
          guide.visible(snapped);
          liveFrom(g);
        });
        g.on("dragend", () => {
          guide.visible(false);
          commitFrom(g);
        });
        g.on("transform", () => liveFrom(g));
        g.on("transformend", () => commitFrom(g));
      });
      const sel = selectedId != null ? byId.get(String(selectedId)) : null;
      st.current.selGroup = sel || null;
      tr.nodes(sel ? [sel] : []);
      layer.draw();
      st.current.ui.draw();
    };
    draw();
    // redraw once pictures and fonts are ready
    Promise.allSettled(imageSrcs(elements).map(loadImage)).then(draw);
    document.fonts?.ready.then(draw);
    return () => {
      alive = false;
    };
  }, [elements, W, H, fabric, selectedId, displayWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={holder} className="dr-flat" style={{ width: displayWidth, aspectRatio: `${W} / ${H}` }} />;
}
