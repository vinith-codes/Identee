// Admin → Shop your IDENTEE → Studio: the room (25 Oct 2026).
//
// The admin designs ONE tee by hand here, with the customer design room's engine (studio/*): the 3D tee, the true
// print areas, the flat true-to-size editor and the text tools. The picture assistant at the side makes AI pictures
// on request (PictureAssistant.jsx) and the admin places each one. Review takes the four mockup pictures; Publish
// saves the tee as a ReadyDesign and puts it in Shop your IDENTEE (sold print on demand).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Room3D from "../../../studio/Room3D";
import AreaEditor from "../../../studio/AreaEditor";
import AreaThumb from "../../../studio/AreaThumb";
import MockupCamera from "../../../studio/MockupCamera";
import WaitCard from "../../../studio/WaitCard";
import { AreaRenderer, cachedImage, imageSrcs, loadImage, measureText, printThumb } from "../../../studio/konvaRender";
import { areaCm, blockersOf, clashesIn, modelForGarment, placeArea } from "../../../studio/teeModel";
import { areaPx as areaPxOf } from "../../../studio/designFinish";
import { checkDesign } from "../../../studio/designCheck";
import { addStudioFonts, fontsReady } from "../../../studio/fonts";
import customizationService from "../../../services/customizationService";
import studioService from "../../../services/studioService";
import { shopHref } from "../../../utils/siteUrls";
import { imageUrl } from "../../../utils/imageUrl";
import { AddTabs, AiPicturesTab, ArtPicker, Controls, LayersPanel, TextTab, UploadTab } from "./StudioControls";
import PlacePicker from "./PlacePicker";
import { ICON_ADD, ICON_AI, ICON_AREAS, isNarrow, writeDraft } from "./studioBits";
import PictureAssistant from "./PictureAssistant";
import { DTF_RULES, dtfFixes, dtfIssues, softPictures } from "./studioCheck";
import { PICTURES_CHANGED } from "../../../studio/pictureHelpers";
import "../../../studio/designRoom.css";
import "./studio.css";

