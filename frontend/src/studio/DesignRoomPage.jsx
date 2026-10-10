// studio/DesignRoomPage.jsx  —  /customize/:type
//
// The 3D Design Room (docs/CUSTOMIZER_PLAN.md §5c):
//   fitting (colour + size) → room with the tee in the centre → design each
//   print area in a flat, true-to-size editor (shown live on the 3D tee as a
//   decal) → review (mockups of all sides) → order.
// Designs are saved in "layout v2" (x/y/width/height in % of the print box),
// the same format the server validates and checkout prices.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchArtCategories } from "../redux/slices/artCategorySlice";
import { fetchArtDesigns } from "../redux/slices/artDesignSlice";
import { uploadDesignImage } from "../redux/slices/customizationSlice";
import customizationService from "../services/customizationService";
import { fetchCart } from "../redux/slices/cartWishlistSlice";
import { imageUrl } from "../utils/imageUrl";
import Room3D from "./Room3D";
import AreaEditor from "./AreaEditor";
import { AreaRenderer, imageSrcs, loadImage, measureText } from "./konvaRender";
import { areaCm, blockersOf, clashesIn, modelForGarment, placeArea } from "./teeModel";
import { FONTS, addStudioFonts } from "./fonts";
import "./designRoom.css";

const PX_PER_CM = 24; // texture / editor resolution (print files are made separately at 300 DPI)
const MIN_AREA_PX = 480; // small areas (sleeves, chest) are drawn finer so they stay sharp on the 3D tee
const INKS = ["#FFFFFF", "#141110", "#C9A24B", "#C2352C", "#2441B5", "#1C5A2B", "#F0C24C", "#B7A2E0", "#F08A24", "#8DC1EC"];
const IDEAS = ["BIRTHDAY SQUAD", "Just Married", "TEAM 07", "Chennai Born", "Stay Curious", "Class of 2026", "Bride Squad", "Founder Mode"];
const SIDES = [["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"]];
const DRAFT_KEY = (type) => `identee:design:v3:${type}`;
const SIZE_KEY = "identee:size";
const HISTORY_CAP = 50;

