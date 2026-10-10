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
import { AreaRenderer, cachedImage, imageSrcs, loadImage, measureText } from "./konvaRender";
import { areaCm, blockersOf, clashesIn, modelForGarment, placeArea } from "./teeModel";
import AreaThumb from "./AreaThumb";
import Assistant from "./Assistant";
import { firstMessages } from "./assistantScript";
import { FONTS, addStudioFonts } from "./fonts";
import "./designRoom.css";

const PX_PER_CM = 24; // texture / editor resolution (print files are made separately at 300 DPI)
const MIN_AREA_PX = 480; // small areas (sleeves, chest) are drawn finer so they stay sharp on the 3D tee
const INKS = ["#FFFFFF", "#141110", "#C9A24B", "#C2352C", "#2441B5", "#1C5A2B", "#F0C24C", "#B7A2E0", "#F08A24", "#8DC1EC"];
// what can be added to a print area — the tabs in the editor: [key, label, icon path]
const ADD_TABS = [
  ["text", "Text", "M5 6V4h14v2M12 4v16M9 20h6"],
  ["upload", "Upload", "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"],
  ["art", "Art", "M4 5h16v14H4zM8 13l3-3 5 5M15 9h.01"],
  ["ideas", "Ideas", "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z"],
  ["ai", "Assistant", "m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3Z"],
];
const ICON_AREAS = "M8 4 4 6.5 2 10l3 1.5V20h14v-8.5L22 10l-2-3.5L16 4a4 4 0 0 1-8 0Z";
const ICON_ADD = "M12 5v14M5 12h14";
const AREA_GROUPS = [
  ["Front", ["front"]],
  ["Back", ["back"]],
  ["Sleeves", ["left", "right"]],
];
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
  // Step 1 (left): where to print. Step 2 (right, in the editor): what to add.
  const [addTab, setAddTab] = useState("text");
  const [chat, setChat] = useState(firstMessages); // the assistant's conversation (kept while you switch tabs)
  const [areasOpen, setAreasOpen] = useState(false); // phones: the "where to print" sheet
  const [pickOpen, setPickOpen] = useState(false); // colour & size menu in the top bar
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
    // Draw again only when a picture or font was still loading. (Doing this on
    // every drag frame redrew every print area twice and made dragging slow.)
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
  // The drag is painted straight onto the area's picture and the 3D tee is
  // told to show it again — the page itself is not redrawn until you let go.
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
          lastSig.current.delete(next.key); // the picture no longer matches the saved design
          roomApi.current.touch(next.key);
        } else {
          setLive(next);
        }
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
    setAreasOpen(false);
    setSelectedId((cur) => (elements.some((e) => e.id === cur && e.position === key) ? cur : elements.filter((e) => e.position === key).at(-1)?.id ?? null));
    // the editor is a column beside the 3D view (not on top of it), so the area can fill the view
    setCamRequest({ area: key, side: pos.side, sleeve: pos.side === "left" || pos.side === "right", narrow, overlayPx: 0, fill: 0.74, lift: 0.03, keep: true, n: nextReq() });
  };
  // keep the card of the area being edited in view in the card strip
  useEffect(() => {
    if (!active) return;
    document.querySelector(".dr-area.on")?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [active]);
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
  // phones' "Add" button: open an area's editor on its Add tabs
  const startAdding = () => {
    const pos = ensureArea();
    if (!pos) return;
    if (active !== pos.key) openArea(pos.key);
    setAreasOpen(false);
    setSelectedId(null);
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
  // opts: { effect: "arc-up", vertical: true (text runs down the area), small: true }
  const addText = (text, opts = {}) => {
    const pos = ensureArea();
    if (!pos) return;
    const base = { type: "text", text, fontFamily: "Anton", fontSizePct: opts.small ? 7 : 12, color: inkDefault, align: "center", effect: opts.effect || "straight", x: 50, y: 18 + (elements.filter((e) => e.position === pos.key).length % 4) * 18, width: 0, height: 0 };
    let el = textBox(base, pos);
    if (opts.vertical) {
      // turned 90°: its length runs down the area, so fit it to 90% of the area's height
      const { W, H } = areaPx(pos);
      const lengthPctOfHeight = ((el.width / 100) * W / H) * 100;
      if (lengthPctOfHeight > 90) el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / lengthPctOfHeight }, pos);
      el = { ...el, rotation: 90, x: 50 - el.width / 2, y: 50 - el.height / 2 };
    } else if (el.width > 90) {
      // long text: shrink so it fits inside the print area (90% wide)
      el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
    }
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
  // the assistant tab takes the whole panel (the tee on the left shows the area)
  const chatting = addTab === "ai" && !elements.some((e) => e.id === selectedId && e.position === active);
  // Fit the print area in the panel without squeezing the controls below it:
  // at most the panel width, and at most about a third of the screen height.
  const editorW = (() => {
    if (!activePos) return 300;
    const { W, H } = areaPx(activePos);
    const maxW = narrow ? Math.min(220, window.innerWidth - 64) : 300;
    // Tall, thin areas (Vertical Front 10 × 52 cm …) get a taller box, but
    // never so tall that the controls below it are pushed out of the panel.
    const tall = H / W > 2;
    const maxH = narrow
      ? Math.min(tall ? 240 : 170, window.innerHeight * (tall ? 0.3 : 0.22))
      : Math.min(tall ? 330 : 260, window.innerHeight * (tall ? 0.42 : 0.34));
    return Math.round(Math.max(tall ? 40 : 120, Math.min(maxW, (maxH * W) / H)));
  })();

  return (
    <div className="dr-app" data-step={step}>
      <header className="dr-top">
        <Link to="/customizable" className="dr-back" aria-label="Back to customizable garments">←</Link>
        <span className="dr-brand">IDENTEE</span>
        {step === "design" ? (
          <div className="dr-pick">
            <button type="button" className="dr-pickbtn" aria-expanded={pickOpen} aria-haspopup="dialog" onClick={() => setPickOpen((o) => !o)}>
              <i style={{ background: fabricHex }} aria-hidden="true" />
              <span>
                <b>{garment.label}</b> {colour?.name} · {sizeNow}
              </span>
              <span aria-hidden="true">▾</span>
            </button>
            {pickOpen && (
              <>
                <div className="dr-scrim" onClick={() => setPickOpen(false)} />
                <div className="dr-pickpop" role="dialog" aria-label="Colour and size">
                  <div className="eyebrow">Colour · {colour?.name}</div>
                  <div className="dr-pickcolours" role="radiogroup" aria-label="T-shirt colour">
                    {colours.map((c) => (
                      <button key={c.slug} type="button" role="radio" aria-checked={c.slug === colour?.slug} aria-label={c.name} title={c.name}
                        className={`dr-sw${c.slug === colour?.slug ? " on" : ""}`} style={{ background: c.hex }} onClick={() => changeColour(c.slug)} />
                    ))}
                  </div>
                  <div className="eyebrow">Your size</div>
                  <div className="dr-picksizes">
                    {sizes.map((sz) => {
                      const r = garment.sizeChart?.find((x) => x.size === sz);
                      return (
                        <button key={sz} type="button" className={`dr-sz${sz === sizeNow ? " on" : ""}`} aria-pressed={sz === sizeNow}
                          onClick={() => { setSize(sz); writeJSON(SIZE_KEY, sz); }}>
                          {sz}
                          {r && <small>{r.chest}″ / {r.length}″</small>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="dr-qnote">Chest / length in inches. Every print is shown at its true size for {sizeNow}.</p>
                  <button type="button" className="dr-chip on" onClick={() => setPickOpen(false)}>Done</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <span className="dr-crumb">
            Design room · <b>{garment.label} · {colour?.name} · {sizeNow}</b>
          </span>
        )}
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
              {
                <>
                  <p className="dr-empty">Pick a spot. Each tee shows one print area at its real size for {sizeNow}.</p>
                  {AREA_GROUPS.map(([title, sides]) => {
                    const list = positions.filter((p) => sides.includes(p.side));
                    if (!list.length) return null;
                    return (
                      <div key={title}>
                        <div className="eyebrow">{title}</div>
                        <div className="dr-cards">
                          {list.map((p) => {
                            const [w, h] = areaCm(p, sizeNow);
                            const used = usedKeys.includes(p.key);
                            const blockedBy = used ? [] : blockersOf(p.key, positions, usedKeys);
                            return (
                              <button
                                key={p.key}
                                type="button"
                                className={`dr-area${active === p.key ? " on" : ""}${used ? " used" : ""}${blockedBy.length ? " blocked" : ""}`}
                                title={blockedBy.length ? `Overlaps ${blockedBy.map((b) => b.label).join(" and ")} — remove that design first` : `${p.label} · ${w} × ${h} cm`}
                                aria-label={`${p.label}, ${w} by ${h} cm${used ? ", has a design" : ""}${blockedBy.length ? `, blocked by ${blockedBy.map((b) => b.label).join(" and ")}` : ""}`}
                                aria-disabled={blockedBy.length ? "true" : undefined}
                                aria-pressed={active === p.key}
                                onClick={() => openArea(p.key)}
                              >
                                {/* one small tee per print area, with just that area's box */}
                                <AreaThumb position={p} size={sizeNow} />
                                <b>{p.label}</b>
                                <span>{w}×{h} cm</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="dr-empty">Gold box = has a design. Faded = covered by another design.</p>
                </>
              }

            </div>
          </aside>
        )}

        <div className="dr-view">
          {model && colour && (
            <div className="dr-room" data-editing={active ? "1" : undefined}>
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
              <div className="dr-undo" role="group" aria-label="Undo and redo">
                <button type="button" onClick={undo} disabled={histSize.past === 0} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
                <button type="button" onClick={redo} disabled={histSize.future === 0} aria-label="Redo" title="Redo (Ctrl+Y)">↷</button>
              </div>
              {!active && <div className="dr-hint">Drag to turn the tee · scroll or pinch to zoom</div>}
              <div className="dr-viewsw" role="group" aria-label="Look at side">
                {SIDES.map(([k, label]) => (
                  <button key={k} type="button" className={usedSides.has(k) ? "has" : ""} onClick={() => goView(k)}>
                    {label}
                    <span className="dot" />
                  </button>
                ))}
              </div>
              <div className="dr-credit">
                <a href={model?.credit.href} target="_blank" rel="noopener noreferrer">{model?.credit.text}</a>
              </div>
            </>
          )}
        </div>

        {step === "design" && (
          <nav className="dr-tools" aria-label="Design steps">
            <button type="button" className={`dr-toolbtn${areasOpen ? " on" : ""}`} aria-pressed={areasOpen} onClick={() => setAreasOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON_AREAS} />
              </svg>
              Where to print
            </button>
            <button type="button" className="dr-toolbtn" onClick={startAdding}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON_ADD} />
              </svg>
              Add text or picture
            </button>
          </nav>
        )}

        {step === "design" && activePos && (
          <section className="dr-editor" aria-label={`Edit ${activePos.label}`}>
            <header>
              <div>
                <div className="eyebrow">Step 2 · {activePos.label}</div>
                <h2>{sel ? (sel.type === "text" ? "Edit text" : "Edit picture") : "What to add"}</h2>
                <div className="sub">
                  {areaPx(activePos).wCm} × {areaPx(activePos).hCm} cm at size {sizeNow}
                </div>
              </div>
              <button type="button" className="dr-x" aria-label="Close editor" onClick={() => goView(activePos.side)}>✕</button>
            </header>
            {!chatting && (
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
            )}
            {!chatting && (
            <div className="dr-ruler" style={{ width: editorW }}>
              <span>0</span>
              <span>{areaPx(activePos).wCm} cm</span>
            </div>
            )}
            {sel ? (
              <Controls
                sel={sel}
                areaCmW={areaPx(activePos).wCm}
                areaRatio={areaPx(activePos).W / areaPx(activePos).H}
                onPatch={updateSel}
                onDelete={removeSel}
                onDuplicate={dupSel}
                onLayer={layerSel}
                onAddMore={() => setSelectedId(null)}
              />
            ) : (
              <>
                <div className="dr-addtabs" role="tablist" aria-label="What to add">
                  {ADD_TABS.map(([k, label, icon]) => (
                    <button key={k} type="button" role="tab" aria-selected={addTab === k} className={`dr-addtab${addTab === k ? " on" : ""}`} onClick={() => setAddTab(k)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={icon} />
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>
                {chatting ? (
                  <Assistant messages={chat} setMessages={setChat} areaLabel={activePos.label} onAddText={(t) => addText(t)} onGo={setAddTab} />
                ) : (
                <div className="dr-controls">

                {addTab === "text" && (
                  <>
                    <button type="button" className="dr-add big" onClick={() => addText("YOUR TEXT")}>Add a heading</button>
                    <button type="button" className="dr-add" onClick={() => addText("your text here", { small: true })}>Add a small line</button>
                    <div className="dr-two">
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { effect: "arc-up" })}>Curved up</button>
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { effect: "arc-down" })}>Curved down</button>
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { vertical: true })}>Vertical (runs down)</button>
                    </div>
                    <p className="dr-empty">Change the words, font, colour and size after adding.</p>
                  </>
                )}

                {addTab === "upload" && (
                  <>
                    <button type="button" className="dr-drop" onClick={pickUpload}>
                      <b>Upload a photo or logo</b>
                      <span>JPG, PNG or WebP · up to 10 MB</span>
                    </button>
                    <p className="dr-empty">A print-quality check shows if a picture is too small to print sharp.</p>
                  </>
                )}

                {addTab === "art" && <ArtPanel categories={artCategories} designs={artDesigns} onOpen={(id) => dispatch(fetchArtDesigns(id))} onPick={pickArt} />}

                {addTab === "ideas" && (
                  <>
                    <p className="dr-empty">Tap a line to put it on the tee, then change the words.</p>
                    <div className="dr-idealist">
                      {IDEAS.map((t) => (
                        <button key={t} type="button" className="dr-add idea" onClick={() => addText(t)}>{t}</button>
                      ))}
                    </div>
                  </>
                )}

                </div>
                )}
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

      {step === "review" && (
        <nav className="dr-dock" aria-label="Order">
          <button type="button" className="dr-cta ghost" onClick={backToDesign}>← Edit design</button>
          <button type="button" className="dr-cta" onClick={addToCart} disabled={!!busy || !pieces}>Add to cart</button>
          <button type="button" className="dr-cta gold" onClick={order} disabled={!!busy || !pieces}>
            Buy now · {pieces} pc{pieces === 1 ? "" : "s"} · ₹{(unitPrice * pieces).toLocaleString("en-IN")} →
          </button>
        </nav>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
    </div>
  );
}

/* ---------- pieces ---------- */
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

function Controls({ sel, areaCmW, areaRatio, onPatch, onDelete, onDuplicate, onLayer, onAddMore }) {
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
      <div className="dr-addhead">
        <span>Tap another item on the print area to edit it</span>
        <button type="button" className="dr-chip" onClick={onAddMore}>+ Add more</button>
      </div>
      {sel?.type === "text" && (
        <>
          <label className="dr-field">
            Text
            <input type="text" value={sel.text} maxLength={60} onChange={(e) => onPatch({ text: e.target.value || " " }, { measure: true })} />
          </label>
          <label className="dr-field">
            Font
            <select value={sel.fontFamily} onChange={(e) => onPatch({ fontFamily: e.target.value }, { measure: true })}>
              {[...new Set([sel.fontFamily, ...FONTS])].map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <div className="dr-field">
            Shape
            <div className="dr-seg" role="group" aria-label="Text shape">
              {[
                ["straight", "Straight"],
                ["arc-up", "Curved up"],
                ["arc-down", "Curved down"],
                ["vertical", "Vertical"],
              ].map(([k, label]) => {
                const vertical = Math.abs(sel.rotation || 0) === 90;
                const now = vertical ? "vertical" : sel.effect || "straight";
                return (
                  <button
                    key={k}
                    type="button"
                    className={now === k ? "on" : ""}
                    aria-pressed={now === k}
                    onClick={() => {
                      if (k === "vertical") {
                        // turned 90°: its length runs down the area — shrink it to fit the height, and centre it
                        const lengthPct = (sel.width || 0) * areaRatio;
                        const fit = lengthPct > 90 ? 90 / lengthPct : 1;
                        onPatch({ effect: "straight", rotation: 90, fontSizePct: (sel.fontSizePct || 12) * fit, x: 50 - (sel.width || 0) / 2, y: 50 - (sel.height || 0) / 2 }, { measure: true });
                      } else {
                        onPatch({ effect: k, ...(vertical ? { rotation: 0 } : {}) }, { measure: true });
                      }
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
            {sel.type === "image" && (
              <button
                type="button"
                className="dr-chip"
                title="Make the picture as big as the print area allows"
                onClick={() => {
                  // picture's shape (width ÷ height) against the area's: fill the tighter direction
                  const shape = ((sel.width || 50) / (sel.height || 50)) * areaRatio;
                  const width = shape > areaRatio ? 100 : (100 * shape) / areaRatio;
                  const height = shape > areaRatio ? (100 * areaRatio) / shape : 100;
                  onPatch({ width, height, x: 50 - width / 2, y: 50 - height / 2, rotation: 0 });
                }}
              >
                Fill area
              </button>
            )}
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