const SIDES = [["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"]];
const AREA_GROUPS = [
  ["Front", ["front"]],
  ["Back", ["back"]],
  ["Sleeves", ["left", "right"]],
];
const groupOfSide = (side) => AREA_GROUPS.find(([, sides]) => sides.includes(side))?.[0] || "Front";
const SHOWROOM = { position: [0, 0.8, 6.5], look: [0, 0.55, 0] };
let reqSeq = 0;
const nextReq = () => ++reqSeq;
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
// a saved tee comes back without the items' ids (the server drops them): every item gets one here
const withIds = (list) => (list || []).map((e, i) => (e.id ? e : { ...e, id: `s${i}${makeId()}` }));
const lum = (hex) => {
  const n = parseInt(String(hex || "#000000").slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const rupees = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN")}`;
const apiError = (err) => err?.response?.data?.message || err?.message || "Something went wrong. Please try again.";

// setup: GET /api/studio/setup · garment: one of its garments · colourSlug · design: a saved Studio tee (or null)
// onLeave(design | null): back to the Studio page (with the tee as last saved)
export default function StudioRoom({ setup, garment, colourSlug: firstColour, design: firstDesign, draft, onLeave }) {
  const positions = useMemo(() => garment.positions.filter((p) => p.side !== "shorts"), [garment]);
  const model = useMemo(() => modelForGarment(garment), [garment]);
  const [colourSlug, setColourSlug] = useState(draft?.colour || firstDesign?.color || firstColour);
  const colour = garment.colours.find((c) => c.slug === colourSlug) || garment.colours[0];
  const fabricHex = colour?.hex || "#1C1C1D";
  const inkDefault = lum(fabricHex) < 0.55 ? "#FFFFFF" : "#141110";
  const [size, setSize] = useState(draft?.size || firstDesign?.size || "M");
  const sizes = garment.sizes?.length ? garment.sizes : ["S", "M", "L", "XL"];
  const lengthCm = ((garment.sizeChart || []).find((r) => r.size === size)?.length || 30) * 2.54;
  const [narrow, setNarrow] = useState(isNarrow);
  useEffect(() => {
    const on = () => setNarrow(isNarrow());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  useEffect(() => {
    addStudioFonts();
  }, []);

  /* ---------- the design, with Undo / Redo ---------- */
  const [elements, setElements] = useState(() => withIds(draft?.elements || firstDesign?.elements || []));
  const elRef = useRef(elements); // the latest design, for commit / undo / redo (kept in step below)
  useEffect(() => {
    elRef.current = elements;
  }, [elements]);
  const hist = useRef({ past: [], future: [], soft: null });
  const [histSize, setHistSize] = useState({ past: 0, future: 0 });
  const commit = (updater, { soft } = {}) => {
    const prev = elRef.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    if (next === prev) return;
    const h = hist.current;
    if (!(soft && h.soft === soft)) h.past = [...h.past.slice(-49), prev];
    h.soft = soft || null;
    h.future = [];
    elRef.current = next;
    setElements(next);
    setHistSize({ past: h.past.length, future: 0 });
    setSavedAt(null);
  };
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(elRef.current);
    const prev = h.past.pop();
    h.soft = null;
    elRef.current = prev;
    setElements(prev);
    setHistSize({ past: h.past.length, future: h.future.length });
    setSelectedId(null);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(elRef.current);
    const next = h.future.pop();
    h.soft = null;
    elRef.current = next;
    setElements(next);
    setHistSize({ past: h.past.length, future: h.future.length });
    setSelectedId(null);
  };

  const [step, setStep] = useState("design"); // design | review
  const [active, setActive] = useState(null); // the print area being edited
  const [selectedId, setSelectedId] = useState(null);
  const [live, setLive] = useState(null);
  const [textures, setTextures] = useState({});
  const [camRequest, setCamRequest] = useState({ view: "front", n: nextReq() });
  const [areaTab, setAreaTab] = useState("Front");
  const [areasOpen, setAreasOpen] = useState(false); // phones: the "Where to print" sheet
  const [addTab, setAddTab] = useState("text");
  const [assist, setAssist] = useState(() => !isNarrow() && !(draft?.elements || firstDesign?.elements || []).length); // the picture assistant panel
  const [hoverKey, setHoverKey] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [lit, setLit] = useState(false);
  const [spin, setSpin] = useState(false);
  const [sideShown, setSideShown] = useState(null);
  const [shots, setShots] = useState(null); // review: the four mockup pictures (data URLs)
  const [job, setJob] = useState(null); // the off-screen mockup camera's job
  const [issues, setIssues] = useState([]);
  const [changing, setChanging] = useState(false); // "change this picture" in progress
  const [rulesOpen, setRulesOpen] = useState(false); // Review: the DTF print rules
  const [versionsOpen, setVersionsOpen] = useState(false); // the earlier saves of this tee
  const [results, setResults] = useState(() => draft?.results || []); // the assistant's pictures, this room
  const [placing, setPlacing] = useState(null); // the AI picture being placed ("Where should it go?")
  const [designDoc, setDesignDoc] = useState(firstDesign || null);
  const [name, setName] = useState(draft?.name || firstDesign?.name || "");
  const [blurb, setBlurb] = useState(draft?.blurb || firstDesign?.blurb || "");
  // the details before publishing (26 Oct 2026): category, sizes and colours on sale, a price of its own
  const [category, setCategory] = useState(draft?.category ?? firstDesign?.category ?? "");
  const [sizesOn, setSizesOn] = useState(() => draft?.sizes || (firstDesign?.sizes?.length ? firstDesign.sizes : null));
  const [coloursOn, setColoursOn] = useState(() => draft?.coloursOn || (firstDesign?.colours?.length ? firstDesign.colours.map((c) => c.slug) : null));
  const [priceInr, setPriceInr] = useState(draft?.priceInr ?? (firstDesign?.priceInr || "") ?? "");
  // the product details the shop needs (the same as Add a product), with sensible defaults
  const [product, setProduct] = useState(() => ({ style: "", description: "", gender: garment.wearers?.length === 1 ? (garment.wearers[0] === "woman" ? "Women" : "Men") : "Unisex", fabric: "100% Cotton", oldPrice: "", subcategory: "", sku: "", hsnCode: "6109", ageRange: "Adult", type: "Casual", washCare: ["Machine wash cold", "Do not bleach", "Iron on low heat"], featured: false, shipping: { weight: "", length: "", width: "", height: "" }, ...(firstDesign?.product || {}), ...(draft?.product || {}) }));
  const [moreOpen, setMoreOpen] = useState(false);
  const setP = (patch) => setProduct((cur) => ({ ...cur, ...patch }));
  const jobDone = useRef(null); // the off-screen mockup camera's resolver
  // model photos (a person wearing the tee): who, which sides, where
  const [photoWearers, setPhotoWearers] = useState(() => garment.wearers || ["man", "woman"]);
  const [photoSides, setPhotoSides] = useState(["front", "back"]);
  const [photoSetting, setPhotoSetting] = useState("studio");
  const [savedAt, setSavedAt] = useState(firstDesign ? new Date(firstDesign.updatedAt) : null);
  const roomApi = useRef(null);
  const fileRef = useRef(null);
  const renderers = useRef(new Map());
  const paintedEls = useRef(new Map());
  const lastSig = useRef(new Map());
  const toastTimer = useRef(null);

  const areaPx = useCallback((pos) => areaPxOf(pos, size), [size]);
  const activePos = positions.find((p) => p.key === active) || null;
  const sel = elements.find((e) => e.id === selectedId) || null;
  const usedKeys = [...new Set(elements.map((e) => e.position))];
  const clashes = clashesIn(positions, usedKeys);
  const spent = (designDoc?.costInr || 0) + results.filter((r) => !r.counted).reduce((s, r) => s + (r.cost || 0), 0);
  const inShop = designDoc?.status === "published"; // on sale: changes go live only through Review → Update in the shop

  // the tee being worked on survives a reload (and "Continue" on the Studio page)
  useEffect(() => {
    writeDraft({ garment: garment.key, colour: colourSlug, size, elements, results, name, blurb, category, sizes: sizesOn, coloursOn, priceInr, product, designId: designDoc?._id || null, at: Date.now() });
  }, [garment.key, colourSlug, size, elements, results, name, blurb, category, sizesOn, coloursOn, priceInr, product, designDoc]);

  /* ---------- the print areas' pictures (the 3D tee's decals) ---------- */
  useEffect(() => {
    let alive = true;
    const run = () => {
      const updates = {};
      for (const pos of positions) {
        const { W, H } = areaPx(pos);
        let entry = renderers.current.get(pos.key);
        if (!entry || entry.W !== W || entry.H !== H) {
          entry?.r.destroy();
          entry = { r: new AreaRenderer(W, H), W, H };
          renderers.current.set(pos.key, entry);
        }
        const els = live?.key === pos.key ? live.elements : elements.filter((e) => e.position === pos.key);
        paintedEls.current.set(pos.key, els);
        const outline = active === pos.key;
        const sig = JSON.stringify([W, H, outline, els, [...document.fonts].filter((f) => f.status === "loaded").length]);
        if (lastSig.current.get(pos.key) === sig && textures[pos.key]) continue;
        lastSig.current.set(pos.key, sig);
        if (!els.length && !outline) {
          updates[pos.key] = { canvas: null, version: nextReq() };
          continue;
        }
        updates[pos.key] = { canvas: entry.r.render(els, { outline }), version: nextReq() };
      }
      if (alive && Object.keys(updates).length) setTextures((t) => ({ ...t, ...updates }));
    };
    run();
    const waiting = imageSrcs(live ? [...elements, ...live.elements] : elements).filter((src) => !cachedImage(src));
    if (waiting.length) {
      Promise.allSettled(waiting.map((src) => loadImage(src))).then(() => {
        lastSig.current.clear();
        if (alive) run();
      });
    }
    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(() => {
        if (alive) run();
      });
    }
    return () => {
      alive = false;
    };
  }, [positions, elements, live, active, areaPx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => renderers.current.forEach((e) => e.r.destroy()), []);

  const spots = useMemo(() => (model ? Object.fromEntries(positions.map((pos) => [pos.key, placeArea(model, pos, size, lengthCm)])) : {}), [model, positions, size, lengthCm]);
  const areas3D = useMemo(
    () => positions.filter((pos) => spots[pos.key]).map((pos) => ({ key: pos.key, spot: spots[pos.key], spotKey: `${size}`, canvas: textures[pos.key]?.canvas || null, version: textures[pos.key]?.version || 0 })),
    [positions, spots, size, textures],
  );
  const usedSig = usedKeys.join();
  const hotspots = useMemo(() => {
    const used = usedSig ? usedSig.split(",") : [];
    return positions.filter((p) => spots[p.key] && (used.includes(p.key) || !blockersOf(p.key, positions, used).length)).map((p) => ({ key: p.key, spot: spots[p.key], main: !!p.main }));
  }, [positions, spots, usedSig]);
  const thumbSig = usedKeys.map((k) => `${k}:${textures[k]?.version || 0}`).join();
  const thumbs = useMemo(
    () => Object.fromEntries((thumbSig ? thumbSig.split(",") : []).map((kv) => kv.split(":")[0]).map((k) => [k, printThumb(textures[k]?.canvas)])),
    [thumbSig], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // while dragging, the 3D tee is updated at most once per screen frame
  const liveQueue = useRef(null);
  const queueLive = (key, els) => {
    const first = !liveQueue.current;
    liveQueue.current = { key, elements: els };
    if (first) {
      requestAnimationFrame(() => {
        const next = liveQueue.current;
        liveQueue.current = null;
        if (!next) return;
        const entry = renderers.current.get(next.key);
        if (entry && roomApi.current?.touch) {
          entry.r.render(next.elements, { outline: true });
          lastSig.current.delete(next.key);
          roomApi.current.touch(next.key);
        } else {
          setLive(next);
        }
      });
    }
  };
  const say = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  };

  /* ---------- areas ---------- */
  const openArea = (key, { force = false } = {}) => {
    const pos = positions.find((p) => p.key === key);
    if (!pos) return;
    const blockers = force || usedKeys.includes(key) ? [] : blockersOf(key, positions, usedKeys);
    if (blockers.length) return say(`${pos.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first to use ${pos.label}.`);
    setActive(key);
    setAreaTab(groupOfSide(pos.side));
    setHoverKey(null);
    setAreasOpen(false);
    if (narrow) setAssist(false);
    setSelectedId((cur) => (elements.some((e) => e.id === cur && e.position === key) ? cur : null));
    setCamRequest({ area: key, side: pos.side, sleeve: pos.side === "left" || pos.side === "right", narrow, overlayPx: 0, fill: 0.74, lift: 0.03, keep: true, n: nextReq() });
  };
  const closeArea = () => {
    setActive(null);
    setSelectedId(null);
    setLive(null);
  };
  const goView = (view) => {
    closeArea();
    setCamRequest({ view, n: nextReq() });
  };
  const ensureArea = () => {
    if (active) return positions.find((p) => p.key === active);
    const free = (p) => usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length;
    const main = positions.find((p) => p.side === "front" && p.main && free(p)) || positions.find((p) => p.side === "front" && free(p)) || positions.find(free) || positions[0];
    if (main) openArea(main.key);
    return main;
  };

  /* ---------- items ---------- */
  const addElement = (pos, el) => {
    // on top of everything already there (several pictures added in one go each get their own layer)
    const full = { id: makeId(), position: pos.key, side: pos.side, rotation: 0, ...el };
    commit((prev) => [...prev, { ...full, zIndex: el.zIndex ?? Math.max(0, ...prev.map((e) => e.zIndex || 0)) + 1 }]);
    setSelectedId(full.id);
    if (pos.key !== active) openArea(pos.key, { force: true });
    return full;
  };
  const textBox = (el, pos) => {
    const { W, H } = areaPx(pos);
    const m = measureText(el, H);
    const cx = (el.x ?? 50) + (el.width ?? 0) / 2;
    const cy = (el.y ?? 20) + (el.height ?? 0) / 2;
    const width = (m.w / W) * 100;
    const height = (m.h / H) * 100;
    return { ...el, width, height, x: cx - width / 2, y: cy - height / 2 };
  };
  const addText = (text, opts = {}) => {
    const pos = ensureArea();
    if (!pos) return;
    const base = { type: "text", text, fontFamily: "Anton", fontSizePct: opts.small ? 7 : 12, color: inkDefault, align: "center", effect: opts.effect || "straight", x: 50, y: 18 + (elements.filter((e) => e.position === pos.key).length % 4) * 18, width: 0, height: 0 };
    let el = textBox(base, pos);
    if (opts.vertical) {
      const { W, H } = areaPx(pos);
      const lengthPctOfHeight = ((el.width / 100) * W / H) * 100;
      if (lengthPctOfHeight > 90) el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / lengthPctOfHeight }, pos);
      el = { ...el, rotation: opts.vertical === "up" ? -90 : 90, x: 50 - el.width / 2, y: 50 - el.height / 2 };
    } else if (el.width > 90) {
      el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
    }
    addElement(pos, el);
  };
  // a wide picture on a tall, thin strip: turned on its side to run up the strip
  const turnedFit = (pos, natW, natH, fill = 92) => {
    const { W, H } = areaPx(pos);
    const shape = natW / natH;
    if (H / W < 2.5 || shape < 1.6) return null;
    const len = Math.min((fill / 100) * H, (fill / 100) * W * shape);
    const width = (len / W) * 100;
    const height = (len / shape / H) * 100;
    return { rotation: -90, width, height, x: 50 - width / 2, y: 50 - height / 2 };
  };
  // a picture fitted in a box of the area: fit % of the width and height, centred on (cx, cy) % of the area
  const fitted = (pos, natW, natH, { fitW = 92, fitH = 92, cx = 50, cy = 50 } = {}) => {
    const { W, H } = areaPx(pos);
    const shape = natW / natH;
    let width = fitW;
    let height = ((fitW / 100) * W) / shape / H * 100;
    if (height > fitH) {
      height = fitH;
      width = (((fitH / 100) * H * shape) / W) * 100;
    }
    return { width, height, x: cx - width / 2, y: cy - height / 2, rotation: 0 };
  };
  const addImage = (pos, src, natW, natH, extra = {}) => {
    const turned = turnedFit(pos, natW, natH, 80);
    const box = turned || fitted(pos, natW, natH, { fitW: 60, fitH: 90 });
    return addElement(pos, { type: "image", src, ...box, ...extra });
  };
  // an AI picture from the assistant, placed by its kind: a whole artwork fills the area, a title sits at the top,
  // a hero in the middle, a background behind everything, a logo small at the top
  // how: fill | big | top | middle | bottom | small (from the "Where should it go?" sheet); by its kind when not given.
  // replace: take the area's items off first.
  const placePicture = (pic, areaKey, how, replace = false) => {
    const pos = positions.find((p) => p.key === areaKey) || ensureArea();
    if (!pos) return;
    const used = replace ? usedKeys.filter((k) => k !== pos.key) : usedKeys;
    const blockers = used.includes(pos.key) ? [] : blockersOf(pos.key, positions, used);
    if (blockers.length) return say(`${pos.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first.`);
    const [wCm] = areaCm(pos, size);
    const extra = { pxW: pic.width };
    const way = how || { whole: "big", title: "top", hero: "middle", background: "fill", logo: "small" }[pic.kind] || "big";
    let box;
    if (way === "top") box = fitted(pos, pic.width, pic.height, { fitW: 90, fitH: 30, cx: 50, cy: 16 });
    else if (way === "middle") box = fitted(pos, pic.width, pic.height, { fitW: 80, fitH: 68, cx: 50, cy: 54 });
    else if (way === "bottom") box = fitted(pos, pic.width, pic.height, { fitW: 90, fitH: 30, cx: 50, cy: 84 });
    else if (way === "fill") box = { ...fitted(pos, pic.width, pic.height, { fitW: 100, fitH: 100 }), zIndex: Math.min(0, ...elements.map((e) => e.zIndex || 0)) - 1 };
    else if (way === "small") box = fitted(pos, pic.width, pic.height, { fitW: Math.min(40, (9 / wCm) * 100), fitH: 30, cx: 50, cy: 18 });
    else box = turnedFit(pos, pic.width, pic.height) || fitted(pos, pic.width, pic.height, { fitW: 92, fitH: 92 });
    if (replace) commit((prev) => prev.filter((e) => e.position !== pos.key));
    addElement(pos, { type: "image", src: pic.url, ...box, ...extra });
    setResults((cur) => cur.map((r) => (r.id === pic.id ? { ...r, used: true } : r)));
    setPlacing(null);
    say(`Added to ${pos.label}. Drag it to move; the corners resize it.`);
  };
  // the print areas for the "Where should it go?" sheet: free, with a design, or covered
  const placeGroups = () => {
    const said = (key) => {
      const on = elements.filter((e) => e.position === key);
      const text = on.find((e) => e.type === "text" && e.text)?.text;
      if (on.length > 1) return `${on.length} items`;
      return text ? `“${text.length > 14 ? `${text.slice(0, 13)}…` : text}”` : "a picture";
    };
    return AREA_GROUPS.map(([group, sides]) => [
      group,
      positions
        .filter((p) => sides.includes(p.side))
        .map((p) => {
          const { wCm, hCm } = areaPx(p);
          const blockers = usedKeys.includes(p.key) ? [] : blockersOf(p.key, positions, usedKeys).map((b) => b.label);
          return { key: p.key, label: p.label, cm: [Math.round(wCm), Math.round(hCm)], state: usedKeys.includes(p.key) ? "used" : blockers.length ? "blocked" : "free", has: usedKeys.includes(p.key) ? said(p.key) : "", blockers };
        }),
    ]).filter(([, areas]) => areas.length);
  };
  // a new picture from the assistant: it goes to the AI pictures tab (nothing lands on the tee by itself)
  const onNewResult = (r) => {
    setResults((cur) => (cur.some((x) => x.id === r.id) ? cur.map((x) => (x.id === r.id ? r : x)) : [r, ...cur]));
    if (!r.used) {
      setSelectedId(null);
      setAddTab("ai");
      if (!active) ensureArea();
    }
  };
  const updateSel = (patch, { measure = false } = {}) => {
    commit(
      (prev) =>
        prev.map((e) => {
          if (e.id !== selectedId) return e;
          const next = { ...e, ...patch };
          return measure && next.type === "text" ? textBox(next, positions.find((p) => p.key === e.position)) : next;
        }),
      { soft: `${selectedId}:${Object.keys(patch).sort().join()}` },
    );
  };
  const removeSel = () => {
    commit((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
    say("Deleted. Undo (↶) brings it back.");
  };
  const dupSel = () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    const copy = { ...el, id: makeId(), y: Math.min(95, (el.y || 0) + 8), zIndex: elements.length + 1 };
    commit((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };
  const layerSel = (dir) => {
    const zs = elements.map((e) => e.zIndex || 0);
    updateSel({ zIndex: dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1 });
  };
  // Step 2 (25 Oct 2026): line up in the area, reorder the layers, copy to another area, change a picture by prompt
  const alignSel = (how) => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    const w = el.width || 0;
    const h = el.height || 0;
    const patch = { left: { x: 0 }, centreX: { x: 50 - w / 2 }, right: { x: 100 - w }, top: { y: 0 }, centreY: { y: 50 - h / 2 }, bottom: { y: 100 - h } }[how];
    if (patch) updateSel(patch);
  };
  const moveLayer = (id, dir) => {
    const mine = elements.filter((e) => e.position === active).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const i = mine.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= mine.length) return;
    const order = mine.map((e) => e.id);
    [order[i], order[j]] = [order[j], order[i]];
    const z = Object.fromEntries(order.map((k, n) => [k, n + 1]));
    commit((prev) => prev.map((e) => (z[e.id] ? { ...e, zIndex: z[e.id] } : e)));
  };
  const copySel = (areaKey) => {
    const el = elements.find((e) => e.id === selectedId);
    const from = el && positions.find((p) => p.key === el.position);
    const to = positions.find((p) => p.key === areaKey);
    if (!el || !from || !to) return;
    const blockers = usedKeys.includes(to.key) ? [] : blockersOf(to.key, positions, usedKeys);
    if (blockers.length) return say(`${to.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first.`);
    const a = areaPx(from);
    const b = areaPx(to);
    // the same size in cm: the box is re-measured in the new area's pixels, then shrunk if the area is smaller
    let width = ((el.width || 0) * a.W) / b.W;
    let height = ((el.height || 0) * a.H) / b.H;
    const shrink = Math.min(1, 96 / Math.max(width, 1), 96 / Math.max(height, 1));
    width *= shrink;
    height *= shrink;
    let copy = { ...el, id: makeId(), position: to.key, side: to.side, zIndex: elements.length + 1, width, height, x: 50 - width / 2, y: 50 - height / 2 };
    if (el.type === "text") copy = textBox({ ...copy, fontSizePct: ((el.fontSizePct || 12) * a.H * shrink) / b.H }, to);
    commit((prev) => [...prev, copy]);
    say(`Copied to ${to.label}.`);
  };
  const changePicture = async (instruction, realPerson, done) => {
    const el = elements.find((e) => e.id === selectedId);
    const pos = el && positions.find((p) => p.key === el.position);
    if (!el || el.type !== "image" || !pos || changing) return;
    const kind = results.find((r) => r.url === el.src)?.kind || ((el.width || 0) >= 95 && (el.height || 0) >= 95 ? "background" : "whole");
    setChanging(true);
    try {
      const pic = await studioService.changePicture({ url: el.src, instruction, kind, realPerson, garment: garment.key, colour: colour.slug });
      const { W, H } = areaPx(pos);
      // the same width and middle as before; the height follows the new picture's shape
      const height = ((el.width || 0) * W * pic.height) / (pic.width * H);
      commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: pic.url, pxW: pic.width, height, y: (e.y || 0) + ((e.height || 0) - height) / 2 } : e)));
      setResults((cur) => [{ id: makeId(), ...pic, kind, prompt: `Change: ${instruction}`, look: "", area: pos.key, at: Date.now(), used: true }, ...cur]);
      done?.();
      window.dispatchEvent(new Event(PICTURES_CHANGED)); // it is in My pictures too
      say(`Changed (${pic.service === "grok" ? "Grok" : "Google"}, ₹${pic.cost}). Not right? Press Undo (↶).`);
    } catch (err) {
      say(apiError(err));
    } finally {
      setChanging(false);
    }
  };
  const removeBg = async () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el || el.type !== "image" || busy) return;
    setBusy("Removing the background…");
    try {
      const img = await loadImage(el.src, { full: true });
      const { removeBackground } = await import("../../../studio/removeBackground");
      const out = await removeBackground(img, (label) => setBusy(label));
      if (out.already) return say("This picture already has a see-through background.");
      if (out.needsServer) return say("This looks like a photo. Ask the assistant to draw it instead, or upload a cut-out PNG.");
      setBusy("Saving the cut-out…");
      const res = await customizationService.uploadDesignImage(new File([out.blob], "cut-out.png", { type: "image/png" }));
      commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: res.path, pxW: out.width } : e)));
      say("Background removed. Not right? Press Undo (↶).");
    } catch (err) {
      say(apiError(err));
    } finally {
      setBusy("");
    }
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const pos = positions.find((p) => p.key === active) || ensureArea();
    if (!file || !pos) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return say("Please choose a JPG, PNG or WebP image.");
    if (file.size > 10 * 1024 * 1024) return say("That image is over 10 MB. Please choose a smaller one.");
    let natW = 1000;
    let natH = 1000;
    try {
      const bmp = await createImageBitmap(file);
      natW = bmp.width;
      natH = bmp.height;
      bmp.close?.();
    } catch {
      // keep the defaults; the quality line just won't show
    }
    setBusy("Uploading the picture…");
    try {
      const res = await customizationService.uploadDesignImage(file);
      addImage(pos, res.path, natW, natH, { pxW: natW });
    } catch (err) {
      say(apiError(err));
    } finally {
      setBusy("");
    }
  };
  // a words part of a whole-tee plan: typed on its area at the top / middle / bottom, as wide as 90 % allows
  const addWords = (part, areaKey) => {
    const pos = positions.find((p) => p.key === areaKey) || ensureArea();
    if (!pos || !String(part.text || "").trim()) return;
    const blockers = usedKeys.includes(pos.key) ? [] : blockersOf(pos.key, positions, usedKeys);
    if (blockers.length) return say(`${pos.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first.`);
    const base = { type: "text", text: String(part.text).trim(), fontFamily: part.font || "Anton", fontSizePct: 10, color: inkDefault, align: "center", effect: "straight", x: 50, y: 0, width: 0, height: 0 };
    let el = textBox(base, pos);
    if (el.width > 90) el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
    const y = part.place === "top" ? 4 : part.place === "middle" ? 50 - el.height / 2 : 96 - el.height;
    addElement(pos, { ...el, x: 50 - el.width / 2, y, zIndex: elements.length + 20 });
  };
  // from the assistant's art search: on the chosen area, 60 % wide
  const placeArt = async (design, areaKey) => {
    const pos = positions.find((p) => p.key === areaKey) || ensureArea();
    if (!pos) return;
    const blockers = usedKeys.includes(pos.key) ? [] : blockersOf(pos.key, positions, usedKeys);
    if (blockers.length) return say(`${pos.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first.`);
    try {
      const img = await loadImage(design.imageUrl);
      addImage(pos, design.imageUrl, img.naturalWidth, img.naturalHeight, { artDesignId: design._id, artPrice: design.price || 0, pxW: img.naturalWidth });
      say(`Added “${design.name}” to ${pos.label}.`);
    } catch {
      say("That design could not be loaded.");
    }
  };
  const pickArt = async (design) => {
    const pos = positions.find((p) => p.key === active) || ensureArea();
    if (!pos) return;
    try {
      const img = await loadImage(design.imageUrl);
      addImage(pos, design.imageUrl, img.naturalWidth, img.naturalHeight, { artDesignId: design._id, artPrice: design.price || 0 });
    } catch {
      say("That design could not be loaded.");
    }
  };
  const changeColour = (slug) => {
    setColourSlug(slug);
    const hex = garment.colours.find((c) => c.slug === slug)?.hex;
    const faint = elements.filter((e) => e.type === "text" && Math.abs(lum(e.color) - lum(hex)) < 0.25);
    if (faint.length) say(`${faint.length === 1 ? "One text" : `${faint.length} texts`} may be hard to see on ${garment.colours.find((c) => c.slug === slug)?.name}. Pick a different ink colour.`);
  };

  /* ---------- review, save, publish ---------- */
  // a picture's width in px: as the assistant said, or the loaded picture's (a saved tee comes back without pxW), or its 4K copy's
  const withPx = (list) => list.map((e) => (e.type === "image" ? { ...e, pxW: Math.max(e.pxW || 0, e.printW || 0, cachedImage(e.src)?.naturalWidth || 0) || undefined } : e));
  // (elRef.current is the design as it is right now, even in the same tick as a change — Fix all relies on that)
  const designIssues = (list = elRef.current) => checkDesign(withPx(list), positions, { fabricHex, inkDefault, cmOf: (pos) => areaPx(pos), canEnlarge: false });
  const toReview = async () => {
    const list = elRef.current;
    if (!list.length) return say("Design the tee first — add a picture or some words to a print area.");
    if (clashes.length) return say(`${clashes[0][0].label} and ${clashes[0][1].label} overlap on the tee. Remove the print from one of them to continue.`);
    closeArea();
    setAssist(false);
    setAreasOpen(false);
    setIssues([...designIssues(list).map((i) => i.text), ...dtfIssues(list, positions, { size, results })]);
    setStep("review");
    setSpin(true);
    setSideShown(null);
    setShots(null);
    setCamRequest({ ...SHOWROOM, n: nextReq() });
    await fontsReady(list);
    // the four mockup pictures come from an off-screen 4:5 camera (no black bars whatever the screen's shape)
    // (the off-screen 3D view sometimes isn't ready the first time: one more try before giving up)
    const pictures = (await takeMockups(fabricHex)) || (await takeMockups(fabricHex));
    if (!pictures) return say("The 3D pictures couldn't be taken. Go back to the design and press Review again.");
    setShots(SIDES.map(([v, label]) => ({ key: v, label, url: pictures[v] })));
  };
  // the four pictures of the tee in one colour (the design as it is now)
  const takeMockups = (colourHex) =>
    new Promise((resolve) => {
      jobDone.current = resolve;
      setJob({ id: `job${nextReq()}`, garment, positions, size, colourHex, elements: elRef.current });
    });
  const onShots = (pictures) => {
    setJob(null);
    const done = jobDone.current;
    jobDone.current = null;
    done?.(pictures);
  };
  // what is still missing before the tee can go into the shop
  const sizesChosen = sizesOn || sizes;
  const coloursChosen = [...new Set([colour.slug, ...(coloursOn || [])])].filter((s) => garment.colours.some((c) => c.slug === s));
  const catNow = (setup.categories || []).find((c) => c.slug === category);
  const styleOk = !!product.style && (!catNow || !catNow.styles?.length || catNow.styles.includes(product.style));
  const missingForShop = [!shots?.every((s) => s.url) && "the four pictures", !category && "a category", category && !styleOk && "a style", !(product.description || blurb).trim() && "a description", !sizesChosen.length && "a size"].filter(Boolean);
  // the price it will sell at: the admin's own, or the garment's price + the AI picture add-on
  const hasAiPicture = elements.some((e) => e.type === "image" && /\/ai-designs\//.test(e.src || ""));
  const defaultPrice = (garment.basePrice || 0) + (hasAiPicture ? setup.designAddOnInr || 0 : 0);
  const sellsAt = Number(priceInr) > 0 ? Number(priceInr) : defaultPrice;
  const backToDesign = () => {
    setStep("design");
    setSpin(false);
    setShots(null);
    setCamRequest({ view: "front", n: nextReq() });
  };
  const showSide = (view) => {
    setSpin(false);
    setSideShown(view);
    setCamRequest({ ...SHOWROOM, n: nextReq() });
  };
  const service = (() => {
    const used = new Set(elements.map((e) => results.find((r) => r.url === e.src)?.service).filter(Boolean));
    return used.size > 1 ? "mixed" : used.size === 1 ? [...used][0] : elements.some((e) => e.artDesignId) ? "art" : "";
  })();
  const save = async ({ publish = false } = {}) => {
    const elements = elRef.current; // the design as it is now (Fix all saves in the same tick as its change)
    if (!elements.length) return say("Design the tee first.");
    const tidyName = name.trim() || `${garment.label} · ${colour.name}`;
    setBusy(publish ? "Publishing to Shop your IDENTEE…" : "Saving…");
    try {
      // the pictures of every colour on sale: the designed colour's from Review, the others taken now
      let colours;
      if (shots?.length === 4 && shots.every((s) => s.url)) {
        colours = [{ slug: colour.slug, mockups: Object.fromEntries(shots.map((s) => [s.key, s.url])) }];
        for (const slug of coloursChosen.filter((s) => s !== colour.slug)) {
          const c = garment.colours.find((x) => x.slug === slug);
          setBusy(`Taking the pictures in ${c?.name || slug}…`);
          const pics = await takeMockups(c?.hex || "#1C1C1D");
          if (pics) colours.push({ slug, mockups: pics });
        }
        setBusy(publish ? "Publishing to Shop your IDENTEE…" : "Saving…");
      }
      const body = {
        garmentType: garment.key,
        color: colour.slug,
        size,
        name: tidyName,
        blurb: blurb.trim(),
        elements,
        issues,
        costInr: spent,
        service,
        category,
        sizes: sizesChosen,
        priceInr: Number(priceInr) > 0 ? Number(priceInr) : 0,
        product: { ...product, description: product.description || blurb.trim() },
        ...(colours ? { colours } : {}),
      };
      let doc = await studioService.saveDesign({ ...body, versionNote: `${elements.length} item${elements.length === 1 ? "" : "s"}` }, designDoc?._id);
      if (publish && doc.status !== "published") {
        if (doc.status !== "ready") throw new Error("The mockup pictures are missing — press Review again, wait for the four pictures, then Publish.");
        doc = await studioService.publish(doc._id);
      }
      setDesignDoc(doc);
      setResults((cur) => cur.map((r) => ({ ...r, counted: true })));
      setName(doc.name);
      setSavedAt(new Date());
      say(publish ? (inShop ? "Updated. The shop shows the new design now." : "Published. It is in Shop your IDENTEE now.") : "Saved as a draft in the Studio.");
      return doc;
    } catch (err) {
      say(apiError(err));
      return null;
    } finally {
      setBusy("");
    }
  };
  // Step 3: every soft AI picture gets a 4K copy for printing (the tee is saved first, so the server knows it)
  const soft = softPictures(withPx(elements), positions, { size });
  // returns true when the pictures were sharpened; ask = false when the button pressed already said the cost (Fix all)
  const sharpenCostEach = Math.round((setup.pricePerImageInr || 0) * (setup.printCostFactor || 3) * 100) / 100;
  const sharpen = async ({ ask = true } = {}) => {
    const list = elRef.current;
    const softNow = softPictures(withPx(list), positions, { size });
    if (!softNow.length) return true;
    const costEach = sharpenCostEach;
    if (ask && !window.confirm(`Sharpen ${softNow.length} picture${softNow.length === 1 ? "" : "s"} for print at about ₹${costEach} each (₹${Math.round(costEach * softNow.length * 100) / 100})? Takes about half a minute a picture.`)) return false;
    const saved = savedAt && designDoc ? designDoc : await save();
    if (!saved) return false;
    setBusy(`Sharpening ${softNow.length} picture${softNow.length === 1 ? "" : "s"} for print…`);
    try {
      const { design: doc, done, failed, spent: more } = await studioService.enlarge(saved._id);
      // the 4K copies go onto the items here too (the design itself is unchanged, so no Undo step)
      const byIndex = Object.fromEntries(doc.elements.map((e, i) => [i, e]));
      const next = list.map((e, i) => (byIndex[i]?.printSrc && byIndex[i].src === e.src ? { ...e, printSrc: byIndex[i].printSrc, printW: byIndex[i].printW } : e));
      elRef.current = next;
      setElements(next);
      setDesignDoc(doc);
      setIssues((cur) => cur.filter((t) => !/will print blurry/.test(t)));
      say(`${done.length} sharpened (₹${more})${failed.length ? `; ${failed.length} couldn't be: ${failed[0].message}` : ""}.`);
      return failed.length === 0;
    } catch (err) {
      say(apiError(err));
      return false;
    } finally {
      setBusy("");
    }
  };
  // One button for the print check (26 Oct 2026, the client: "give one button, if I click it corrects all" and
  // "I want it big, same as it is, but the quality improved for printing"): the free fixes first (inside the area,
  // 1 cm clear of the edge, words big enough, outlines thick enough, nothing faint), then every blurry picture is
  // SHARPENED (4K print copy, paid — the button itself says the cost, so no second question) and keeps its size;
  // it is never made smaller for sharpness. Then the four pictures are taken again. One Undo step brings the design back.
  const fixOne = (list, id, patch, measure) => list.map((e) => (e.id !== id ? e : measure && e.type === "text" ? textBox({ ...e, ...patch }, positions.find((p) => p.key === e.position)) : { ...e, ...patch }));
  const fixable = issues.some((t) => !/own background/.test(t));
  const fixAll = async () => {
    if (busy) return;
    const before = elRef.current;
    let next = before;
    for (const i of designIssues(next).filter((x) => x.kind !== "blurry")) next = fixOne(next, i.elId, i.patch, i.measure);
    for (const f of dtfFixes(next, positions, { size })) next = fixOne(next, f.id, f.patch, f.measure);
    if (next !== before) commit(next);
    let note = "Done — taking the four pictures again. Undo (↶) in the design brings it back as it was.";
    if (softPictures(withPx(next), positions, { size }).length && !(await sharpen({ ask: false }))) {
      note = "The layout is fixed, but the blurry picture could not be sharpened (see the message above). It stays as it is — try Sharpen again in a moment.";
    }
    say(note);
    await toReview();
  };
  // photos of a person wearing the tee, from the saved tee's pictures (the tee is saved first)
  const photosOf = (slug) => (designDoc?.colours || []).find((c) => c.slug === slug)?.photos || [];
  const photoCount = photoWearers.length * photoSides.length;
  const makeModelPhotos = async () => {
    if (!photoCount || busy) return;
    const costEach = setup.pricePerImageInr || 0;
    if (!window.confirm(`Make ${photoCount} photo${photoCount === 1 ? "" : "s"} of a person wearing the ${colour.name} tee, about ₹${costEach} each (₹${Math.round(costEach * photoCount * 100) / 100})? About half a minute a photo.`)) return;
    const saved = savedAt && designDoc?.mockups?.front ? designDoc : await save();
    if (!saved) return;
    setBusy(`Taking ${photoCount} photo${photoCount === 1 ? "" : "s"} of a person wearing it…`);
    try {
      const { design: doc, made, failed, spent: more } = await studioService.modelPhotos(saved._id, { colour: colour.slug, wearers: photoWearers, sides: photoSides, setting: photoSetting });
      setDesignDoc(doc);
      say(`${made.length} photo${made.length === 1 ? "" : "s"} made (₹${more})${failed.length ? `; ${failed.length} didn't come: ${failed[0].message}` : ""}.`);
    } catch (err) {
      say(apiError(err));
    } finally {
      setBusy("");
    }
  };
  const removePhoto = async (url) => {
    if (!designDoc) return;
    try {
      setDesignDoc(await studioService.removeModelPhoto(designDoc._id, { colour: colour.slug, url }));
    } catch (err) {
      say(apiError(err));
    }
  };
  const restoreVersion = (v) => {
    commit(withIds(v.elements));
    if (v.color && garment.colours.some((c) => c.slug === v.color)) setColourSlug(v.color);
    if (v.size && sizes.includes(v.size)) setSize(v.size);
    setVersionsOpen(false);
    closeArea();
    say(`Brought back the save of ${new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Undo (↶) goes back.`);
  };
  const leave = () => {
    if (!savedAt && elements.length && !window.confirm(inShop ? "Leave without updating the shop? The tee on sale stays as it was; your change is kept here until you come back." : "Leave without saving? The tee is kept here until you come back or start another one.")) return;
    onLeave(designDoc);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && key === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // (every render: the handlers use the latest state)

  // the editor's print area fits in the panel without squeezing the controls below it
  const editorW = (() => {
    if (!activePos) return 300;
    const { W, H } = areaPx(activePos);
    const maxW = narrow ? Math.min(200, window.innerWidth - 64) : 230;
    const tall = H / W > 2;
    const maxH = narrow ? Math.min(tall ? 170 : 110, window.innerHeight * (tall ? 0.22 : 0.14)) : Math.min(tall ? 230 : 170, window.innerHeight * (tall ? 0.3 : 0.22));
    return Math.round(Math.max(tall ? 40 : 110, Math.min(maxW, (maxH * W) / H)));
  })();
  const activeEls = elements.filter((e) => e.position === active);
  const usedSides = new Set(elements.map((e) => e.side));
  const hoverPos = step === "design" && hoverKey && hoverKey !== active ? positions.find((p) => p.key === hoverKey) : null;
  const openAdd = (tab) => {
    if (tab === "ai") return setAssist(true);
    setSelectedId(null);
    setAddTab(tab);
    if (!active) ensureArea();
  };

  return (
    <div className="dr-app st-room" data-step={step} data-lit={lit ? "1" : undefined} data-assist={assist && step === "design" ? "1" : undefined}>
      <header className="dr-top">
        <button type="button" className="dr-back" onClick={step === "review" ? backToDesign : leave} aria-label={step === "review" ? "Back to the design" : "Back to the Studio"} title={step === "review" ? "Back to the design" : "Back to the Studio"}>←</button>
        <span className="dr-brand">STUDIO</span>
        {step === "design" ? (
          <div className="dr-pick">
            <button type="button" className="dr-pickbtn" aria-expanded={pickOpen} aria-haspopup="dialog" onClick={() => setPickOpen((o) => !o)}>
              <i style={{ background: fabricHex }} aria-hidden="true" />
              <span className="dr-pickname">
                <b>{garment.label}</b> {colour?.name}
              </span>
              <span className="dr-picksize">{size}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {pickOpen && (
              <>
                <div className="dr-scrim" onClick={() => setPickOpen(false)} />
                <div className="dr-pickpop" role="dialog" aria-label="Colour and size">
                  <div className="eyebrow">Colour · {colour?.name}</div>
                  <div className="dr-pickcolours" role="radiogroup" aria-label="T-shirt colour">
                    {garment.colours.map((c) => (
                      <button key={c.slug} type="button" role="radio" aria-checked={c.slug === colour?.slug} aria-label={c.name} title={c.name} className={`dr-sw${c.slug === colour?.slug ? " on" : ""}`} style={{ background: c.hex }} onClick={() => changeColour(c.slug)} />
                    ))}
                  </div>
                  <div className="eyebrow">Laid out at size</div>
                  <div className="dr-picksizes">
                    {sizes.map((sz) => (
                      <button key={sz} type="button" className={`dr-sz${sz === size ? " on" : ""}`} aria-pressed={sz === size} onClick={() => setSize(sz)}>
                        {sz}
                      </button>
                    ))}
                  </div>
                  <p className="dr-qnote">Every print is shown at its true size for {size}. Customers can buy any size; each prints at its own true print area.</p>
                  <button type="button" className="dr-chip on" onClick={() => setPickOpen(false)}>Done</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <span className="dr-crumb">
            Review · <b>{garment.label} · {colour?.name}</b>
          </span>
        )}
        <nav className="dr-steps" aria-label="Steps">
          {[["design", "Design"], ["review", "Review"], ["publish", "Publish"]].map(([k, label], i) => {
            const cur = step === "design" ? 0 : designDoc?.status === "published" ? 2 : 1;
            return (
              <span key={k} className={`dr-step${i === cur ? " on" : ""}${i < cur ? " done" : ""}`}>
                <span className="n">{i + 1}</span>
                {label}
              </span>
            );
          })}
        </nav>
        <div className="dr-savebox">
          <span className="st-spent" title="AI pictures made for this tee">{rupees(spent)} <small>AI</small></span>
          {step === "design" && !inShop && (
            <button type="button" className="dr-save" onClick={() => save()} disabled={!!busy}>
              {savedAt ? "Saved ✓" : "Save draft"}
            </button>
          )}
          {step === "design" && inShop && (
            <span className="st-inshop" title="Changes go live when you press Review, then Update in the shop">In the shop{savedAt ? "" : " · changed"}</span>
          )}
          {step === "design" && designDoc?.versions?.length > 0 && (
            <button type="button" className="st-versions-btn" aria-expanded={versionsOpen} onClick={() => setVersionsOpen((o) => !o)}>
              Versions · {designDoc.versions.length}
            </button>
          )}
          {versionsOpen && (
            <>
              <div className="dr-scrim" onClick={() => setVersionsOpen(false)} />
              <div className="dr-savepop st-versions" role="dialog" aria-label="Earlier saves">
                <label>Earlier saves of this tee</label>
                {[...designDoc.versions].reverse().map((v, i) => (
                  <div key={`${v.at}-${i}`} className="st-version">
                    <span>
                      <b>{new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</b>
                      <small>{v.note || `${v.elements?.length || 0} items`}{v.color && v.color !== colourSlug ? ` · ${garment.colours.find((c) => c.slug === v.color)?.name || v.color}` : ""}</small>
                    </span>
                    <button type="button" className="dr-chip" onClick={() => restoreVersion(v)}>Restore</button>
                  </div>
                ))}
                <p>The tee as it is now is kept as a new version on the next save.</p>
              </div>
            </>
          )}
        </div>
        {step === "design" && (
          <button type="button" className={`dr-aibtn${assist ? " on" : ""}`} aria-pressed={assist} onClick={() => setAssist((a) => !a)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON_AI} />
            </svg>
            Pictures
          </button>
        )}
        {step === "design" && (
          <button type="button" className="dr-cta dr-reviewbtn" onClick={toReview}>
            Review →
          </button>
        )}
      </header>

      <main className="dr-stage" data-editing={step === "design" && active ? "1" : undefined}>
        {step === "design" && (
          <aside className={`dr-side${areasOpen ? " open" : ""}`} aria-label="Where to print">
            <header>
              <div>
                <div className="eyebrow">Step 1</div>
                <h2>Where to print</h2>
              </div>
              <button type="button" className="dr-x" aria-label="Close" onClick={() => setAreasOpen(false)}>✕</button>
            </header>
            <div className="dr-sidebody">
              <div className="dr-areatabs" role="tablist" aria-label="Side of the tee">
                {AREA_GROUPS.filter(([, sides]) => positions.some((p) => sides.includes(p.side))).map(([title, sides]) => {
                  const count = positions.filter((p) => sides.includes(p.side) && usedKeys.includes(p.key)).length;
                  return (
                    <button key={title} type="button" role="tab" aria-selected={areaTab === title} className={areaTab === title ? "on" : ""} onClick={() => { setAreaTab(title); if (!active && !narrow) setCamRequest({ view: sides[0], ms: 700, n: nextReq() }); }}>
                      {title}
                      {count > 0 && <i aria-label={`${count} with a design`}>{count}</i>}
                    </button>
                  );
                })}
              </div>
              {AREA_GROUPS.filter(([title]) => title === areaTab).map(([title, sides]) => (
                <div key={title} className="dr-cards">
                  {positions.filter((p) => sides.includes(p.side)).map((p) => {
                    const [w, h] = areaCm(p, size);
                    const used = usedKeys.includes(p.key);
                    const blockedBy = used ? [] : blockersOf(p.key, positions, usedKeys);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={`dr-area${active === p.key ? " on" : ""}${used ? " used" : ""}${blockedBy.length ? " blocked" : ""}${hoverKey === p.key && active !== p.key ? " hot" : ""}`}
                        onMouseEnter={() => !blockedBy.length && setHoverKey(p.key)}
                        onMouseLeave={() => setHoverKey(null)}
                        title={blockedBy.length ? `Overlaps ${blockedBy.map((b) => b.label).join(" and ")} — remove that design first` : `${p.label} · ${w} × ${h} cm`}
                        aria-pressed={active === p.key}
                        onClick={() => openArea(p.key)}
                      >
                        <AreaThumb position={p} size={size} print={used ? thumbs[p.key] : null} fabric={fabricHex} />
                        {used && <span className="tick" aria-hidden="true">✓</span>}
                        <b>{p.label}</b>
                        <span>{w}×{h} cm</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              <p className="dr-empty">A tick = has a design. Faded = covered by another design.</p>
            </div>
          </aside>
        )}

        <div className="dr-view">
          {model && colour && (
            <div className="dr-room" data-editing={active ? "1" : undefined} data-room={step === "review" ? "boutique" : "studio"}>
              <Room3D
                ref={roomApi}
                model={model}
                colour={fabricHex}
                areas={areas3D}
                onPickArea={(k) => step === "design" && openArea(k)}
                camRequest={camRequest}
                interactive={step === "design"}
                still={!!active}
                hotspots={step === "design" ? hotspots : undefined}
                glowKey={step === "design" ? hoverKey : null}
                activeKey={active}
                onHoverArea={(k) => {
                  setHoverKey(k);
                  const side = k && positions.find((p) => p.key === k)?.side;
                  if (side) setAreaTab(groupOfSide(side));
                }}
                room={step === "review" ? "boutique" : "studio"}
                spin={spin}
                face={sideShown}
                onLit={() => setLit(true)}
              />
            </div>
          )}
          {step === "design" && (
            <>
              <div className="dr-undo" role="group" aria-label="Undo and redo">
                <button type="button" onClick={undo} disabled={histSize.past === 0} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
                <button type="button" onClick={redo} disabled={histSize.future === 0} aria-label="Redo" title="Redo (Ctrl+Y)">↷</button>
              </div>
              {hoverPos && (
                <div className="dr-hotchip" role="status" key={hoverPos.key}>
                  <b>{hoverPos.label}</b>
                  <span>{areaCm(hoverPos, size).join(" × ")} cm</span>
                  <i>{usedKeys.includes(hoverPos.key) ? "Tap to edit" : "Tap to design here"}</i>
                </div>
              )}
              <div className="dr-viewsw" role="group" aria-label="Look at side">
                {SIDES.map(([k, label]) => (
                  <button key={k} type="button" className={usedSides.has(k) ? "has" : ""} onClick={() => goView(k)}>
                    {label}
                    <span className="dot" />
                  </button>
                ))}
              </div>
            </>
          )}
          {step === "review" && (
            <div className="dr-spinbar" role="group" aria-label="3D view">
              <button type="button" className={spin ? "on" : ""} onClick={() => { setSpin(true); setSideShown(null); }} aria-pressed={spin}>⟳ 360°</button>
              <button type="button" className={!spin ? "on" : ""} onClick={() => setSpin(false)} aria-pressed={!spin}>❚❚ Pause</button>
            </div>
          )}
        </div>

        {step === "design" && activePos && (
          <section className={`dr-editor ${sel ? "is-editing" : "is-adding"}`} aria-label={`Edit ${activePos.label}`}>
            <header>
              <div>
                <div className="eyebrow">Step 2 · {activePos.label}</div>
                <h2>{sel ? (sel.type === "text" ? "Edit text" : "Edit picture") : "What to add"}</h2>
                <div className="sub">{areaPx(activePos).wCm} × {areaPx(activePos).hCm} cm at size {size}</div>
              </div>
              <button type="button" className="dr-x" aria-label="Close editor" onClick={() => goView(activePos.side)}>✕</button>
            </header>
            <div className="dr-flatwrap">
              <AreaEditor
                elements={activeEls}
                W={areaPx(activePos).W}
                H={areaPx(activePos).H}
                fabric={fabricHex}
                selectedId={selectedId}
                onSelect={setSelectedId}
                displayWidth={editorW}
                onLive={(els) => queueLive(active, els)}
                onCommit={(els) => {
                  liveQueue.current = null;
                  setLive(null);
                  commit((prev) => [...prev.filter((e) => e.position !== active), ...els]);
                }}
              />
            </div>
            <div className="dr-ruler" style={{ width: editorW }}>
              <span>0</span>
              <span>{areaPx(activePos).wCm} cm</span>
            </div>
            <LayersPanel items={activeEls} selectedId={selectedId} onSelect={setSelectedId} onMove={moveLayer} onDelete={(id) => { setSelectedId(id); commit((prev) => prev.filter((e) => e.id !== id)); setSelectedId(null); }} />
            {sel ? (
              <Controls
                sel={withPx([sel])[0]}
                areaCmW={areaPx(activePos).wCm}
                areaRatio={areaPx(activePos).W / areaPx(activePos).H}
                positions={positions}
                prices={{ google: setup.pricePerImageInr, grok: setup.grokPricePerImageInr }}
                grok={!!setup.grok}
                changing={changing}
                onPatch={updateSel}
                onDelete={removeSel}
                onDuplicate={dupSel}
                onLayer={layerSel}
                onRemoveBg={removeBg}
                onAddMore={openAdd}
                onAlign={alignSel}
                onCopyTo={copySel}
                onChangePicture={changePicture}
              />
            ) : (
              <>
                <AddTabs tab={addTab} onTab={setAddTab} />
                <div className="dr-controls">
                  {addTab === "text" && <TextTab onAdd={addText} />}
                  {addTab === "upload" && <UploadTab onPick={() => fileRef.current?.click()} onAssistant={() => setAssist(true)} />}
                  {addTab === "art" && <ArtPicker onPick={pickArt} />}
                  {addTab === "ai" && <AiPicturesTab results={results} onPick={setPlacing} onAssistant={() => setAssist(true)} />}
                </div>
              </>
            )}
          </section>
        )}

        {step === "design" && assist && (
          <PictureAssistant
            setup={setup}
            garment={garment}
            colour={colour}
            positions={positions}
            size={size}
            activeKey={active}
            results={results}
            onResult={onNewResult}
            onAdd={placePicture}
            onAddArt={placeArt}
            onAddWords={addWords}
            onColour={changeColour}
            onName={(n) => setName((cur) => cur || n)}
            say={say}
            onAddMineUnused={(p, areaKey) => placePicture({ id: p.id, url: p.url, width: p.width || 1024, height: p.height || 1024, kind: ["whole", "title", "hero", "background", "logo"].includes(p.style) ? p.style : "whole", cost: 0, service: "google", cut: true, prompt: p.about || "", look: "" }, areaKey)}
            onClose={() => setAssist(false)}
          />
        )}

        {step === "review" && (
          <section className="dr-review" aria-label="Review and publish">
            <div>
              <div className="eyebrow">Review</div>
              <p className="dr-review-hint">{shots ? "Tap a side to look at it on the tee. These four pictures go to the shop page." : "Taking the four pictures…"}</p>
            </div>
            <div className="dr-shots">
              {(shots || SIDES.map(([key, label]) => ({ key, label, url: null }))).map((sh) => (
                <button key={sh.key} type="button" className={`dr-shot${sideShown === sh.key ? " on" : ""}`} aria-pressed={sideShown === sh.key} onClick={() => showSide(sh.key)} aria-label={`Show the ${sh.label.toLowerCase()} on the 3D tee`}>
                  {sh.url ? <img src={sh.url} alt="" /> : <div className="ph" />}
                  <span>{sh.label}</span>
                </button>
              ))}
            </div>
            {issues.length > 0 && (
              <div className="st-issues">
                <b>The print check says</b>
                <ul>{[...new Set(issues)].map((t) => <li key={t}>{t}</li>)}</ul>
                {fixable && (
                  <button type="button" className="dr-add st-sharpen st-fixall" disabled={!!busy || !shots} onClick={fixAll}>
                    Fix all of this for me{soft.length > 0 ? ` · sharpens ${soft.length} picture${soft.length === 1 ? "" : "s"} for ₹${Math.round(sharpenCostEach * soft.length * 100) / 100}` : ""}
                    <small>
                      Pictures keep their size: a blurry one gets a 4K print copy{soft.length > 0 ? ` (about ₹${sharpenCostEach} each, charged when you press this)` : ""}.
                      Everything is pulled 1 cm in from the edge, small words and thin outlines are made bigger, nothing stays faint. Then the four pictures are taken again.
                    </small>
                  </button>
                )}
              </div>
            )}
            {soft.length > 0 ? (
              <button type="button" className="dr-add st-sharpen" disabled={!!busy} onClick={sharpen}>
                Sharpen {soft.length} picture{soft.length === 1 ? "" : "s"} for print (4K)
                <small>About ₹{Math.round((setup.pricePerImageInr || 0) * (setup.printCostFactor || 3) * 100) / 100} each · the shop prints the 4K copy, the design stays the same</small>
              </button>
            ) : elements.some((e) => e.printSrc) ? (
              <p className="dr-empty">✓ Every picture has its 4K print copy.</p>
            ) : null}
            <div className="st-photos">
              <div className="eyebrow">Photos of a person wearing it</div>
              {photosOf(colour.slug).length > 0 && (
                <div className="st-photo-strip">
                  {photosOf(colour.slug).map((p) => (
                    <figure key={p.url} className="st-photo">
                      <img src={imageUrl(p.url, 400)} alt={`${p.wearer}, ${p.side}`} />
                      <figcaption>
                        {p.wearer === "woman" ? "Woman" : "Man"} · {p.side}
                        <button type="button" aria-label="Remove this photo" title="Remove" onClick={() => removePhoto(p.url)}>✕</button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <div className="dr-row st-ticks">
                {[["man", "Man"], ["woman", "Woman"]].map(([k, label]) => (
                  <label key={k} className={`dr-chip${photoWearers.includes(k) ? " on" : ""}`}>
                    <input type="checkbox" checked={photoWearers.includes(k)} onChange={(e) => setPhotoWearers(e.target.checked ? [...new Set([...photoWearers, k])] : photoWearers.filter((w) => w !== k))} />
                    {label}
                  </label>
                ))}
                <span className="st-gap" />
                {[["front", "Front"], ["back", "Back"]].map(([k, label]) => (
                  <label key={k} className={`dr-chip${photoSides.includes(k) ? " on" : ""}`}>
                    <input type="checkbox" checked={photoSides.includes(k)} onChange={(e) => setPhotoSides(e.target.checked ? [...new Set([...photoSides, k])] : photoSides.filter((s) => s !== k))} />
                    {label}
                  </label>
                ))}
                <select value={photoSetting} onChange={(e) => setPhotoSetting(e.target.value)} aria-label="Setting">
                  {(setup.photoSettings || ["studio"]).map((k) => <option key={k} value={k}>{{ studio: "Studio", street: "Street", wall: "Wall" }[k] || k}</option>)}
                </select>
              </div>
              <button type="button" className="dr-add st-sharpen" disabled={!!busy || !photoCount || !shots?.every((s) => s.url)} onClick={makeModelPhotos}>
                Make {photoCount} photo{photoCount === 1 ? "" : "s"} · about ₹{Math.round((setup.pricePerImageInr || 0) * photoCount * 100) / 100}
                <small>Made from the four pictures of this colour ({colour.name}); the shop shows them after the four sides. Check each one — the AI can change small details.</small>
              </button>
            </div>
            <div className="st-rules">
              <button type="button" className="st-rules-btn" aria-expanded={rulesOpen} onClick={() => setRulesOpen((o) => !o)}>
                DTF print rules {rulesOpen ? "▴" : "▾"}
              </button>
              {rulesOpen && <ul>{DTF_RULES.map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
            <label className="dr-field">
              Name in the shop
              <input type="text" value={name} maxLength={60} placeholder={`${garment.label} · ${colour.name}`} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="dr-field">
              A line for the shop page <small style={{ fontWeight: 400 }}>(optional)</small>
              <textarea rows={2} value={blurb} maxLength={300} placeholder="e.g. A bootleg-poster tribute to the film, printed on heavyweight cotton." onChange={(e) => setBlurb(e.target.value)} />
            </label>
            <div className="st-pub">
              <div className="eyebrow">Before it goes in the shop</div>
              <label className="dr-field">
                Category <small style={{ fontWeight: 400 }}>— where customers find it</small>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Choose a category…</option>
                  {(setup.categories || []).map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                      {c.hidden ? " (hidden from the shop)" : c.comingSoon ? " (coming soon)" : ""}
                    </option>
                  ))}
                </select>
                {!(setup.categories || []).length && <small>No ready-made categories yet — add one in Storefront → Categories.</small>}
              </label>
              {category && (
                <label className="dr-field">
                  Style <small style={{ fontWeight: 400 }}>— the style filter on the category page</small>
                  {catNow?.styles?.length ? (
                    <select value={product.style} onChange={(e) => setP({ style: e.target.value })}>
                      <option value="">Choose a style…</option>
                      {catNow.styles.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={product.style} maxLength={60} placeholder="e.g. Oversized" onChange={(e) => setP({ style: e.target.value })} />
                  )}
                  <small>Missing a style? Add it to the category in Storefront → Categories.</small>
                </label>
              )}
              <label className="dr-field">
                Description <small style={{ fontWeight: 400 }}>— the product page's text (the line above is used when empty)</small>
                <textarea rows={3} value={product.description} maxLength={3000} placeholder={blurb || "e.g. A bootleg-poster tribute to SCENE on heavyweight cotton. Printed to order, true to size."} onChange={(e) => setP({ description: e.target.value })} />
              </label>
              <div className="dr-field">
                Sizes on sale
                <div className="dr-row st-ticks" role="group" aria-label="Sizes on sale">
                  {sizes.map((sz) => (
                    <label key={sz} className={`dr-chip${sizesChosen.includes(sz) ? " on" : ""}`}>
                      <input type="checkbox" checked={sizesChosen.includes(sz)} onChange={(e) => setSizesOn(e.target.checked ? [...new Set([...sizesChosen, sz])] : sizesChosen.filter((s) => s !== sz))} />
                      {sz}
                    </label>
                  ))}
                </div>
              </div>
              <div className="dr-field">
                Colours on sale <small style={{ fontWeight: 400 }}>— the designed colour always; tick more and their pictures are taken when you publish</small>
                <div className="dr-row st-ticks" role="group" aria-label="Colours on sale">
                  {garment.colours.map((c) => {
                    const on = coloursChosen.includes(c.slug);
                    const fixed = c.slug === colour.slug;
                    return (
                      <label key={c.slug} className={`dr-chip${on ? " on" : ""}`} title={fixed ? "The colour it was designed on" : c.name}>
                        <input type="checkbox" checked={on} disabled={fixed} onChange={(e) => setColoursOn(e.target.checked ? [...new Set([...coloursChosen, c.slug])] : coloursChosen.filter((s) => s !== c.slug))} />
                        <i className="st-tick-dot" style={{ background: c.hex }} />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="dr-field">
                Price <small style={{ fontWeight: 400 }}>— sells at ₹{sellsAt.toLocaleString("en-IN")}{Number(priceInr) > 0 ? " (your price)" : ` (the ${garment.label} ₹${(garment.basePrice || 0).toLocaleString("en-IN")}${hasAiPicture ? ` + ₹${setup.designAddOnInr || 0} AI picture` : ""})`}</small>
                <input type="number" min="0" step="1" inputMode="numeric" value={priceInr} placeholder={`${defaultPrice} (leave empty for the usual price)`} onChange={(e) => setPriceInr(e.target.value)} />
              </label>
              <button type="button" className="st-rules-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                More product details {moreOpen ? "▴" : "▾"} <small style={{ fontWeight: 400, color: "var(--muted)" }}>(filled in with sensible values)</small>
              </button>
              {moreOpen && (
                <div className="st-more">
                  <div className="dr-row">
                    <label className="dr-field">
                      For
                      <select value={product.gender} onChange={(e) => setP({ gender: e.target.value })}>
                        {["Unisex", "Men", "Women", "Kids"].map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </label>
                    <label className="dr-field">
                      Age range
                      <select value={product.ageRange} onChange={(e) => setP({ ageRange: e.target.value })}>
                        {["Adult", "Teen", "Kids", "Infant"].map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="dr-row">
                    <label className="dr-field">
                      Fabric
                      <input type="text" value={product.fabric} maxLength={80} onChange={(e) => setP({ fabric: e.target.value })} />
                    </label>
                    <label className="dr-field">
                      Type
                      <select value={product.type} onChange={(e) => setP({ type: e.target.value })}>
                        {["Casual", "Sports", "Party", "Formal", "Ethnic"].map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="dr-row">
                    <label className="dr-field">
                      Was price (₹) <small style={{ fontWeight: 400 }}>struck through</small>
                      <input type="number" min="0" value={product.oldPrice} placeholder={garment.comparePrice ? String(garment.comparePrice) : "none"} onChange={(e) => setP({ oldPrice: e.target.value })} />
                    </label>
                    <label className="dr-field">
                      Sub-category
                      <input type="text" value={product.subcategory} maxLength={60} placeholder={product.style || "same as the style"} onChange={(e) => setP({ subcategory: e.target.value })} />
                    </label>
                  </div>
                  <div className="dr-row">
                    <label className="dr-field">
                      Product code (SKU)
                      <input type="text" value={product.sku} maxLength={20} placeholder="made for you when empty" onChange={(e) => setP({ sku: e.target.value.toUpperCase() })} />
                    </label>
                    <label className="dr-field">
                      HSN code
                      <input type="text" value={product.hsnCode} maxLength={12} onChange={(e) => setP({ hsnCode: e.target.value })} />
                    </label>
                  </div>
                  <div className="dr-field">
                    Wash care
                    <div className="dr-row st-ticks">
                      {["Machine wash cold", "Hand wash only", "Do not bleach", "Tumble dry low", "Iron on low heat", "Dry clean only", "Do not wring"].map((w) => (
                        <label key={w} className={`dr-chip${product.washCare.includes(w) ? " on" : ""}`}>
                          <input type="checkbox" checked={product.washCare.includes(w)} onChange={(e) => setP({ washCare: e.target.checked ? [...product.washCare, w] : product.washCare.filter((x) => x !== w) })} />
                          {w}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="dr-row">
                    <label className="dr-field">
                      Weight (g)
                      <input type="number" min="0" value={product.shipping.weight} onChange={(e) => setP({ shipping: { ...product.shipping, weight: e.target.value } })} />
                    </label>
                    <label className="dr-field">
                      Box L × W × H (cm)
                      <span className="dr-row" style={{ flexWrap: "nowrap" }}>
                        {["length", "width", "height"].map((k) => <input key={k} type="number" min="0" value={product.shipping[k]} aria-label={k} onChange={(e) => setP({ shipping: { ...product.shipping, [k]: e.target.value } })} />)}
                      </span>
                    </label>
                  </div>
                  <label className="st-switch small">
                    <input type="checkbox" checked={!!product.featured} onChange={(e) => setP({ featured: e.target.checked })} />
                    <span>
                      <b>Featured</b>
                      <small>Shown first on the shop's featured row.</small>
                    </span>
                  </label>
                </div>
              )}
              {missingForShop.length > 0 && designDoc?.status !== "published" && <p className="st-pub-missing">Before publishing, add {missingForShop.join(", ")}.</p>}
            </div>
            <p className="dr-empty">
              {garment.label} · {colour.name} · laid out at {size} · AI pictures {rupees(spent)}
              {designDoc?.status === "published" && (
                <>
                  {" · "}
                  <a href={shopHref(`/ready-made/design/${designDoc.slug}`)} target="_blank" rel="noreferrer">See it in the shop</a>
                </>
              )}
            </p>
          </section>
        )}

        {/* phones: the tool bar along the bottom of the stage (laptops hide it: the panels are always there) */}
        {step === "design" && (
          <nav className="dr-tools" aria-label="Tools">
            <button type="button" className={`dr-toolbtn${areasOpen ? " on" : ""}`} onClick={() => { setAreasOpen((o) => !o); setAssist(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_AREAS} /></svg>
              Where
            </button>
            <button type="button" className="dr-toolbtn" onClick={() => { setAssist(false); setAreasOpen(false); setSelectedId(null); ensureArea(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_ADD} /></svg>
              Add
            </button>
            <button type="button" className={`dr-toolbtn${assist ? " on" : ""}`} onClick={() => { closeArea(); setAreasOpen(false); setAssist((a) => !a); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_AI} /></svg>
              Pictures
            </button>
            <button type="button" className="dr-toolbtn" onClick={toReview}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l4 4L19 6" /></svg>
              Review
            </button>
          </nav>
        )}
        {placing && <PlacePicker picture={placing} groups={placeGroups()} suggest={active} onPlace={(key, how, replace) => placePicture(placing, key, how, replace)} onClose={() => setPlacing(null)} />}
        {toast && <div className="dr-toast" role="status">{toast}</div>}
        {busy && (
          <div className="dr-busy">
            <WaitCard key={busy} label={busy} />
          </div>
        )}
      </main>

      {step === "review" && (
        <nav className="dr-dock" aria-label="Publish">
          <button type="button" className="dr-cta ghost" onClick={backToDesign} disabled={!!busy}>← Edit design</button>
          {!inShop && <button type="button" className="dr-cta ghost" onClick={() => save()} disabled={!!busy}>Save draft</button>}
          {inShop ? (
            <>
              <button type="button" className="dr-cta ghost" disabled={!!busy} onClick={async () => { setBusy("Taking it out of the shop…"); try { setDesignDoc(await studioService.act(designDoc._id, "unpublish")); say("Taken out of the shop. It stays here as a ready tee."); } catch (err) { say(apiError(err)); } finally { setBusy(""); } }}>
                Unpublish
              </button>
              <button type="button" className="dr-cta gold" onClick={() => save({ publish: true })} disabled={!!busy || missingForShop.length > 0}>
                Update in the shop →
              </button>
            </>
          ) : (
            <button type="button" className="dr-cta gold" onClick={() => save({ publish: true })} disabled={!!busy || missingForShop.length > 0}>
              Publish to Shop your IDENTEE →
            </button>
          )}
        </nav>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
      {job && <MockupCamera job={job} onDone={onShots} />}
    </div>
  );
}