const readJSON = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
const writeJSON = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage blocked — the design just isn't kept after a reload
  }
};
const isLoggedIn = () => !!readJSON("userInfo")?.token;
const lum = (hex) => {
  const n = parseInt(String(hex || "#000000").slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
let reqSeq = 0; // camera-move request counter
const nextReq = () => ++reqSeq;
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// A 4:5 picture of the tee from a full 3D-view snapshot (for mockups).
function cropMockup(dataUrl, outW = 640, outH = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const h = img.height * 0.96;
      const w = h * (outW / outH);
      const c = document.createElement("canvas");
      c.width = outW;
      c.height = outH;
      c.getContext("2d").drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, outW, outH);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Load the studio fonts once (Konva needs them in the document).
function useStudioFonts() {
  useEffect(() => {
    addStudioFonts();
  }, []);
}

export default function DesignRoomPage() {
  const { type } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  useStudioFonts();

  const { items: garments, isLoading: garmentsLoading } = useSelector((s) => s.garmentType);
  const { items: artCategories } = useSelector((s) => s.artCategory);
  const { items: artDesigns } = useSelector((s) => s.artDesign);
  const cartCount = useSelector((s) => s.cartWishlist?.cartItems?.length || 0);
  const garment = garments.find((g) => g.key === type);
  const model = modelForGarment(garment);

  // "Start designing" opens /customize/<garment>?new=1 → a fresh, empty design.
  // Any unfinished design stays in `earlier` and is offered in the first step.
  const fresh = params.get("new") === "1";
  const stored = useMemo(() => readJSON(DRAFT_KEY(type)), [type]);
  // (a design already saved to My designs isn't "unfinished" — it's kept there)
  const [earlier, setEarlier] = useState(() => (fresh && stored?.elements?.length && !stored.designId ? stored : null));
  const draft = fresh ? null : stored;
  const [step, setStep] = useState(draft?.elements?.length ? "design" : "fit");
  const [colourSlug, setColourSlug] = useState(params.get("color") || draft?.colour || null);
  const [size, setSize] = useState(draft?.size || readJSON(SIZE_KEY) || "M");
  const [elements, setElements] = useState(() => (Array.isArray(draft?.elements) ? draft.elements : []));
  const [positions, setPositions] = useState([]);
  const [active, setActive] = useState(null); // print area key being edited
  const [selectedId, setSelectedId] = useState(null);
  const [panel, setPanel] = useState("edit"); // "edit" | "art"
  const [live, setLive] = useState(null); // { key, elements } while dragging
  const [textures, setTextures] = useState({}); // key -> { canvas, version }
  // returning to a saved design starts at the front view; new visits fly in after the fitting step
  const [camRequest, setCamRequest] = useState(() => (draft?.elements?.length ? { view: "front", ms: 1600, n: nextReq() } : null));
  const [shots, setShots] = useState(null);
  const [spin, setSpin] = useState(true);
  const [qtys, setQtys] = useState({}); // Review: { M: 2, L: 1 } — one design, any mix of sizes // Review: the tee turns 360° until a side is picked
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  // the saved design this is (My designs); locked = already ordered → saving makes a copy
  const [designId, setDesignId] = useState(params.get("design") || draft?.designId || null);
  const [designName, setDesignName] = useState(draft?.name || "");
  const [locked, setLocked] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [cartNote, setCartNote] = useState(null); // { pieces, name } after "Add to cart"
  const [savedAt, setSavedAt] = useState(null);
  const roomApi = useRef(null);
  const fileRef = useRef(null);
  const narrow = typeof window !== "undefined" && window.innerWidth < 760;

  useEffect(() => {
    dispatch(fetchGarmentTypes());
    dispatch(fetchArtCategories());
  }, [dispatch]);

  useEffect(() => {
    let alive = true;
    customizationService
      .getPrintPositions(type)
      .then((d) => alive && setPositions(d.positions || []))
      .catch(() => alive && setToast("Couldn't load the print areas. Please reload the page."));
    return () => {
      alive = false;
    };
  }, [type]);

  /* ---------- derived ---------- */
  const colours = useMemo(() => garment?.colors || [], [garment]);
  const colour = colours.find((c) => c.slug === colourSlug) || colours[0];
  const sizes = garment?.sizes?.length ? garment.sizes : ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const sizeNow = sizes.includes(size) ? size : sizes.includes("M") ? "M" : sizes[0];
  const chartRow = garment?.sizeChart?.find((r) => r.size === sizeNow);
  const lengthCm = (chartRow?.length || 30) * 2.54;
  const fabricHex = colour?.hex || "#1C1C1D";
  const inkDefault = lum(fabricHex) < 0.55 ? "#FFFFFF" : "#141110";
  const artTotal = elements.reduce((n, e) => n + (e.artPrice || 0), 0);
  const unitPrice = (garment?.basePrice || 0) + artTotal;
  const activePos = positions.find((p) => p.key === active) || null;

  const areaPx = useCallback(
    (pos) => {
      const [w, h] = areaCm(pos, sizeNow);
      const pxPerCm = Math.max(PX_PER_CM, MIN_AREA_PX / Math.min(w, h));
      return { W: Math.round(w * pxPerCm), H: Math.round(h * pxPerCm), wCm: w, hCm: h };
    },
    [sizeNow],
  );

  /* ---------- autosave ---------- */
  // Never replace a stored design with an empty one, unless this visit had
  // elements and the customer removed them all.
  const hadElements = useRef(elements.length > 0);
  useEffect(() => {
    if (!type) return;
    if (elements.length) hadElements.current = true;
    else if (!hadElements.current) return;
    writeJSON(DRAFT_KEY(type), { elements, colour: colour?.slug, size: sizeNow, designId, name: designName });
  }, [type, elements, colour?.slug, sizeNow, designId, designName]);

  // drop ?new=1 from the address so a reload keeps the design in progress
  useEffect(() => {
    if (!fresh) return;
    const next = new URLSearchParams(params);
    next.delete("new");
    navigate(`${location.pathname}${next.toString() ? `?${next}` : ""}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const continueEarlier = () => {
    if (!earlier) return;
    setElements(earlier.elements);
    if (earlier.colour) setColourSlug(earlier.colour);
    if (earlier.size) setSize(earlier.size);
    setDesignId(earlier.designId || null);
    setDesignName(earlier.name || "");
    setEarlier(null);
    setStep("design");
    setCamRequest({ view: "front", ms: 1600, n: nextReq() });
  };

  /* ---------- open a saved design: /customize/<garment>?design=<id> ---------- */
  const openId = params.get("design");
  const onScreenId = useRef(null); // id of the saved design currently shown (set on load and on save)
  useEffect(() => {
    // after Save the address gets ?design=<id> of the design already on screen —
    // nothing to load (re-loading would jump back from Review to Design)
    if (!openId || !isLoggedIn() || openId === onScreenId.current) return;
    let alive = true;
    customizationService
      .getCustomizationById(openId)
      .then((d) => {
        if (!alive) return;
        if (d.garmentType !== type) return navigate(`/customize/${d.garmentType}?design=${d._id}`, { replace: true });
        setElements(d.elements.map((e) => ({ ...e, id: e._id || e.id || makeId() })));
        setColourSlug(d.color);
        if (d.size) setSize(d.size);
        onScreenId.current = d._id;
        setDesignId(d._id);
        setDesignName(d.name || "");
        setLocked(!!d.orderedAt);
        setStep("design");
        setCamRequest({ view: "front", ms: 1400, n: nextReq() });
        if (d.orderedAt) setToast("This design was ordered. Changes will be saved as a new design.");
      })
      .catch(() => alive && setToast("Couldn't open that design. It may have been deleted."));
    return () => {
      alive = false;
    };
  }, [openId, type]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- history (undo / redo) ---------- */
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  const hist = useRef({ past: [], future: [] });
  const [histSize, setHistSize] = useState({ past: 0, future: 0 });
  const bumpHistory = () => setHistSize({ past: hist.current.past.length, future: hist.current.future.length });
  const commit = useCallback((next) => {
    const prev = elementsRef.current;
    const value = typeof next === "function" ? next(prev) : next;
    hist.current = { past: [...hist.current.past, prev].slice(-HISTORY_CAP), future: [] };
    setElements(value);
    bumpHistory();
  }, []);
  const undo = () => {
    const { past, future } = hist.current;
    if (!past.length) return;
    hist.current = { past: past.slice(0, -1), future: [elementsRef.current, ...future] };
    setElements(past[past.length - 1]);
    bumpHistory();
  };
  const redo = () => {
    const { past, future } = hist.current;
    if (!future.length) return;
    hist.current = { past: [...past, elementsRef.current], future: future.slice(1) };
    setElements(future[0]);
    bumpHistory();
  };

  /* ---------- 3D textures: render each area with Konva ---------- */
  const renderers = useRef(new Map()); // key -> { r, W, H }
  const lastSig = useRef(new Map());
  useEffect(() => {
    if (!positions.length) return;
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
        const outline = active === pos.key;
        const sig = JSON.stringify([W, H, outline, els, [...document.fonts].filter((f) => f.status === "loaded").length]);
        if (lastSig.current.get(pos.key) === sig && textures[pos.key]) continue;
        lastSig.current.set(pos.key, sig);
        if (!els.length && !outline) {
          updates[pos.key] = { canvas: null, version: nextReq() };
          continue;
        }
        const canvas = entry.r.render(els, { outline });
        updates[pos.key] = { canvas, version: nextReq() };
      }
      if (alive && Object.keys(updates).length) setTextures((t) => ({ ...t, ...updates }));
    };
    run();
    const srcs = imageSrcs(live ? [...elements, ...live.elements] : elements);
    Promise.allSettled(srcs.map(loadImage)).then(() => {
      lastSig.current.clear();
      if (alive) run();
    });
    document.fonts?.ready.then(() => {
      if (alive) run();
    });
    return () => {
      alive = false;
    };
  }, [positions, elements, live, active, areaPx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => renderers.current.forEach((e) => e.r.destroy()), []);

  // Where each print sits on the tee — only changes with the size, so the 3D
  // print shapes are built once, not on every drag frame.
  const spots = useMemo(
    () => (model ? Object.fromEntries(positions.map((pos) => [pos.key, placeArea(model, pos, sizeNow, lengthCm)])) : {}),
    [model, positions, sizeNow, lengthCm],
  );
  const areas3D = useMemo(
    () =>
      positions
        .filter((pos) => spots[pos.key])
        .map((pos) => ({ key: pos.key, spot: spots[pos.key], spotKey: `${sizeNow}`, canvas: textures[pos.key]?.canvas || null, version: textures[pos.key]?.version || 0 })),
    [positions, spots, sizeNow, textures],
  );

  /* ---------- actions ---------- */
  // While dragging, update the 3D tee at most once per screen frame.
  const liveQueue = useRef(null);
  const queueLive = (key, els) => {
    const first = !liveQueue.current;
    liveQueue.current = { key, elements: els };
    if (first) {
      requestAnimationFrame(() => {
        const next = liveQueue.current;
        liveQueue.current = null;
        if (next) setLive(next);
      });
    }
  };
  const toastTimer = useRef(null);
  const say = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  };
  // areas that already carry a print, and old designs' overlapping pairs
  const usedKeys = [...new Set(elements.map((e) => e.position))];
  const clashes = clashesIn(positions, usedKeys);
  const openArea = (key) => {
    const pos = positions.find((p) => p.key === key);
    if (!pos) return;
    // one print per overlapping spot: an empty area covered by a used one stays closed
    const blockers = usedKeys.includes(key) ? [] : blockersOf(key, positions, usedKeys);
    if (blockers.length) {
      say(`${pos.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first to use ${pos.label}.`);
      return;
    }
    setActive(key);
    setPanel("edit");
    setSelectedId((cur) => (elements.some((e) => e.id === cur && e.position === key) ? cur : elements.filter((e) => e.position === key).at(-1)?.id ?? null));
    setCamRequest({ area: key, side: pos.side, sleeve: pos.side === "left" || pos.side === "right", narrow, n: nextReq() });
  };
  const closeArea = () => {
    setActive(null);
    setSelectedId(null);
    setLive(null);
  };
  const ensureArea = () => {
    if (active) return positions.find((p) => p.key === active);
    const free = (p) => usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length;
    const main = positions.find((p) => p.side === "front" && p.main && free(p)) || positions.find((p) => p.side === "front" && free(p)) || positions.find(free) || positions[0];
    if (main) openArea(main.key);
    return main;
  };
  const goView = (view) => {
    closeArea();
    setCamRequest({ view, n: nextReq() });
  };

  const addElement = (pos, el) => {
    const full = { id: makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: elements.length + 1, ...el };
    commit((prev) => [...prev, full]);
    setSelectedId(full.id);
  };
  const textBox = (el, pos) => {
    // keep the centre, refresh width/height from the real text size
    const { W, H } = areaPx(pos);
    const m = measureText(el, H);
    const cx = (el.x ?? 50) + (el.width ?? 0) / 2;
    const cy = (el.y ?? 20) + (el.height ?? 0) / 2;
    const width = (m.w / W) * 100;
    const height = (m.h / H) * 100;
    return { ...el, width, height, x: cx - width / 2, y: cy - height / 2 };
  };
  const addText = (text) => {
    const pos = ensureArea();
    if (!pos) return;
    const base = { type: "text", text, fontFamily: "Anton", fontSizePct: 12, color: inkDefault, align: "center", effect: "straight", x: 50, y: 18 + (elements.filter((e) => e.position === pos.key).length % 4) * 18, width: 0, height: 0 };
    let el = textBox(base, pos);
    // long text: shrink so it fits inside the print area (90% wide)
    if (el.width > 90) el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
    addElement(pos, el);
  };
  const addImage = (pos, src, natW, natH, extra = {}) => {
    const { W, H } = areaPx(pos);
    const widthPct = 60;
    const heightPct = ((widthPct / 100) * W * (natH / natW) / H) * 100;
    const h = Math.min(heightPct, 90);
    const w = h < heightPct ? (widthPct * h) / heightPct : widthPct;
    addElement(pos, { type: "image", src, x: 50 - w / 2, y: 50 - h / 2, width: w, height: h, ...extra });
  };
  const updateSel = (patch, { measure = false } = {}) => {
    commit((prev) =>
      prev.map((e) => {
        if (e.id !== selectedId) return e;
        const next = { ...e, ...patch };
        return measure && next.type === "text" ? textBox(next, positions.find((p) => p.key === e.position)) : next;
      }),
    );
  };
  const removeSel = () => {
    commit((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
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

  // change tee colour; warn when some text would be hard to see on it
  const changeColour = (slug) => {
    setColourSlug(slug);
    const hex = colours.find((c) => c.slug === slug)?.hex;
    const faint = elements.filter((e) => e.type === "text" && Math.abs(lum(e.color) - lum(hex)) < 0.25);
    if (faint.length) say(`${faint.length === 1 ? "One text" : `${faint.length} texts`} may be hard to see on ${colours.find((c) => c.slug === slug)?.name}. Pick a different ink colour for ${faint.length === 1 ? "it" : "them"}.`);
  };
  const goToLogin = () => navigate("/login", { state: { from: location.pathname + location.search } });
  const pickUpload = () => {
    if (!isLoggedIn()) {
      say("Log in to upload your photo or logo — your design is saved and will be here when you come back.");
      return;
    }
    ensureArea();
    fileRef.current?.click();
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
      // keep defaults; the quality meter just won't show
    }
    setBusy("Uploading your image…");
    const res = await dispatch(uploadDesignImage(file));
    setBusy("");
    if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "Upload failed. Please try again.");
    addImage(pos, res.payload.path, natW, natH, { pxW: natW });
  };
  const pickArt = async (design) => {
    const pos = positions.find((p) => p.key === active) || ensureArea();
    if (!pos) return;
    try {
      const img = await loadImage(design.imageUrl);
      addImage(pos, design.imageUrl, img.naturalWidth, img.naturalHeight, { artDesignId: design._id, artPrice: design.price || 0 });
      setPanel("edit");
    } catch {
      say("That design couldn't be loaded. Please pick another.");
    }
  };

  /* keyboard: delete, nudge, undo/redo, duplicate */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        return redo();
      }
      if (!selectedId) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        return dupSel();
      }
      if (e.key === "Delete" || e.key === "Backspace") return removeSel();
      const step = e.shiftKey ? 5 : 0.5;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        const el = elements.find((x) => x.id === selectedId);
        if (el) updateSel({ x: (el.x || 0) + d[0], y: (el.y || 0) + d[1] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- steps ---------- */
  const enterRoom = () => {
    writeJSON(SIZE_KEY, sizeNow);
    setStep("design");
    setCamRequest({ view: "front", ms: 1800, n: nextReq() });
  };
  const toReview = () => {
    if (!elements.length) return say("Add a design first — tap a print area or use Text, Upload or Art.");
    if (clashes.length) return say(`${clashes[0][0].label} and ${clashes[0][1].label} overlap on the tee. Remove the print from one of them to continue.`);
    closeArea();
    setStep("review");
    setSpin(true);
    setQtys((q) => (Object.values(q).some((n) => n > 0) ? q : { [sizeNow]: 1 }));
    setCamRequest({ position: [0, 0.4, 5], n: nextReq() });
    // let the outline disappear from the textures, then take pictures
    // (retry for a few seconds in case the 3D view is still starting)
    captureMockups().then((m) => m && setShots(SIDES.map(([v, label]) => ({ label, url: m[v] }))));
  };

  // Pictures of each side (data URLs), taken from the 3D room without the editing outline.
  const captureMockups = async () => {
    await wait(450);
    for (let tries = 0; tries < 12 && !roomApi.current; tries++) await wait(300);
    const api = roomApi.current;
    if (!api) return null;
    const out = {};
    for (const [v] of SIDES) out[v] = await cropMockup(api.snapshot(v));
    return out;
  };

  // Save to My designs. Returns the saved design's id, or null.
  const saveDesign = async ({ name = designName, quiet = false } = {}) => {
    if (!isLoggedIn()) {
      goToLogin();
      return null;
    }
    if (!elements.length) {
      say("Add a design first — tap a print area or use Text, Upload or Art.");
      return null;
    }
    setSaveOpen(false);
    const wasEditing = active;
    closeArea();
    setBusy("Saving your design…");
    try {
      const mockups = shots?.length === 4 && step === "review"
        ? Object.fromEntries(shots.map((sh, i) => [SIDES[i][0], sh.url]))
        : await captureMockups();
      const body = { garmentType: type, color: colour.slug, size: sizeNow, elements, name: name || `${garment.label} design`, mockups: mockups || undefined };
      let saved;
      let copied = false;
      if (designId && !locked) {
        try {
          saved = await customizationService.updateDesign(designId, body);
        } catch (err) {
          if (err.response?.status === 409 || err.response?.status === 404) {
            saved = await customizationService.createDesign(body);
            copied = true;
          } else throw err;
        }
      } else {
        saved = await customizationService.createDesign(body);
        copied = !!(designId && locked);
      }
      onScreenId.current = saved._id;
      setDesignId(saved._id);
      setDesignName(saved.name);
      setLocked(false);
      setSavedAt(new Date());
      navigate(`/customize/${type}?design=${saved._id}`, { replace: true });
      if (!quiet) say(copied ? "Saved as a new design in My designs." : "Saved to My designs.");
      return saved;
    } catch (err) {
      say(err.response?.data?.message || "Couldn't save your design. Please try again.");
      return null;
    } finally {
      setBusy("");
      if (wasEditing && step === "design") openArea(wasEditing);
    }
  };
  // Review: show one side (stops the 360° turn) / turn again
  const showSide = (view) => {
    setSpin(false);
    setCamRequest({ view, n: nextReq() });
  };
  const turn360 = () => {
    setSpin(true);
    setCamRequest({ position: [0, 0.4, 5], n: nextReq() });
  };
  const backToDesign = () => {
    setStep("design");
    setShots(null);
    setCamRequest({ view: "front", n: nextReq() });
  };
  const chosen = Object.entries(qtys)
    .filter(([, n]) => n > 0)
    .map(([sz, n]) => ({ size: sz, qty: n }));
  const pieces = chosen.reduce((n, c) => n + c.qty, 0);
  const setQty = (sz, n) => setQtys((q) => ({ ...q, [sz]: Math.max(0, Math.min(99, n)) }));

  // Buy now: the design is saved to My designs (with its mockups); ordering locks it
  const order = async () => {
    if (!isLoggedIn()) return goToLogin();
    if (!pieces) return say("Choose at least one size and quantity.");
    const saved = await saveDesign({ quiet: true });
    if (!saved) return;
    navigate(`/buy-now/${saved._id}`, {
      state: {
        product: { _id: saved._id, brandname: saved.name || `${garment.label} — Custom Design`, images: saved.mockups?.front ? [saved.mockups.front] : [], price: unitPrice },
        items: chosen,
        isCustomization: true,
      },
    });
  };

  const addToCart = async () => {
    if (!isLoggedIn()) return goToLogin();
    if (!pieces) return say("Choose at least one size and quantity.");
    const saved = await saveDesign({ quiet: true });
    if (!saved) return;
    setBusy("Adding to your cart…");
    try {
      await customizationService.addDesignToCart(saved._id, chosen);
      dispatch(fetchCart(readJSON("userInfo")?.token));
      setCartNote({ pieces, name: saved.name });
    } catch (err) {
      say(err.response?.data?.message || "Couldn't add to your cart. Please try again.");
    } finally {
      setBusy("");
    }
  };

  /* ---------- render ---------- */
  if (!garment) {
    return (
      <div className="dr-center">
        {garmentsLoading || !garments.length ? "Opening the design room…" : (
          <span>
            We couldn't find that garment. <Link to="/customizable">Choose a garment</Link>
          </span>
        )}
      </div>
    );
  }

  const sel = elements.find((e) => e.id === selectedId) || null;
  // The editor always gets the committed design: feeding it the live drag
  // state would rebuild its items mid-drag (that made dragging slow / jumpy).
  const activeEls = elements.filter((e) => e.position === active);
  const usedSides = new Set(elements.map((e) => e.side));
  // Fit the print area in the panel without squeezing the controls below it:
  // at most the panel width, and at most about a third of the screen height.
  const editorW = (() => {
    if (!activePos) return 300;
    const { W, H } = areaPx(activePos);
    const maxW = narrow ? Math.min(220, window.innerWidth - 64) : 300;
    const maxH = narrow ? Math.min(170, window.innerHeight * 0.22) : Math.min(260, window.innerHeight * 0.34);
    return Math.round(Math.max(120, Math.min(maxW, (maxH * W) / H)));
  })();

  return (
    <div className="dr-app" data-step={step}>
      <header className="dr-top">
        <Link to="/customizable" className="dr-back" aria-label="Back to customizable garments">←</Link>
        <span className="dr-brand">IDENTEE</span>
        <span className="dr-crumb">
          Design room · <b>{garment.label} · {colour?.name} · {sizeNow}</b>
        </span>
        <nav className="dr-steps" aria-label="Steps">
          {[["design", "Design"], ["review", "Review"], ["qty", "Sizes & qty"], ["cart", "Cart"]].map(([k, label], i) => {
            const order = ["design", "review", "qty", "cart"];
            const cur = Math.max(0, order.indexOf(step === "fit" ? "design" : step));
            return (
              <span key={k} className={`dr-step${i === cur ? " on" : ""}${i < cur ? " done" : ""}`}>
                <span className="n">{i + 1}</span>
                {label}
              </span>
            );
          })}
        </nav>
        <div className="dr-savebox">
          {step !== "fit" && (
            <button type="button" className="dr-save" onClick={() => (isLoggedIn() ? setSaveOpen((o) => !o) : goToLogin())} aria-expanded={saveOpen}>
              {savedAt ? "Saved ✓" : "Save"}
            </button>
          )}
          <Link to="/my-designs" className="dr-mydesigns">My designs</Link>
          {saveOpen && (
            <form
              className="dr-savepop"
              onSubmit={(e) => {
                e.preventDefault();
                saveDesign({ name: e.currentTarget.elements.dname.value.trim() });
              }}
            >
              <label htmlFor="dr-dname">Design name</label>
              <input id="dr-dname" name="dname" defaultValue={designName || `${garment.label} design`} maxLength={60} autoFocus />
              {locked && <p>This design was ordered, so it will be saved as a new design.</p>}
              <div className="dr-row">
                <button type="button" className="dr-chip" onClick={() => setSaveOpen(false)}>Cancel</button>
                <button type="submit" className="dr-chip on">{designId && !locked ? "Save changes" : "Save to My designs"}</button>
              </div>
            </form>
          )}
        </div>
        <div className="dr-price">
          ₹{unitPrice.toLocaleString("en-IN")}
          <small>{artTotal ? `incl. ₹${artTotal} art` : "per piece"}</small>
        </div>
      </header>

      <main className="dr-stage">
        {model && colour && (
          <div className="dr-room">
          <Room3D
            ref={roomApi}
            model={model}
            colour={fabricHex}
            areas={areas3D}
            onPickArea={(k) => step === "design" && openArea(k)}
            camRequest={camRequest}
            interactive={step === "design"}
            still={!!active}
            autoRotate={step === "review" && spin}
          />
          </div>
        )}

        {step === "design" && (
          <>
            <div className="dr-rail left" role="radiogroup" aria-label="T-shirt colour">
              {colours.map((c) => (
                <button key={c.slug} type="button" role="radio" aria-checked={c.slug === colour?.slug} aria-label={c.name} title={c.name}
                  className={`dr-sw${c.slug === colour?.slug ? " on" : ""}`} style={{ background: c.hex }} onClick={() => changeColour(c.slug)} />
              ))}
            </div>
            <div className="dr-rail right" aria-label="Look at side">
              {SIDES.map(([k, label]) => (
                <button key={k} type="button" className={`dr-cam${usedSides.has(k) ? " has" : ""}`} onClick={() => goView(k)}>
                  {label}
                  <span className="dot" />
                </button>
              ))}
            </div>
            <div className="dr-sizechip">
              <label htmlFor="dr-size">Your size</label>
              <select id="dr-size" value={sizeNow} onChange={(e) => { setSize(e.target.value); writeJSON(SIZE_KEY, e.target.value); }}>
                {sizes.map((s) => <option key={s}>{s}</option>)}
              </select>
              {chartRow && <span className="m">chest {chartRow.chest}″ · length {chartRow.length}″ · true to size</span>}
            </div>
            {!active && <div className="dr-hint">Drag to turn the tee · pinch or scroll to zoom · tap a print area to design it</div>}
            <div className="dr-areas" aria-label="Print areas">
              {positions.map((p) => {
                const [w, h] = areaCm(p, sizeNow);
                const used = usedKeys.includes(p.key);
                const blockedBy = used ? [] : blockersOf(p.key, positions, usedKeys);
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`dr-area${active === p.key ? " on" : ""}${used ? " used" : ""}${blockedBy.length ? " blocked" : ""}`}
                    title={blockedBy.length ? `Overlaps ${blockedBy.map((b) => b.label).join(" and ")}` : undefined}
                    aria-disabled={blockedBy.length ? "true" : undefined}
                    onClick={() => openArea(p.key)}
                  >
                    {p.label} <span>{w}×{h}</span>
                  </button>
                );
              })}
            </div>
            <div className="dr-credit">
              <a href={model?.credit.href} target="_blank" rel="noopener noreferrer">{model?.credit.text}</a>
            </div>
          </>
        )}

        {step === "design" && activePos && (
          <section className="dr-editor" aria-label={`Edit ${activePos.label}`}>
            <header>
              <div>
                <h2>{panel === "art" ? "Art library" : activePos.label}</h2>
                <div className="sub">
                  {panel === "art" ? `Adds to ${activePos.label}` : `${areaPx(activePos).wCm} × ${areaPx(activePos).hCm} cm at size ${sizeNow} · drag, pinch or use the handles`}
                </div>
              </div>
              <button type="button" className="dr-x" aria-label={panel === "art" ? "Back to editor" : "Close editor"} onClick={() => (panel === "art" ? setPanel("edit") : closeArea())}>
                {panel === "art" ? "←" : "✕"}
              </button>
            </header>

            {panel === "art" ? (
              <ArtPanel categories={artCategories} designs={artDesigns} onOpen={(id) => dispatch(fetchArtDesigns(id))} onPick={pickArt} />
            ) : (
              <>
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
                <Controls
                  sel={sel}
                  areaCmW={areaPx(activePos).wCm}
                  onIdea={addText}
                  onAddText={() => addText("YOUR TEXT")}
                  onUpload={pickUpload}
                  onArt={() => setPanel("art")}
                  onPatch={updateSel}
                  onDelete={removeSel}
                  onDuplicate={dupSel}
                  onLayer={layerSel}
                  canUndo={histSize.past > 0}
                  canRedo={histSize.future > 0}
                  onUndo={undo}
                  onRedo={redo}
                />
              </>
            )}
          </section>
        )}

        {step === "review" && (
          <>
            <div className="dr-spinbar" role="group" aria-label="3D view">
              <button type="button" className={spin ? "on" : ""} onClick={turn360} aria-pressed={spin}>
                ⟳ 360°
              </button>
              <button type="button" className={!spin ? "on" : ""} onClick={() => setSpin(false)} aria-pressed={!spin}>
                ❚❚ Pause
              </button>
            </div>
            <section className="dr-review" aria-label="Review your design">
              <div>
                <div className="eyebrow">Review your design</div>
                <p className="dr-review-hint">Tap a side to look at it on the tee, or watch it turn 360°.</p>
              </div>
              <div className="dr-shots">
                {(shots || SIDES.map(([, label]) => ({ label, url: null }))).map((sh, i) => (
                  <button key={sh.label} type="button" className="dr-shot" onClick={() => showSide(SIDES[i][0])} aria-label={`Show the ${sh.label.toLowerCase()} on the 3D tee`}>
                    {sh.url ? <img src={sh.url} alt="" /> : <div className="ph" />}
                    <span>{sh.label}</span>
                  </button>
                ))}
              </div>
              <div className="dr-qty" aria-label="Sizes and quantity">
                <div className="eyebrow">Sizes &amp; quantity</div>
                {sizes.map((sz) => {
                  const r = garment.sizeChart?.find((x) => x.size === sz);
                  const n = qtys[sz] || 0;
                  return (
                    <div key={sz} className={`dr-qrow${n ? " on" : ""}`}>
                      <b>{sz}</b>
                      <small>{r ? `chest ${r.chest}″ · length ${r.length}″` : ""}</small>
                      <div className="dr-stepper">
                        <button type="button" onClick={() => setQty(sz, n - 1)} disabled={!n} aria-label={`One less ${sz}`}>−</button>
                        <output aria-live="polite">{n}</output>
                        <button type="button" onClick={() => setQty(sz, n + 1)} aria-label={`One more ${sz}`}>+</button>
                      </div>
                    </div>
                  );
                })}
                <p className="dr-qnote">Every size is printed at its own true size from the print guide.</p>
              </div>
              <div className="dr-summary">
                <div>
                  <p>
                    {garment.label} · {colour?.name} · size <b>{sizeNow}</b>
                  </p>
                  <p className="muted">
                    {positions
                      .filter((p) => elements.some((e) => e.position === p.key))
                      .map((p) => `${p.label} ${areaCm(p, sizeNow).join(" × ")} cm`)
                      .join(" · ")}
                  </p>
                </div>
                <div className="dr-total">
                  ₹{(unitPrice * pieces).toLocaleString("en-IN")}
                  <small>{pieces} × ₹{unitPrice.toLocaleString("en-IN")}</small>
                </div>
              </div>
            </section>
          </>
        )}

        {step === "fit" && (
          <Fitting
            garment={garment}
            colours={colours}
            colour={colour}
            onColour={setColourSlug}
            sizes={sizes}
            size={sizeNow}
            onSize={setSize}
            onEnter={() => {
              setEarlier(null);
              enterRoom();
            }}
            credit={model?.credit}
            earlier={earlier}
            onContinue={continueEarlier}
          />
        )}

        {cartNote && (
          <div className="dr-overlay" role="dialog" aria-modal="true" aria-label="Added to cart">
            <div className="dr-fit dr-added">
              <div>
                <div className="eyebrow">Added to your cart</div>
                <h1>
                  {cartNote.pieces} piece{cartNote.pieces === 1 ? "" : "s"} of “{cartNote.name}”
                </h1>
                <p>Want a different design too? Make another one — everything goes into the same cart and you pay once.</p>
              </div>
              <div className="dr-added-actions">
                {/* full reload: a fresh, empty design (this one is saved in My designs) */}
                <button type="button" className="dr-enter" onClick={() => window.location.assign(`/customize/${type}?new=1&color=white`)}>
                  + Design another tee
                </button>
                <Link to="/cart" className="dr-cta">Go to cart ({cartCount} item{cartCount === 1 ? "" : "s"}) →</Link>
                <button type="button" className="dr-cta ghost" onClick={() => setCartNote(null)}>Keep editing this one</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="dr-toast" role="status">{toast}{/log in/i.test(toast) && <button type="button" onClick={goToLogin}>Log in</button>}</div>}
        {busy && <div className="dr-busy" role="status">{busy}</div>}
      </main>

      <nav className="dr-dock" aria-label="Design tools">
        {step === "design" ? (
          <>
            <Tool label="Text" onClick={() => addText("YOUR TEXT")} icon="M5 6V4h14v2M12 4v16M9 20h6" />
            <Tool label="Upload" onClick={pickUpload} icon="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            <Tool label="Art" onClick={() => { ensureArea(); setPanel("art"); }} icon="M4 5h16v14H4zM8 13l3-3 5 5M15 9h.01" />
            <Tool label="Ideas" onClick={() => addText(IDEAS[Math.floor(Math.random() * IDEAS.length)])} icon="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z" />
            <Tool label="AI" soon onClick={() => say("AI designs are coming soon.")} icon="m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3Z" />
            <button type="button" className="dr-cta" onClick={toReview}>Review →</button>
          </>
        ) : step === "review" ? (
          <>
            <button type="button" className="dr-cta ghost" onClick={backToDesign}>← Edit design</button>
            <button type="button" className="dr-cta" onClick={addToCart} disabled={!!busy || !pieces}>Add to cart</button>
            <button type="button" className="dr-cta gold" onClick={order} disabled={!!busy || !pieces}>
              Buy now · {pieces} pc{pieces === 1 ? "" : "s"} · ₹{(unitPrice * pieces).toLocaleString("en-IN")} →
            </button>
          </>
        ) : null}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
      </nav>
    </div>
  );
}

/* ---------- pieces ---------- */
function Tool({ label, icon, onClick, soon }) {
  return (
    <button type="button" className={`dr-tool${soon ? " soon" : ""}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={icon} />
      </svg>
      {label}
      {soon && <small>soon</small>}
    </button>
  );
}

function Fitting({ garment, colours, colour, onColour, sizes, size, onSize, onEnter, credit, earlier, onContinue }) {
  return (
    <div className="dr-overlay">
      <div className="dr-fit">
        {earlier && (
          <div className="dr-resume">
            <span>
              You have an unfinished design ({earlier.elements.length} item{earlier.elements.length === 1 ? "" : "s"}
              {earlier.name ? ` · ${earlier.name}` : ""}).
            </span>
            <button type="button" onClick={onContinue}>Continue it</button>
          </div>
        )}
        <div>
          <div className="eyebrow">Step into the studio</div>
          <h1>Your {garment.label}</h1>
          <p>Pick a colour and your size. The room shows every print true to size.</p>
        </div>
        <div>
          <div className="eyebrow">Colour · {colour?.name}</div>
          <div className="dr-swgrid">
            {colours.map((c) => (
              <button key={c.slug} type="button" className={`dr-swbig${c.slug === colour?.slug ? " on" : ""}`} onClick={() => onColour(c.slug)}>
                <i style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow">Size (chest / length, inches)</div>
          <div className="dr-sizes">
            {sizes.map((s) => {
              const r = garment.sizeChart?.find((x) => x.size === s);
              return (
                <button key={s} type="button" className={`dr-sz${s === size ? " on" : ""}`} onClick={() => onSize(s)}>
                  {s}
                  {r && <small>{r.chest}″ / {r.length}″</small>}
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="dr-enter" onClick={onEnter}>Enter design room →</button>
        <div className="dr-fitfoot">
          {garment.basePrice > 0 && <span>From ₹{garment.basePrice}</span>}
          {credit && <a href={credit.href} target="_blank" rel="noopener noreferrer">{credit.text}</a>}
        </div>
      </div>
    </div>
  );
}

function Controls({ sel, areaCmW, onIdea, onAddText, onUpload, onArt, onPatch, onDelete, onDuplicate, onLayer, canUndo, canRedo, onUndo, onRedo }) {
  const quality = () => {
    if (!sel?.pxW) return null;
    const printCm = ((sel.width || 0) / 100) * areaCmW;
    const dpi = Math.round(sel.pxW / (printCm / 2.54));
    const cls = dpi >= 150 ? "good" : dpi >= 100 ? "ok" : "low";
    const word = { good: "Good", ok: "OK", low: "Low — may print blurry" }[cls];
    return (
      <div className="dr-quality">
        Print quality: <b className={cls}>{word}</b> · {dpi} DPI at {printCm.toFixed(1)} cm wide
      </div>
    );
  };
  return (
    <div className="dr-controls">
      <div className="dr-row">
        <button type="button" className="dr-chip" onClick={onAddText}>+ Text</button>
        <button type="button" className="dr-chip" onClick={onUpload}>+ Upload</button>
        <button type="button" className="dr-chip" onClick={onArt}>+ Art</button>
        <span className="dr-spacer" />
        <button type="button" className="dr-chip" onClick={onUndo} disabled={!canUndo} aria-label="Undo">↶</button>
        <button type="button" className="dr-chip" onClick={onRedo} disabled={!canRedo} aria-label="Redo">↷</button>
      </div>
      {!sel && (
        <>
          <div className="dr-row">
            {IDEAS.slice(0, 4).map((t) => (
              <button key={t} type="button" className="dr-chip idea" onClick={() => onIdea(t)}>{t}</button>
            ))}
          </div>
          <p className="dr-empty">Tap something on the print area to edit it, or add text, a photo, art or an idea.</p>
        </>
      )}
      {sel?.type === "text" && (
        <>
          <label className="dr-field">
            Text
            <input type="text" value={sel.text} maxLength={60} onChange={(e) => onPatch({ text: e.target.value || " " }, { measure: true })} />
          </label>
          <div className="dr-row">
            <label className="dr-field">
              Font
              <select value={sel.fontFamily} onChange={(e) => onPatch({ fontFamily: e.target.value }, { measure: true })}>
                {[...new Set([sel.fontFamily, ...FONTS])].map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="dr-field">
              Shape
              <select value={sel.effect || "straight"} onChange={(e) => onPatch({ effect: e.target.value }, { measure: true })}>
                <option value="straight">Straight</option>
                <option value="arc-up">Arc up</option>
                <option value="arc-down">Arc down</option>
              </select>
            </label>
          </div>
          <div className="dr-row" aria-label="Text style">
            <button type="button" className={`dr-chip${sel.bold ? " on" : ""}`} onClick={() => onPatch({ bold: !sel.bold }, { measure: true })}><b>B</b></button>
            <button type="button" className={`dr-chip${sel.italic ? " on" : ""}`} onClick={() => onPatch({ italic: !sel.italic }, { measure: true })}><i>I</i></button>
            <button type="button" className={`dr-chip${sel.underline ? " on" : ""}`} onClick={() => onPatch({ underline: !sel.underline })}><u>U</u></button>
            {INKS.map((k) => (
              <button key={k} type="button" className={`dr-ink${k === sel.color ? " on" : ""}`} style={{ background: k }} aria-label={`Ink ${k}`} onClick={() => onPatch({ color: k })} />
            ))}
            <input type="color" className="dr-inkpick" value={sel.color} aria-label="Pick any ink colour" onChange={(e) => onPatch({ color: e.target.value.toUpperCase() })} />
          </div>
          <label className="dr-field">
            Size
            <input type="range" min="2" max="60" step="0.5" value={sel.fontSizePct} onChange={(e) => onPatch({ fontSizePct: +e.target.value }, { measure: true })} />
          </label>
        </>
      )}
      {sel?.type === "image" && (
        <>
          {quality()}
          {sel.artPrice ? <div className="dr-quality">Art design · +₹{sel.artPrice}</div> : null}
          <label className="dr-field">
            Size
            <input
              type="range"
              min="8"
              max="100"
              value={Math.round(sel.width || 50)}
              onChange={(e) => {
                const w = +e.target.value;
                const ratio = (sel.height || 50) / (sel.width || 50);
                const cx = (sel.x || 0) + (sel.width || 0) / 2;
                const cy = (sel.y || 0) + (sel.height || 0) / 2;
                onPatch({ width: w, height: w * ratio, x: cx - w / 2, y: cy - (w * ratio) / 2 });
              }}
            />
          </label>
        </>
      )}
      {sel && (
        <>
          <label className="dr-field">
            Rotate
            <input type="range" min="-180" max="180" value={sel.rotation || 0} onChange={(e) => onPatch({ rotation: +e.target.value })} />
          </label>
          <div className="dr-row">
            <button type="button" className="dr-chip" onClick={() => onPatch({ x: 50 - (sel.width || 0) / 2 })}>Centre</button>
            <button type="button" className="dr-chip" onClick={onDuplicate}>Duplicate</button>
            <button type="button" className="dr-chip" onClick={() => onLayer(1)}>Bring forward</button>
            <button type="button" className="dr-chip" onClick={() => onLayer(-1)}>Send back</button>
            <button type="button" className="dr-chip danger" onClick={onDelete}>Delete</button>
          </div>
        </>
      )}
    </div>
  );
}

function ArtPanel({ categories, designs, onOpen, onPick }) {
  const [cat, setCat] = useState(null);
  if (!cat) {
    return (
      <div className="dr-controls">
        {categories.length === 0 && <p className="dr-empty">No art categories yet.</p>}
        <div className="dr-artcats">
          {categories.map((c) => (
            <button key={c._id} type="button" className="dr-artcat" onClick={() => { setCat(c); onOpen(c._id); }}>
              {c.thumbnail && <img src={imageUrl(c.thumbnail, 200)} alt="" />}
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const list = designs.filter((d) => String(d.category?._id || d.category) === String(cat._id));
  return (
    <div className="dr-controls">
      <button type="button" className="dr-chip" onClick={() => setCat(null)}>← All categories</button>
      <div className="dr-artgrid">
        {list.map((d) => (
          <button key={d._id} type="button" className="dr-artitem" onClick={() => onPick(d)}>
            <img src={imageUrl(d.imageUrl, 240)} alt={d.name} />
            <span>{d.name}</span>
            <b>{d.price ? `+₹${d.price}` : "Free"}</b>
          </button>
        ))}
        {list.length === 0 && <p className="dr-empty">Loading designs…</p>}
      </div>
    </div>
  );
}
