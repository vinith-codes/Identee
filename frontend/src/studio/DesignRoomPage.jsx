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
import { AreaRenderer, cachedImage, imageSrcs, loadImage, measureText, playerElements, printThumb } from "./konvaRender";
import { MAX_PLAYERS, NAME_MAX, NUMBER_MAX, filled, hasRoles, parsePlayers, rolesIn, sizeCounts } from "./teamOrder";
import { areaCm, blockersOf, clashesIn, modelForGarment, placeArea } from "./teeModel";
import AreaThumb from "./AreaThumb";
import Rolling from "./Rolling";
import Assistant from "./Assistant";
import { AFTER_AI_SLOGANS, AFTER_DESIGN_CHIPS, DRAW_MINE, DRAW_THIS, IN_DRAW_TAB, bot as botSays, checkMessages, chips as chipRow, firstMessages, firstState } from "./assistantScript";
import aiService from "../services/aiService";
import { applyAiOps, areaFor, describeDesign } from "./aiOps";
import WaitCard from "./WaitCard";
import PriceTag from "../components/PriceTag";
import { shippingNote, useShippingRule, useSiteOffer } from "../utils/sitePricing";
import PhotoStudio from "./PhotoStudio";
import DrawStudio from "./DrawStudio";
import { checkDesign, inksFor, printSharpness } from "./designCheck";
import { TEMPLATES } from "./designTemplates";
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
];
const ICON_AI = "m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3Z";
const AI_TABS = [["chat", "Chat"], ["draw", "Draw"], ["photo", "Photo"]];
const ICON_PHOTO = "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z";
const ICON_AREAS = "M8 4 4 6.5 2 10l3 1.5V20h14v-8.5L22 10l-2-3.5L16 4a4 4 0 0 1-8 0Z";
const ICON_ADD = "M12 5v14M5 12h14";
const AREA_GROUPS = [
  ["Front", ["front"]],
  ["Back", ["back"]],
  ["Sleeves", ["left", "right"]],
  ["Shorts", ["shorts"]], // the co-ord set's shorts (only shown for a garment that has shorts areas)
];
const groupOfSide = (side) => AREA_GROUPS.find(([, sides]) => sides.includes(side))?.[0] || AREA_GROUPS[0][0];
const ICON_TEXT = "M5 6h14M12 6v13M9 19h6";
const ICON_UPLOAD = "M12 16V5m0 0-4 4m4-4 4 4M5 19h14";
const SIDES = [["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"]];
const DRAFT_KEY = (type) => `identee:design:v3:${type}`;
// What a reload must bring back besides the design itself: that the customer is in the room, the colour and
// size, and the assistant's conversation (with the pictures it offered that are not on the tee yet).
const ROOM_KEY = (type) => `identee:room:v1:${type}`;
const CHAT_KEPT = 80; // messages
const SIZE_KEY = "identee:size";
const ASSIST_WIDE_KEY = "identee:assistWide";
const DARK_KEY = "identee:room-dark"; // the customer's light / dark studio choice
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
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
// Review: the camera stands back in the dressing room, looking at the floating tee
const SHOWROOM = { position: [0, 0.8, 6.5], look: [0, 0.55, 0] };
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
  // ?photo=1 (the photo banner on the home page): entering the room opens the Photo Studio. Read once —
  // the address is tidied after the page opens.
  const [photoLink] = useState(() => params.get("photo") === "1");
  // ?team=1 ("Create your team/group IDENTEE", /team-orders): entering the room puts the Team jersey layout on the
  // tee and the assistant asks for the player list.
  const [teamLink] = useState(() => params.get("team") === "1");
  // was the room opened from another page of the site? (read once: tidying the address below changes location.key)
  const [cameFromSite] = useState(() => location.key !== "default");
  const stored = useMemo(() => readJSON(DRAFT_KEY(type)), [type]);
  // (a design already saved to My designs isn't "unfinished" — it's kept there)
  const [earlier, setEarlier] = useState(() => (fresh && stored?.elements?.length && !stored.designId ? stored : null));
  const draft = fresh ? null : stored;
  const session = useMemo(() => (fresh ? null : readJSON(ROOM_KEY(type))), [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState(draft?.elements?.length || session?.entered ? "design" : "fit");
  // the colour in the address starts a NEW design; a design in progress keeps its own colour
  const [colourSlug, setColourSlug] = useState((fresh && params.get("color")) || draft?.colour || session?.colour || params.get("color") || null);
  const [size, setSize] = useState(draft?.size || session?.size || readJSON(SIZE_KEY) || "M");
  const [elements, setElements] = useState(() => (Array.isArray(draft?.elements) ? draft.elements : []));
  const [positions, setPositions] = useState([]);
  const [active, setActive] = useState(null); // print area key being edited
  const [selectedId, setSelectedId] = useState(null);
  // Step 1 (left): where to print. Step 2 (right, in the editor): what to add.
  const [addTab, setAddTab] = useState("text");
  // The design assistant has its own panel (it works on the whole tee, not one print area). It takes
  // the editor's place on the right; picking a print area or "Edit by hand" brings the editor back.
  const [assist, setAssist] = useState(() => Boolean(session?.assist));
  // the Photo Studio (PhotoStudio.jsx): the customer's photo as art, or print-ready. Its panel takes the
  // editor's place like the assistant's; its state stays while it is closed (results are still there)
  const [aiTab, setAiTab] = useState("chat"); // the AI panel's tab: chat | draw | photo
  const [drawSession, setDrawSession] = useState({}); // the Draw tab's state (DrawStudio.jsx)
  const [photoSession, setPhotoSession] = useState({});
  // the assistant made wide (about half the screen) with its Expand button — remembered on this device
  const [assistWide, setAssistWide] = useState(() => readJSON(ASSIST_WIDE_KEY) === true);
  const toggleAssistWide = () => {
    writeJSON(ASSIST_WIDE_KEY, !assistWide);
    setAssistWide(!assistWide);
  };
  // the assistant's conversation (kept while you switch tabs, and across a reload of the page)
  const [chat, setChat] = useState(() => (Array.isArray(session?.chat) && session.chat.length ? session.chat : firstMessages()));
  const [chatState, setChatState] = useState(() => session?.chatState || firstState());
  // the AI design maker: whether it is on, how many requests are left today, and where its designs sit on the tee
  const [ai, setAi] = useState({ available: false, reason: "setup", styles: [], photoStyles: [], left: null });
  const photoRef = useRef(null); // the file picker for "photo to art"
  const [aiPlaced, setAiPlaced] = useState(() => session?.aiPlaced || {}); // { [print area key]: { url, elId } }
  const aiCuts = useRef(new Map()); // design url -> { path, w, h } (the server sends each design already cut out)
  useEffect(() => {
    let alive = true;
    aiService
      .status()
      .then((st) => alive && setAi(st))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const ackIssues = useRef(""); // design-check findings the customer has already been shown before Review
  const [areasOpen, setAreasOpen] = useState(false); // phones: the "where to print" sheet
  const [pickOpen, setPickOpen] = useState(false); // colour & size menu in the top bar
  const [live, setLive] = useState(null); // { key, elements } while dragging
  const [textures, setTextures] = useState({}); // key -> { canvas, version }
  // returning to a saved design starts at the front view; new visits fly in after the fitting step
  // The first screen is a shop window: the card sits on the left and the tee turns on its stand to the right of it
  // (the 3D picture itself is slid to the right in designRoom.css, and slides back on stepping in).
  const SHOWCASE = { position: [0, 0.4, 5.2], ms: 1600 }; // a slow push-in as the page opens
  const [camRequest, setCamRequest] = useState(() =>
    draft?.elements?.length || session?.entered ? { view: "front", ms: 1600, n: nextReq() } : typeof window !== "undefined" && window.innerWidth >= 900 ? { ...SHOWCASE, n: nextReq() } : null,
  );
  const [twirlKey, setTwirlKey] = useState(0); // goes up to make the tee do one full turn
  const [shots, setShots] = useState(null);
  const [spin, setSpin] = useState(true);
  const [lit, setLit] = useState(false); // Review: the dressing room has been drawn, so its lights can come up
  const litTimer = useRef(null);
  const [unfoldKey, setUnfoldKey] = useState(0); // Review opens with the tee unfolding in the air (changes each time)
  const [sideShown, setSideShown] = useState(null); // the side picture last tapped in Review
  const [qtys, setQtys] = useState({}); // Review: { M: 2, L: 1 } — one design, any mix of sizes // Review: the tee turns 360° until a side is picked
  // Team order (studio/teamOrder.js): one tee per player, each with their own name and number
  // in place of the texts marked for them. Filled in Review; saved with the design.
  const [players, setPlayers] = useState(() => (Array.isArray(draft?.players) ? draft.players.map((p) => ({ id: makeId(), ...p })) : []));
  const [team, setTeam] = useState(() => Boolean(draft?.players?.length));
  const [previewId, setPreviewId] = useState(null); // Review: the player whose tee is shown
  // light studio (default) or the dark, evening one — the customer's switch in the top bar, remembered on this device
  const [darkRoom, setDarkRoom] = useState(() => readJSON(DARK_KEY) === true);
  const toggleDark = () => {
    setDarkRoom((d) => {
      writeJSON(DARK_KEY, !d);
      return !d;
    });
  };
  // the print area the pointer is on — on the 3D tee itself or on its card in the list (it glows on the tee)
  const [hoverKey, setHoverKey] = useState(null);
  const hoverCam = useRef({ side: null, timer: 0 });
  const [areaTab, setAreaTab] = useState(AREA_GROUPS[0][0]); // "Where to print": Front / Back / Sleeves
  const [popKey, setPopKey] = useState(0); // goes up when something lands on the tee: the tee gives a small pop
  // A design saved to My designs that was changed afterwards on this device: a reload keeps those changes
  // (the page used to fetch the saved version again and throw them away).
  const keepLocal = Boolean(draft?.dirty && draft?.designId && draft.designId === params.get("design") && draft.elements?.length);
  const unsaved = useRef(Boolean(draft?.dirty)); // changed since the last save / load from My designs
  const [toast, setToast] = useState(keepLocal ? "These are your latest changes. Press Save to keep them in My designs." : "");
  const [busy, setBusy] = useState("");
  // the saved design this is (My designs); locked = already ordered → saving makes a copy
  const [designId, setDesignId] = useState(params.get("design") || draft?.designId || null);
  const [designName, setDesignName] = useState(draft?.name || "");
  const [locked, setLocked] = useState(Boolean(draft?.locked));
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
  // a co-ord set's shorts: their own length for this size (else the shorts model's own length)
  const bottomLengthCm = chartRow?.bottomLength ? chartRow.bottomLength * 2.54 : model?.bottom?.lengthCm;
  const fabricHex = colour?.hex || "#1C1C1D";
  const inkDefault = lum(fabricHex) < 0.55 ? "#FFFFFF" : "#141110";
  // Price per piece (launch, 16 Oct 2026): the garment's price + a set amount when the design has a picture —
  // AI-made, from the art library or uploaded (Admin → Settings → AI designs); once per tee, text only adds
  // nothing. The server works it out the same way at checkout (checkoutService.customizationLine).
  const hasPictureOn = elements.some((e) => e.type === "image" && e.src);
  const aiAddOn = hasPictureOn ? Number(ai.designAddOnInr ?? 100) : 0;
  const unitPrice = (garment?.basePrice || 0) + aiAddOn;
  // the struck-out "was" price, with the same AI amount on top so the saving stays the same
  const wasPrice = garment?.comparePrice > garment?.basePrice ? garment.comparePrice + aiAddOn : 0;
  const siteOffer = useSiteOffer(); // "+ Extra 10% off with code …" (Admin → Offers, shown on the site)
  const shipRule = useShippingRule(); // ₹100 shipping, free from 3 pieces
  const activePos = positions.find((p) => p.key === active) || null;
  const roles = hasRoles(elements);
  const teamMode = roles && team;
  const teamPlayers = teamMode ? players.filter(filled) : [];
  const previewPlayer = step === "review" && teamMode ? players.find((p) => p.id === previewId && filled(p)) || null : null;

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
    writeJSON(DRAFT_KEY(type), { elements, colour: colour?.slug, size: sizeNow, designId, name: designName, dirty: unsaved.current, locked, players: players.filter(filled).map(({ name, number, size: sz }) => ({ name, number, size: sz })) });
  }, [type, elements, colour?.slug, sizeNow, designId, designName, players, locked]);

  // The room itself, so a reload comes back to where the customer was — also with an empty tee — and the
  // assistant still remembers the conversation. Not written before they step in, so looking at the first
  // screen never disturbs what was kept from an earlier visit.
  const entered = useRef(step !== "fit");
  useEffect(() => {
    if (!type) return;
    if (step !== "fit") entered.current = true;
    if (!entered.current) return;
    writeJSON(ROOM_KEY(type), { entered: step !== "fit", colour: colour?.slug, size: sizeNow, assist, chat: chat.slice(-CHAT_KEPT), chatState, aiPlaced });
  }, [type, step, colour?.slug, sizeNow, assist, chat, chatState, aiPlaced]);

  // Drop ?new=1 and ?color= from the address so a reload keeps the design in progress. (The colour in
  // the address is only where a new design starts; left there, a reload brought it back over the colour
  // the customer had picked since.)
  useEffect(() => {
    if (!fresh && !params.get("color") && !params.get("team")) return;
    const next = new URLSearchParams(params);
    next.delete("new");
    next.delete("color");
    next.delete("team");
    navigate(`${location.pathname}${next.toString() ? `?${next}` : ""}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const continueEarlier = () => {
    if (!earlier) return;
    setElements(earlier.elements);
    if (earlier.colour) setColourSlug(earlier.colour);
    if (earlier.size) setSize(earlier.size);
    setDesignId(earlier.designId || null);
    setDesignName(earlier.name || "");
    setPlayers((earlier.players || []).map((p) => ({ id: makeId(), ...p })));
    setTeam(Boolean(earlier.players?.length));
    setEarlier(null);
    setStep("design");
    setCamRequest({ view: "front", ms: 1600, n: nextReq() });
  };

  /* ---------- open a saved design: /customize/<garment>?design=<id> ---------- */
  const openId = params.get("design");
  const onScreenId = useRef(keepLocal ? draft.designId : null); // id of the saved design currently shown (set on load and on save)
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
        unsaved.current = false;
        setDesignId(d._id);
        setDesignName(d.name || "");
        setLocked(!!d.orderedAt);
        setPlayers((d.players || []).map((p) => ({ id: makeId(), name: p.name, number: p.number, size: p.size })));
        setTeam(Boolean(d.players?.length));
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
    unsaved.current = true;
    if (value.length > prev.length) setPopKey((k) => k + 1);
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
  const paintedEls = useRef(new Map()); // key -> the items the area was last painted with
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
        let els = live?.key === pos.key ? live.elements : elements.filter((e) => e.position === pos.key);
        // Review of a team order: the tee of the player being looked at
        if (previewPlayer) els = playerElements(els, previewPlayer, W, H);
        paintedEls.current.set(pos.key, els); // what this area shows now (the mockup pictures repaint it without the border)
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
  }, [positions, elements, live, active, areaPx, previewPlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => renderers.current.forEach((e) => e.r.destroy()), []);

  // Where each print sits on the tee — only changes with the size, so the 3D
  // print shapes are built once, not on every drag frame.
  const spots = useMemo(
    () =>
      model
        ? Object.fromEntries(
            positions
              .filter((pos) => pos.side !== "shorts" || model.bottom) // shorts areas need a model with shorts
              .map((pos) => [pos.key, pos.side === "shorts" ? placeArea(model.bottom, pos, sizeNow, bottomLengthCm) : placeArea(model, pos, sizeNow, lengthCm)]),
          )
        : {},
    [model, positions, sizeNow, lengthCm, bottomLengthCm],
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
  // print areas that can be picked by pointing at the tee: every one that is not covered by another design
  const usedSig = usedKeys.join();
  const hotspots = useMemo(
    () => {
      const used = usedSig ? usedSig.split(",") : [];
      return positions.filter((p) => spots[p.key] && (used.includes(p.key) || !blockersOf(p.key, positions, used).length)).map((p) => ({ key: p.key, spot: spots[p.key], main: !!p.main }));
    },
    [positions, spots, usedSig],
  );
  // small pictures of the areas that have a design, for their cards (made again only when a picture changes)
  const thumbSig = usedKeys.map((k) => `${k}:${textures[k]?.version || 0}`).join();
  const thumbs = useMemo(
    () => Object.fromEntries((thumbSig ? thumbSig.split(",") : []).map((kv) => kv.split(":")[0]).map((k) => [k, printThumb(textures[k]?.canvas)])),
    [thumbSig], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hoverPos = step === "design" && hoverKey && hoverKey !== active ? positions.find((p) => p.key === hoverKey) : null;
  // Pointing at a card in the list: its area glows on the tee, and (when nothing is being edited) the tee turns to that side.
  const hoverCard = (p) => {
    setHoverKey(p ? p.key : null);
    clearTimeout(hoverCam.current.timer);
    if (!p || active || narrow || hoverCam.current.side === p.side) return;
    hoverCam.current.timer = setTimeout(() => {
      hoverCam.current.side = p.side;
      setCamRequest({ view: p.side, ms: 700, n: nextReq() });
    }, 180);
  };
  const openArea = (key, { force = false } = {}) => {
    const pos = positions.find((p) => p.key === key);
    if (!pos) return;
    // one print per overlapping spot: an empty area covered by a used one stays closed
    const blockers = force || usedKeys.includes(key) ? [] : blockersOf(key, positions, usedKeys);
    if (blockers.length) {
      say(`${pos.label} overlaps ${blockers.map((b) => b.label).join(" and ")}. Remove that print first to use ${pos.label}.`);
      return;
    }
    setActive(key);
    setAreaTab(groupOfSide(pos.side));
    setHoverKey(null);
    clearTimeout(hoverCam.current.timer);
    hoverCam.current.side = null;
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
  const pickAreaByHand = (key) => {
    setAssist(false);
    openArea(key);
  };
  const editByHand = () => {
    setAssist(false);
    if (active) return;
    const first = positions.find((p) => usedKeys.includes(p.key));
    if (first) openArea(first.key);
    else ensureArea();
  };
  const startAdding = () => {
    setAssist(false);
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
  // opts: { effect: "arc-up", vertical: true (reads down the area) or "up" (reads up it), small: true }
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
      // "up": reads from bottom to top (turned left); otherwise from top to bottom (turned right)
      el = { ...el, rotation: opts.vertical === "up" ? -90 : 90, x: 50 - el.width / 2, y: 50 - el.height / 2 };
    } else if (el.width > 90) {
      // long text: shrink so it fits inside the print area (90% wide)
      el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
    }
    addElement(pos, el);
  };
  // A wide picture on a tall, thin area (Vertical Front 10 × 52 cm …): turned on its side to run up the strip,
  // reading from bottom to top, as long as the area allows (fill = % of the area). null = it stays upright.
  const turnedFit = (pos, natW, natH, fill = 92) => {
    const { W, H } = areaPx(pos);
    const shape = natW / natH;
    if (H / W < 2.5 || shape < 1.6) return null;
    const len = Math.min((fill / 100) * H, (fill / 100) * W * shape); // px along the strip
    const width = (len / W) * 100; // the unturned box, in % of the area (konvaRender turns it about its centre)
    const height = (len / shape / H) * 100;
    return { rotation: -90, width, height, x: 50 - width / 2, y: 50 - height / 2 };
  };
  const addImage = (pos, src, natW, natH, extra = {}) => {
    const turned = turnedFit(pos, natW, natH, 80);
    if (turned) return addElement(pos, { type: "image", src, ...turned, ...extra });
    const { W, H } = areaPx(pos);
    const widthPct = 60;
    const heightPct = ((widthPct / 100) * W * (natH / natW) / H) * 100;
    const h = Math.min(heightPct, 90);
    const w = h < heightPct ? (widthPct * h) / heightPct : widthPct;
    addElement(pos, { type: "image", src, x: 50 - w / 2, y: 50 - h / 2, width: w, height: h, ...extra });
  };
  // Linked texts (the team name on the chest and on the back) always say the same thing: when the words of
  // one were changed, the others with the same link get the new words too — each keeps its own size, place
  // and look, and is made smaller if the new words would not fit its print area.
  const syncLinked = (prev, next) => {
    const before = new Map(prev.map((e) => [e.id, e]));
    let changed =
      next.find((e) => e.type === "text" && before.has(e.id) && before.get(e.id).text !== e.text) ||
      // switched back from "Only this one" to "Change everywhere": the other places take its words straight away
      next.find((e) => e.type === "text" && e.link === "team" && before.get(e.id)?.link === "solo");
    if (!changed || changed.link === "solo") return next;
    if (!changed.link) {
      // A design from before texts were linked (or texts the customer added by hand): the same words in two
      // different print areas are one name, like a team name on the chest and on the back. They are linked
      // from the first change on. ("Change only this one" in the text's settings takes a text out again.)
      const words = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
      const old = words(before.get(changed.id).text);
      let twins = changed.role || !old ? [] : prev.filter((e) => e.type === "text" && e.id !== changed.id && !e.role && !e.link && e.position !== changed.position && words(e.text) === old);
      if (!twins.length && !changed.role) {
        // Or one of them was already changed and the other still shows the layout's sample words: the team
        // name typed on the chest while the back still says "TEAM NAME" (and the other way round).
        const samples = TEMPLATES.flatMap((t) => t.items.filter((i) => i.link));
        const mine = samples.find((i) => i.areas.includes(changed.position));
        twins = !mine
          ? []
          : prev.filter(
              (e) =>
                e.type === "text" && e.id !== changed.id && !e.role && !e.link && e.position !== changed.position &&
                samples.some((i) => i.link === mine.link && i.areas.includes(e.position) && words(e.text) === words(i.text)),
            );
      }
      if (!twins.length) return next;
      const ids = new Set([changed.id, ...twins.map((e) => e.id)]);
      next = next.map((e) => (ids.has(e.id) ? { ...e, link: "team" } : e));
      changed = next.find((e) => e.id === changed.id);
    }
    return next.map((e) => {
      if (e.type !== "text" || e.link !== changed.link) return e;
      const pos = positions.find((p) => p.key === e.position);
      if (!pos) return { ...e, text: changed.text };
      // Each starts from the size it was given (ownSizePct) and is made smaller only as far as the new words
      // need — so a long team name stays inside the small chest area, and a shorter one gets its size back.
      // The one being typed in is fitted the same way.
      const own = e.ownSizePct || e.fontSizePct;
      let el = textBox({ ...e, text: changed.text, fontSizePct: own, ownSizePct: own }, pos);
      if (Math.abs(el.rotation || 0) !== 90 && el.width > 92) el = textBox({ ...el, fontSizePct: (own * 92) / el.width }, pos);
      return el;
    });
  };
  const updateSel = (patch, { measure = false } = {}) => {
    commit((prev) =>
      syncLinked(
        prev,
        prev.map((e) => {
          if (e.id !== selectedId) return e;
          const next = { ...e, ...patch, ...(patch.fontSizePct !== undefined ? { ownSizePct: patch.fontSizePct } : {}) };
          return measure && next.type === "text" ? textBox(next, positions.find((p) => p.key === e.position)) : next;
        }),
      ),
    );
  };
  const removeSel = () => {
    commit((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  };
  // Remove the selected picture's background (in this browser — see removeBackground.js),
  // upload the cut-out and swap it in. Undo brings the original back.
  // Make the selected picture sharper, or recolour it for this tee (the image AI redraws it;
  // one of the customer's daily requests). The new picture takes the old one's place; Undo brings it back.
  const fixPicture = async (kind) => {
    const el = elements.find((e) => e.id === selectedId);
    const pos = el && positions.find((p) => p.key === el.position);
    if (!el || el.type !== "image" || !pos || busy) return;
    if (!ai.available) return say("That isn’t available right now.");
    if (!isLoggedIn()) return say("Log in to use this.");
    setBusy({ label: kind === "recolour" ? "Recolouring your picture…" : "Redrawing your picture sharper…", expect: 25, hint: "Usually 20–40 seconds." });
    try {
      const { W, H } = areaPx(pos);
      const res = await aiService.design({ fixUrl: el.src, fixKind: kind, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: W / H });
      setAi((cur) => ({ ...cur, left: res.left }));
      const im = res.images[0];
      aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
      // same width and middle as before; the height follows the new picture's shape
      const height = (el.width * W * im.height) / (im.width * H);
      commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: im.url, pxW: im.width, height, y: e.y + (e.height - height) / 2 } : e)));
      say(`${kind === "recolour" ? "Recoloured" : "Redrawn sharper"}. Not right? Press Undo (↶). ${res.left} request${res.left === 1 ? "" : "s"} left today.`);
    } catch (err) {
      say(err.response?.data?.message || "That didn’t work. Please try again.");
    } finally {
      setBusy("");
    }
  };
  const removeBg = async () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el || el.type !== "image" || busy) return;
    setBusy("Removing the background…");
    try {
      const img = await loadImage(el.src, { full: true });
      const { removeBackground } = await import("./removeBackground");
      const out = await removeBackground(img, setBusy);
      if (out.already) return say("This picture already has a see-through background.");
      setBusy("Saving the cut-out…");
      const res = await dispatch(uploadDesignImage(new File([out.blob], "cut-out.png", { type: "image/png" })));
      if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "The cut-out could not be saved. Please try again.");
      commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: res.payload.path, pxW: out.width } : e)));
      say(out.method === "ai" ? "Background removed. Not right? Press Undo (↶) to get the original back." : "Background colour removed. Not right? Press Undo (↶).");
    } catch {
      say("The background could not be removed. Check your internet connection and try again.");
    } finally {
      setBusy("");
    }
  };
  // the quick tool bar by the tee: bigger / smaller around the item's middle, and centre it left-to-right
  const resizeSel = (f) => {
    commit((prev) =>
      prev.map((e) => {
        if (e.id !== selectedId) return e;
        if (e.type === "text") {
          const fontSizePct = Math.min(60, Math.max(2, e.fontSizePct * f));
          return textBox({ ...e, fontSizePct, ownSizePct: fontSizePct }, positions.find((p) => p.key === e.position));
        }
        const width = Math.min(150, Math.max(4, e.width * f));
        const height = (e.height * width) / e.width;
        return { ...e, width, height, x: e.x + (e.width - width) / 2, y: e.y + (e.height - height) / 2 };
      }),
    );
  };
  const centreSel = () => commit((prev) => prev.map((e) => (e.id === selectedId ? { ...e, x: 50 - (e.width || 0) / 2 } : e)));
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
    if (slug !== colour?.slug && step === "design" && !active) setTwirlKey((k) => k + 1); // the tee turns once in its new colour
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
    // Starting new here replaces the unfinished design kept from before (it was offered as "Continue it" on
    // this screen). Without this, a reload would bring the old design back together with the new conversation.
    hadElements.current = true;
    if (!elements.length) writeJSON(DRAFT_KEY(type), { elements: [], colour: colour?.slug, size: sizeNow, designId: null, name: "", dirty: false, locked: false, players: [] });
    writeJSON(SIZE_KEY, sizeNow);
    setStep("design");
    setCamRequest({ view: "front", ms: 1800, n: nextReq() });
    setTwirlKey((k) => k + 1);
  };
  /* ---------- the design assistant ---------- */
  const designIssues = () => checkDesign(elements, positions, { fabricHex, inkDefault, cmOf: (pos) => areaPx(pos), canEnlarge: ai.available });
  // what the assistant knows about the tee right now
  const assistantCtx = () => ({
    areaLabel: activePos?.label || "the tee",
    teeName: colour?.name || "this",
    hasDesign: elements.length > 0,
    sizes,
    sizeNow,
    chart: (sz) => garment.sizeChart?.find((r) => r.size === sz),
    areas: positions.map((p) => ({ key: p.key, label: p.label, side: p.side, free: usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length })),
    issues: designIssues,
    inks: inksFor(fabricHex, INKS),
    ai: { ...ai, loggedIn: isLoggedIn() },
    hasText: elements.some((e) => e.type === "text"),
    hasRoles: roles, // a text is marked as the player's name / number (team orders)
    roles: rolesIn(elements), // { name, number }: which of the two the tee has a place for
    // an uploaded picture on the tee (not library art, not an AI design) — "photo to art" can use it
    photoOnTee: [...elements].reverse().find((e) => e.type === "image" && !e.artDesignId && !aiCuts.current.has(e.src))?.src || null,
  });
  // Edit the tee by chat: the text AI suggests changes, aiOps checks and applies them (one Undo step).
  // progress(now): tells the assistant's wait card what is happening now (drawing the pictures asked for)
  const chatEdit = async (a, progress) => {
    try {
      const res = await aiService.edit({
        message: a.message,
        design: describeDesign({ elements, positions, active, selectedId, fonts: FONTS, teeName: colour?.name || "", teeColours: colours.map((c) => c.name), areaPx }),
      });
      const all = Array.isArray(res.ops) ? res.ops : [];
      if (!all.length) return [botSays(res.reply || "I’m not sure what to change. Tell me which item, and what to do with it."), chipRow(["What can you do?", "Something else"])];

      // 1. the tee's own colour
      let tee = colour;
      let changed = 0;
      const colourOp = all.find((o) => o?.op === "set_tee_colour");
      const wanted = colourOp && colours.find((c) => c.name.toLowerCase() === String(colourOp.colour || "").toLowerCase());
      if (wanted && wanted.slug !== colour?.slug) {
        changeColour(wanted.slug);
        tee = wanted;
        changed++;
      }
      // 2. changes to what is on the tee
      const done = applyAiOps(all, { elements, positions, active, fonts: FONTS, inkDefault: lum(tee?.hex || fabricHex) < 0.55 ? "#FFFFFF" : "#141110", areaPx, textBox, makeId });
      let els = syncLinked(elements, done.elements); // a team name changed by chat changes everywhere too
      changed += done.changed;
      let focus = done.focus;
      // 3. new pictures, one print area each (each one is a paid request to the image AI)
      const extra = [];
      let pictureFailed = false;
      const placed = {};
      // at most three pictures from one message (each is a paid request and takes about 20 seconds);
      // the customer is told about any that were left out, so nothing is dropped without a word
      const MAX_PICTURES = 3;
      const asked = all.filter((o) => o?.op === "make_picture" && typeof o.subject === "string" && o.subject.trim());
      const pictures = asked.slice(0, MAX_PICTURES);
      const leftOut = asked.slice(MAX_PICTURES);
      if (pictures.length && !ai.available) extra.push(botSays("Pictures can’t be made right now. You can pick from the art library or upload your own."));
      else if (pictures.length && !isLoggedIn()) extra.push(botSays("Log in and I’ll draw the pictures for you."), chipRow(["Log in"]));
      else {
        if (pictures.length) {
          // one after the other, about 20–40 seconds each
          progress?.({ label: pictures.length > 1 ? `Drawing ${pictures.length} pictures…` : "Drawing your picture…", expect: 25 * pictures.length, hint: `Usually 20–40 seconds${pictures.length > 1 ? " for each" : ""}. You can look around the room meanwhile.` });
        }
        for (const pic of pictures) {
          const used = [...new Set(els.map((e) => e.position))];
          // that area, or the biggest free one on the same side (e.g. "the back" on a crop top with only Top Back)
          const pos = areaFor(pic.area, positions, used);
          if (!pos) {
            extra.push(botSays(`There’s no free print area for ${pic.subject.slice(0, 80)} on this ${garment?.label || "garment"}. Remove a print, or ask for it somewhere else.`));
            continue;
          }
          const { W, H } = areaPx(pos);
          try {
            const made = await aiService.design({ subject: pic.subject.slice(0, 200), style: ai.styles.includes(pic.style) ? pic.style : ai.styles[0], teeColour: tee?.name || "white", teeIsDark: lum(tee?.hex || fabricHex) < 0.55, ratio: W / H, count: 2 });
            setAi((cur) => ({ ...cur, left: made.left }));
            made.images.forEach((im) => {
              aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
              loadImage(im.url).catch(() => {});
            });
            const first = made.images[0];
            const el = aiElement(pos, { path: first.url, w: first.width, h: first.height }, els.length + 1);
            els = [...els, el];
            placed[pos.key] = { url: first.url, elId: el.id };
            focus = focus || pos.key;
            changed++;
            extra.push(botSays(`For ${pos.label} I drew ${pic.subject}. ${made.images.length > 1 ? "The first one is on your tee; tap Add to tee on the other to swap." : "It’s on your tee."}`), { designs: made.images.map((im) => im.url) });
          } catch (err) {
            pictureFailed = true;
            extra.push(
              botSays(err.response?.data?.message || "The design maker had a problem."),
              // only this picture again (the rest of the message is already done)
              { retry: { type: "generate", subject: pic.subject.slice(0, 200), style: ai.styles.includes(pic.style) ? pic.style : ai.styles[0], areaKey: pos.key } },
            );
            break;
          }
        }
      }
      if (leftOut.length && ai.available && isLoggedIn()) {
        const names = leftOut.map((o) => `${o.subject.trim()}${positions.find((p) => p.key === o.area) ? ` on ${positions.find((p) => p.key === o.area).label}` : ""}`).join(", ");
        extra.push(botSays(`I can draw up to three pictures from one message, so I left out: ${names}. Ask me for ${leftOut.length === 1 ? "it" : "them"} in your next message and I’ll add ${leftOut.length === 1 ? "it" : "them"}.`));
      }
      if (!changed && !extra.length) return [botSays("I couldn’t do that one. Tap the item on the print area and tell me again, or use its settings."), chipRow(["What can you do?", "Something else"])];
      if (els !== elements) commit(() => els);
      if (Object.keys(placed).length) setAiPlaced((cur) => ({ ...cur, ...placed }));
      if (focus && focus !== active) openArea(focus, { force: true });
      setSelectedId(null);
      // The text AI writes its reply ("I've added a picture of…") before the picture is drawn. When the picture
      // could not be made, that reply would be untrue, so only what really happened is said.
      if (!changed) return extra;
      if (pictureFailed) return [botSays("I’ve done the rest of what you asked. The picture is the part that didn’t work:"), ...extra];
      // (the text AI's own reply lists every picture asked for, also the ones left out — so it is not used here)
      if (leftOut.length) return [botSays("I’ve drawn the first three. Not right? Press Undo (↶)."), ...extra, chipRow(["Check my design", "Something else"])];
      return [botSays(`${res.reply || "Done."} Not right? Press Undo (↶).`), ...extra, ...(extra.some((x) => x.chips || x.retry) ? [] : [chipRow(["Check my design", "Something else"])])];
    } catch (err) {
      return [botSays(err.response?.data?.message || "I couldn’t work that out just now."), { failed: true }];
    }
  };
  // Photo to art: the customer picks a photo; it is uploaded, then the assistant asks for a style.
  const onPhotoForArt = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return say("Please choose a JPG, PNG or WebP photo.");
    if (file.size > 10 * 1024 * 1024) return say("That photo is over 10 MB. Please choose a smaller one.");
    setBusy("Uploading your photo…");
    const res = await dispatch(uploadDesignImage(file));
    setBusy("");
    if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "Upload failed. Please try again.");
    setChatState((st) => ({ ...st, photoUrl: res.payload.path, wait: "photoStyle" }));
    setChat((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), botSays("Got it. Which style?"), chipRow(ai.photoStyles)]);
  };
  // Ask the image AI for designs (or for a change to one). Returns the chat messages to show.
  const generateDesigns = async (a) => {
    // the area named in the message ("… in vertical front") is opened and the design made for it
    const named = a.areaKey ? positions.find((p) => p.key === a.areaKey) : null;
    if (named && named.key !== active) pickAreaByHand(named.key);
    const forPos = named || activePos;
    const { W, H } = forPos ? areaPx(forPos) : { W: 1, H: 1 };
    // lettering for a tall, thin area: one long line, turned on its side when it is put on the tee
    const banner = !a.photoUrl && !a.baseUrl && a.style === "Hand lettering" && H / W >= 2.5;
    try {
      const res = await aiService.design(
        a.photoUrl ? { photoUrl: a.photoUrl, artStyle: a.artStyle, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: W / H } :
        a.baseUrl ? { baseUrl: a.baseUrl, change: a.change, teeIsDark: lum(fabricHex) < 0.55, ratio: W / H } : { subject: a.subject, style: a.style, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: banner ? H / W : W / H, ...(banner ? { banner: true } : {}) },
      );
      if (res.left != null) setAi((cur) => ({ ...cur, left: res.left }));
      // the pictures arrive already cut out of their background; remember their size and start
      // loading them, so "Add to tee" has nothing left to wait for
      res.images.forEach((im) => {
        aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
        loadImage(im.url).catch(() => {});
      });
      const n = res.images.length;
      const left = res.left == null ? "" : `${res.left} request${res.left === 1 ? "" : "s"} left today.`;
      if (res.filtered) {
        // art from our own filters (free): asked for, or because the picture service refused this photo
        const names = res.images.map((im) => im.label).filter(Boolean).join(", ");
        return [
          botSays(
            res.refused
              ? `The AI wouldn’t redraw this photo (it refuses some photos, well-known faces among them). So I made ${n} art versions another way, free: ${names}. Add one to your tee.`
              : `Here are ${n} art versions, free: ${names}. Add one to your tee.`,
          ),
          { designs: res.images.map((im) => im.url) },
          chipRow(["Something else"]),
        ];
      }
      return [
        botSays(a.photoUrl ? `Here ${n === 1 ? "it is" : `are ${n} versions`} as ${String(a.artStyle || "art").toLowerCase()}. ${n === 1 ? "Add it to your tee, try another, or ask me to change it." : "Add one to your tee, or ask me to change it."} ${left}` : a.baseUrl ? `Here’s the changed design. ${left}` : `Here ${n === 1 ? "is one" : `are ${n}`}, made for ${forPos?.label || "your tee"}${banner ? " (it goes on turned, running up the strip)" : ""} on a ${(colour?.name || "").toLowerCase()} tee. ${n === 1 ? "Add it, try another, or ask me to change it." : "Add one, use another on a different area, or ask me to change one."} ${left}`),
        // again: the same request, for "Try another" (a new picture costs one more of today's requests)
        { designs: res.images.map((im) => im.url), again: a },
        chipRow(a.photoUrl ? ["Something else"] : AFTER_DESIGN_CHIPS),
      ];
    } catch (err) {
      return [botSays(err.response?.data?.message || "The design maker had a problem."), { failed: true }];
    }
  };
  // Slogans written to order. If the AI cannot be reached, say so and offer the built-in ones.
  const writeSlogans = async (a) => {
    try {
      const res = await aiService.slogans({ ask: a.ask, tone: a.tone || undefined, avoid: a.avoid || [] });
      setChatState((st) => ({ ...st, said: [...(st.said || []), ...res.slogans].slice(-30) }));
      return [botSays(`Here you go. Tap one to put it on ${activePos?.label || "your tee"}, or ask me for something different.`), { slogans: res.slogans }, chipRow(AFTER_AI_SLOGANS)];
    } catch (err) {
      return [botSays(err.response?.data?.message || "I couldn’t think of any just now."), { failed: true }];
    }
  };
  // An AI design as an item on a print area: as large as the area allows, centred.
  const aiElement = (pos, cut, zIndex) => {
    const turned = turnedFit(pos, cut.w, cut.h);
    if (turned) return { id: makeId(), type: "image", src: cut.path, position: pos.key, side: pos.side, zIndex, ...turned, pxW: cut.w };
    const { W, H } = areaPx(pos);
    const shape = cut.w / cut.h;
    const width = shape > W / H ? 92 : (92 * shape * H) / W;
    const height = (width * W) / (shape * H);
    return { id: makeId(), type: "image", src: cut.path, position: pos.key, side: pos.side, rotation: 0, zIndex, x: 50 - width / 2, y: 50 - height / 2, width, height, pxW: cut.w };
  };
  // Put an AI-made design on a print area (the open one unless areaKey is given): its plain
  // background is cleared, the cut-out is uploaded once, and it replaces the AI design already there.
  const placeAiDesign = async (url, areaKey) => {
    const pos = positions.find((p) => p.key === (areaKey || active)) || ensureArea();
    if (!pos || busy) return;
    const blockedBy = usedKeys.includes(pos.key) ? [] : blockersOf(pos.key, positions, usedKeys);
    if (blockedBy.length) return say(`${pos.label} overlaps ${blockedBy.map((b) => b.label).join(" and ")}. Remove that print first.`);
    try {
      let cut = aiCuts.current.get(url);
      if (!cut) {
        // (an older design from before the server did the cutting: clear its background here)
        setBusy("Putting the design on your tee…");
        const img = await loadImage(url, { full: true });
        const { removeBackground } = await import("./removeBackground");
        const out = await removeBackground(img, null, { flatOnly: true });
        if (out.already) cut = { path: url, w: img.naturalWidth, h: img.naturalHeight };
        else {
          const res = await dispatch(uploadDesignImage(new File([out.blob], "ai-design.png", { type: "image/png" })));
          if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "The design could not be saved. Please try again.");
          cut = { path: res.payload.path, w: out.width, h: out.height };
        }
        aiCuts.current.set(url, cut);
      }
      const el = aiElement(pos, cut, elements.length + 1);
      const old = aiPlaced[pos.key]?.elId;
      commit((prev) => [...prev.filter((e) => e.id !== old), el]);
      setAiPlaced((cur) => ({ ...cur, [pos.key]: { url, elId: el.id } }));
      if (pos.key !== active) openArea(pos.key, { force: true });
      setSelectedId(null);
      say(old ? `Replaced the design on ${pos.label}.` : `Added to ${pos.label}.`);
      return true; // (the Photo Studio marks the picture as "on the tee")
    } catch {
      say("The design could not be added. Please try again.");
    } finally {
      setBusy("");
    }
  };
  // where each AI design is on the tee right now (a removed or replaced one drops out)
  const aiOn = {};
  for (const [key, put] of Object.entries(aiPlaced)) {
    if (!elements.some((e) => e.id === put.elId)) continue;
    (aiOn[put.url] ||= []).push(positions.find((p) => p.key === key)?.label || key);
  }

  /* ---------- the Photo Studio ---------- */
  // the print area its results go on: the open one, else the front's main area
  const photoTarget = activePos || positions.find((p) => p.side === "front" && p.main) || positions.find((p) => p.side === "front") || positions[0] || null;
  // the AI panel on one of its tabs (from the top bar, the start cards, the assistant's examples)
  const openAiTab = (tab) => {
    setAiTab(tab);
    setAssist(true);
    setAreasOpen(false);
  };
  const toggleAiTab = (tab) => (assist && aiTab === tab ? setAssist(false) : openAiTab(tab));
  const openPhotoStudio = () => openAiTab("photo");
  const aiFailed = (err, fallback) => new Error(err?.response?.data?.message || fallback);
  const studioUpload = async (file) => {
    const res = await dispatch(uploadDesignImage(file));
    if (!uploadDesignImage.fulfilled.match(res)) throw new Error(res.payload || "The upload didn’t work. Check the internet connection.");
    let w = 1000;
    let h = 1000;
    try {
      const bmp = await createImageBitmap(file);
      w = bmp.width;
      h = bmp.height;
      bmp.close?.();
    } catch {
      // the size stays a guess; the print check is then only a guide
    }
    return { url: res.payload.path, w, h };
  };
  const studioArt = async (url, style) => {
    const { W, H } = photoTarget ? areaPx(photoTarget) : { W: 1, H: 1 };
    let res;
    try {
      res = await aiService.design({ photoUrl: url, artStyle: style, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: W / H });
    } catch (err) {
      throw aiFailed(err, "The design maker had a problem.");
    }
    if (res.left != null) setAi((cur) => ({ ...cur, left: res.left }));
    res.images.forEach((im) => {
      aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
      loadImage(im.url).catch(() => {});
    });
    return res;
  };
  // print-ready: enhanced by the image AI (if asked), then the background removed here in the browser (free)
  const studioPrintReady = async (photo, { cutOut, enhance }, progress) => {
    let cur = { url: photo.url, w: photo.w, h: photo.h };
    let enhanced = false;
    let cut = false;
    if (enhance) {
      progress("Enhancing your photo…");
      let res;
      try {
        res = await aiService.design({ fixUrl: cur.url, fixKind: "photo", teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: cur.w / cur.h });
      } catch (err) {
        throw aiFailed(err, "The photo couldn’t be enhanced just now.");
      }
      if (res.left != null) setAi((c) => ({ ...c, left: res.left }));
      const im = res.images[0];
      cur = { url: im.url, w: im.width, h: im.height };
      enhanced = true;
    }
    if (cutOut) {
      progress("Removing the background…");
      const img = await loadImage(cur.url, { full: true });
      const { removeBackground } = await import("./removeBackground");
      const out = await removeBackground(img, (t) => typeof t === "string" && progress(t));
      if (!out.already) {
        progress("Saving the cut-out…");
        const res = await dispatch(uploadDesignImage(new File([out.blob], "photo-cut-out.png", { type: "image/png" })));
        if (!uploadDesignImage.fulfilled.match(res)) throw new Error(res.payload || "The cut-out couldn’t be saved. Check the internet connection.");
        cur = { url: res.payload.path, w: out.width, h: out.height };
        cut = true;
      }
    }
    return { ...cur, enhanced, cut };
  };
  // the Draw tab: the image AI draws a design for a print area, or changes one it made
  const drawSize = (key) => {
    const pos = positions.find((p) => p.key === key) || photoTarget;
    return pos ? areaPx(pos) : { W: 1, H: 1 };
  };
  const keepAiDesigns = (res) => {
    if (res.left != null) setAi((c) => ({ ...c, left: res.left }));
    res.images.forEach((im) => {
      aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
      loadImage(im.url).catch(() => {});
    });
    return res;
  };
  const drawDesign = async ({ subject, style, areaKey }) => {
    const { W, H } = drawSize(areaKey);
    // lettering: the words in quotes are drawn exactly as written; a tall, thin area gets one long line
    const lettering = style === "Hand lettering";
    const quoted = /[“"‘']([^”"’']{2,160})[”"’']/.exec(subject);
    const asked = !lettering ? subject : quoted ? `${subject.replace(quoted[0], "").trim()} — the words to letter, spelled exactly: “${quoted[1]}”` : `the words “${subject}”, spelled exactly`;
    const banner = lettering && H / W >= 2.5;
    try {
      return keepAiDesigns(await aiService.design({ subject: asked, style, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: banner ? H / W : W / H, ...(banner ? { banner: true } : {}) }));
    } catch (err) {
      throw aiFailed(err, "The design maker had a problem.");
    }
  };
  const changeDrawing = async ({ baseUrl, change, areaKey }) => {
    const { W, H } = drawSize(areaKey);
    try {
      return keepAiDesigns(await aiService.design({ baseUrl, change, teeIsDark: lum(fabricHex) < 0.55, ratio: W / H }));
    } catch (err) {
      throw aiFailed(err, "The design couldn’t be changed just now.");
    }
  };
  const drawPlace = async (url, key) => Boolean(await placeAiDesign(url, key));
  // "Improve my idea" (Draw tab and Chat): the text AI makes the idea clear and says what will be drawn,
  // suggesting a style and one of the free print areas (with its real size now). Free — no picture request.
  const improveIdea = async (idea) => {
    const free = positions.filter((p) => usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length);
    try {
      return await aiService.improve({
        idea,
        teeColour: colour?.name || "white",
        teeIsDark: lum(fabricHex) < 0.55,
        areas: free.map((p) => ({ key: p.key, label: p.label, side: p.side, cm: areaCm(p, sizeNow) })),
      });
    } catch (err) {
      throw aiFailed(err, "I couldn’t improve that just now. Try again, or draw it with your own words.");
    }
  };
  // the same in the chat: the preview, then Draw this / Open in the Draw tab / Draw my words (never a dead end)
  const chatImprove = async (a) => {
    try {
      const got = await improveIdea(a.idea);
      // the print area it will be drawn for, shown in the card and changeable there: the one the customer named,
      // else the AI's suggestion, else the open area, else the main front area (only areas that are free)
      const freeKey = (k) => k && positions.some((p) => p.key === k && (usedKeys.includes(k) || !blockersOf(k, positions, usedKeys).length));
      const area = [a.areaKey, got.area, active].find(freeKey) || positions.find((p) => p.side === "front" && p.main && freeKey(p.key))?.key || positions.find((p) => freeKey(p.key))?.key || null;
      const res = { ...got, area };
      const areaLabel = positions.find((p) => p.key === area)?.label;
      setChatState((st) => ({ ...st, idea: { ...(st.idea || { subject: a.idea, areaKey: a.areaKey }), improved: res } }));
      return [botSays("Here’s what I’ll draw. Change the print area in the card if you like, then tap “Draw this”."), { preview: { ...res, areaLabel } }, chipRow([DRAW_THIS, IN_DRAW_TAB, DRAW_MINE])];
    } catch (err) {
      return [botSays(err.message), chipRow([DRAW_MINE, IN_DRAW_TAB])];
    }
  };
  const studioPlace = async (r, areaKey) => {
    const key = areaKey || photoTarget?.key;
    if (!key) return false;
    aiCuts.current.set(r.url, { path: r.url, w: r.w, h: r.h }); // already final: put on as it is
    return Boolean(await placeAiDesign(r.url, key));
  };

  // A ready-made layout: its texts go to the first area the garment offers that is free.
  const applyTemplate = (key, fresh) => {
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    const base = fresh ? [] : elements;
    const taken = [...new Set(base.map((e) => e.position))];
    const added = [];
    const skipped = []; // parts of the layout with no area on this garment (or covered)
    for (const item of tpl.items) {
      const pos = item.areas.map((k) => positions.find((p) => p.key === k)).find((p) => p && (taken.includes(p.key) || !blockersOf(p.key, positions, taken).length));
      if (!pos) {
        skipped.push(item.role ? `the player ${item.role}` : `“${item.text}”`);
        continue;
      }
      const { hCm } = areaPx(pos);
      const start = { type: "text", text: item.text, fontFamily: item.font || "Anton", fontSizePct: Math.min(60, (item.cm / hCm) * 100), color: inkDefault, align: "center", effect: "straight", x: 50, y: item.y, width: 0, height: 0, ...(item.role ? { role: item.role } : {}), ...(item.link ? { link: item.link } : {}) };
      let el = textBox(start, pos);
      if (el.width > 90) el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
      added.push({ id: makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: base.length + added.length + 1, ...el });
      if (!taken.includes(pos.key)) taken.push(pos.key);
    }
    if (!added.length) return say("This layout needs print areas that this garment doesn’t have, or that are covered by your current design.");
    commit(() => [...base, ...added]);
    openArea(added[0].position, { force: true });
    setSelectedId(null);
    if (skipped.length) say(`Left out ${[...new Set(skipped)].join(", ")}: this ${garment?.label || "garment"} has no free print area for ${skipped.length === 1 ? "it" : "them"}.`);
  };
  // the team page's way in: the Team jersey layout, then the assistant asks for the players
  const startTeam = () => {
    applyTemplate("team", true);
    openAiTab("chat");
    setChat((m) => [
      ...m.map((x) => (x.chips ? { ...x, done: true } : x)),
      botSays("Your team layout is on the tee: a small team name on the chest, and the team name, player name and number on the back. Tap any text to change the words, font or colour. Then send me your players as name, number and size, one per line or separated by commas, like this: Arun 7 L, Karthik 10 XL. Every player gets their own tee. You can also fill the list in Review."),
      chipRow(["Continue to review", "Something else"]),
    ]);
  };
  const applyFix = (issue) => {
    const pos = positions.find((p) => p.key === issue.position);
    commit((prev) => prev.map((e) => (e.id !== issue.elId ? e : issue.measure && pos ? textBox({ ...e, ...issue.patch }, pos) : { ...e, ...issue.patch })));
  };
  const assistantAct = (a, progress) => {
    if (a.type === "generate") return generateDesigns(a);
    if (a.type === "slogans") return writeSlogans(a);
    if (a.type === "improve") return chatImprove(a);
    if (a.type === "edit") return chatEdit(a, progress);
    if (a.type === "photoPick") return openPhotoStudio();
    if (a.type === "aiTab") {
      // "Draw a picture for me", a drawing typed in the chat, "Turn my photo into art": over to that tab
      if (a.tab === "draw") setDrawSession((d) => ({ ...d, view: "form", ...(a.subject ? { subject: a.subject } : {}), ...(a.style ? { style: a.style } : {}), ...(a.areaKey ? { areaKey: a.areaKey } : {}) }));
      return openAiTab(a.tab);
    }
    if (a.type === "place") return placeAiDesign(a.url, a.areaKey);
    if (a.type === "login") return goToLogin();
    if (a.type === "text") return addText(a.text);
    if (a.type === "tab") {
      // "Open the art library" / "Upload a picture": over to the manual tools
      setAddTab(a.tab);
      setAssist(false);
      if (!active) ensureArea();
      return setSelectedId(null);
    }
    if (a.type === "template") return applyTemplate(a.key, a.fresh);
    if (a.type === "size") {
      setSize(a.value);
      return writeJSON(SIZE_KEY, a.value);
    }
    if (a.type === "area") {
      pickAreaByHand(a.key);
      return setSelectedId(null);
    }
    if (a.type === "review") return toReview(true);
    if (a.type === "players") {
      // a pasted team list: one tee per player
      setPlayers(a.players.slice(0, MAX_PLAYERS).map((p) => ({ id: makeId(), ...p })));
      return setTeam(true);
    }
    if (a.type === "ink") {
      const texts = elements.filter((e) => e.type === "text" && e.position === active);
      if (!texts.length) return say("There’s no text on this print area yet. Add some, then pick a colour.");
      commit((prev) => prev.map((e) => (e.type === "text" && e.position === active ? { ...e, color: a.color } : e)));
      return say(`Text on ${activePos.label} recoloured. Press Undo (↶) to go back.`);
    }
  };

  // sure === true: go even if the design check has findings (the customer chose to)
  const toReview = (sure) => {
    if (!elements.length) return say("Add a design first — tap a print area or use Text, Upload or Art.");
    if (clashes.length) return say(`${clashes[0][0].label} and ${clashes[0][1].label} overlap on the tee. Remove the print from one of them to continue.`);
    // design check: show findings in the assistant once; pressing Review again goes on
    const issues = designIssues();
    const sig = issues.map((i) => i.id).join();
    if (sure !== true && issues.length && ackIssues.current !== sig) {
      ackIssues.current = sig;
      openArea(issues[0].position);
      setSelectedId(null);
      setAiTab("chat");
      setAssist(true);
      setChat((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), ...checkMessages(issues, { beforeReview: true })]);
      return;
    }
    closeArea();
    setStep("review");
    setSpin(true);
    setSideShown(null);
    setQtys((q) => (Object.values(q).some((n) => n > 0) ? q : { [sizeNow]: 1 }));
    // a team order opens on the first player's tee (their name and number, not the sample text)
    setPreviewId(teamMode ? players.find(filled)?.id ?? null : null);
    // the reveal: the camera glides in while a folded tee rises, opens in the air and the prints appear
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setCamRequest({ ...SHOWROOM, ...(calm ? {} : { from: [0, 1.9, 10.5], ms: 2600 }), n: nextReq() });
    setUnfoldKey(calm ? 0 : nextReq());
    // the view stays dark until the room is drawn (or 3 s pass, in case the 3D view cannot say so)
    setLit(false);
    clearTimeout(litTimer.current);
    litTimer.current = setTimeout(() => setLit(true), 3000);
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
    // Paint every print area again without its dashed border right now. (Waiting for the page to redraw
    // after closing the area was a race: with a big picture the border was still there and got saved in
    // the My designs picture.) The page draws its usual pictures again afterwards.
    for (const [key, entry] of renderers.current) {
      entry.r.render(paintedEls.current.get(key) || [], { outline: false });
      lastSig.current.delete(key);
      api.touch?.(key);
    }
    const out = {};
    for (const [v] of SIDES) out[v] = await cropMockup(api.snapshot(v));
    return out;
  };

  // Review of a team order: the four side pictures follow the player being looked at
  // (taken again a moment after the last change, so typing a name does not retake them per letter).
  const previewSig = previewPlayer ? `${previewPlayer.id}|${previewPlayer.name}|${previewPlayer.number}` : "";
  const firstSig = useRef(previewSig);
  useEffect(() => {
    if (step !== "review") {
      firstSig.current = null; // the pictures taken on entering Review already show this player
      return undefined;
    }
    if (firstSig.current === null) {
      firstSig.current = previewSig;
      return undefined;
    }
    if (firstSig.current === previewSig) return undefined;
    firstSig.current = previewSig;
    let alive = true;
    const timer = setTimeout(() => {
      captureMockups().then((m) => alive && m && setShots(SIDES.map(([v, label]) => ({ label, url: m[v] }))));
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [step, previewSig]);

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
      const body = { garmentType: type, color: colour.slug, size: sizeNow, elements, name: name || `${garment.label} design`, mockups: mockups || undefined, players: teamPlayers.map(({ name: n, number, size: sz }) => ({ name: n, number, size: sz })) };
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
      unsaved.current = false;
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
    setSideShown(view);
    // the tee turns to that side; the camera comes back to the front of the dressing room
    setCamRequest({ ...SHOWROOM, n: nextReq() });
  };
  const turn360 = () => {
    setSpin(true);
    setSideShown(null);
    setCamRequest({ ...SHOWROOM, n: nextReq() });
  };
  const backToDesign = () => {
    setStep("design");
    setShots(null);
    setCamRequest({ view: "front", n: nextReq() });
  };
  // a team order is one tee per player; otherwise the sizes × quantities picked
  // The top-left arrow: one step back, never straight out of the room (the design stays as it is).
  // out of the room: back to the page they came from (team page, home, a collection…). Opened straight from a
  // link (nothing to go back to): the team page for a team design, else Create your IDENTEE.
  const leaveRoom = () => {
    if (cameFromSite) return navigate(-1);
    navigate(teamLink ? "/team-orders" : "/customizable");
  };
  const stepBack = () => {
    if (step === "review") return backToDesign();
    closeArea();
    setAssist(false);
    setAreasOpen(false);
    setPickOpen(false);
    setStep("fit");
    setCamRequest(narrow ? { position: [0, 1.5, 8], ms: 900, n: nextReq() } : { ...SHOWCASE, ms: 900, n: nextReq() });
  };
  const chosen = teamMode
    ? sizeCounts(teamPlayers)
    : Object.entries(qtys)
        .filter(([, n]) => n > 0)
        .map(([sz, n]) => ({ size: sz, qty: n }));
  const pieces = chosen.reduce((n, c) => n + c.qty, 0);
  const setQty = (sz, n) => setQtys((q) => ({ ...q, [sz]: Math.max(0, Math.min(99, n)) }));
  // Team order on / off. Turning it on starts the list with the name and number typed on the tee.
  const setTeamOn = (on) => {
    setTeam(on);
    if (on && !players.length) {
      const typed = (role) => (elements.find((e) => e.type === "text" && e.role === role)?.text || "").trim();
      const first = { id: makeId(), name: typed("name").slice(0, NAME_MAX), number: typed("number").slice(0, NUMBER_MAX), size: sizeNow };
      setPlayers([first]);
      return setPreviewId(first.id);
    }
    setPreviewId(on ? players.find(filled)?.id ?? null : null);
  };
  // Show one player's tee: their name and number go on the 3D tee, turned to the side they are printed on.
  const showPlayer = (id) => {
    if (id === previewId) return;
    setPreviewId(id);
    const side = elements.find((e) => e.type === "text" && e.role)?.side;
    if (side && sideShown !== side) showSide(side);
  };

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
    const maxW = narrow ? Math.min(200, window.innerWidth - 64) : 230;
    // Tall, thin areas (Vertical Front 10 × 52 cm …) get a taller box, but
    // never so tall that the controls below it are pushed out of the panel.
    const tall = H / W > 2;
    const maxH = narrow
      ? Math.min(tall ? 200 : 140, window.innerHeight * (tall ? 0.26 : 0.18))
      : Math.min(tall ? 230 : 170, window.innerHeight * (tall ? 0.3 : 0.22));
    return Math.round(Math.max(tall ? 40 : 110, Math.min(maxW, (maxH * W) / H)));
  })();

  return (
    <div className="dr-app" data-step={step} data-lit={lit ? "1" : undefined}>
      <header className="dr-top">
        {/* the arrow goes back one step: Review → Design → colour & size → the page the customer came from */}
        {step === "fit" ? (
          <button type="button" className="dr-back" onClick={leaveRoom} aria-label="Back" title="Back">←</button>
        ) : (
          <button type="button" className="dr-back" onClick={stepBack} aria-label={step === "review" ? "Back to the design" : "Back to colour and size"} title={step === "review" ? "Back to the design" : "Back to colour and size"}>←</button>
        )}
        <span className="dr-brand">IDENTEE</span>
        {step === "design" ? (
          <div className="dr-pick">
            <button type="button" className="dr-pickbtn" aria-expanded={pickOpen} aria-haspopup="dialog" onClick={() => setPickOpen((o) => !o)}>
              <i style={{ background: fabricHex }} aria-hidden="true" />
              {/* on a phone only the colour dot and "Size M" (there is no room for the names) */}
              <span className="dr-pickname">
                <b>{garment.label}</b> {colour?.name}
              </span>
              <span className="dr-picksize">{sizeNow}</span>
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
          {step !== "review" && (
            <button type="button" className="dr-darkbtn" onClick={toggleDark} aria-pressed={darkRoom} aria-label={darkRoom ? "Switch to the light studio" : "Switch to the dark studio"} title={darkRoom ? "Light studio" : "Dark studio"}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {darkRoom ? (
                  <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
                ) : (
                  <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
                )}
              </svg>
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
          {wasPrice > 0 && <s className="dr-was">₹{wasPrice.toLocaleString("en-IN")}</s>}
          ₹{unitPrice.toLocaleString("en-IN")}
          <small>{aiAddOn ? `incl. ₹${aiAddOn} picture` : "per piece"}</small>
        </div>
        {step === "design" && (
          <button type="button" className={`dr-aibtn${assist ? " on" : ""}`} aria-pressed={assist} onClick={() => toggleAiTab(aiTab)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON_AI} />
            </svg>
            Assistant
          </button>
        )}
        {step === "design" && (
          <button type="button" className="dr-cta dr-reviewbtn" onClick={toReview}>
            Review →
          </button>
        )}
      </header>

      <main className="dr-stage" data-editing={step === "design" && active ? "1" : undefined} data-fit={step === "fit" ? "1" : undefined} data-dark={darkRoom && step !== "review" ? "1" : undefined}>
        {step === "design" && (
          <aside className={`dr-side${areasOpen ? " open" : ""}`} aria-label="Where to print" onMouseLeave={() => { hoverCam.current.side = null; }}>
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
                  <p className="dr-empty">Pick a spot here, or tap it on the tee. Each card shows the area at its real size for {sizeNow}.</p>
                  <div className="dr-areatabs" role="tablist" aria-label="Side of the tee">
                    {AREA_GROUPS.filter(([, sides]) => positions.some((p) => sides.includes(p.side))).map(([title, sides]) => {
                      const count = positions.filter((p) => sides.includes(p.side) && usedKeys.includes(p.key)).length;
                      return (
                        <button
                          key={title}
                          type="button"
                          role="tab"
                          aria-selected={areaTab === title}
                          className={areaTab === title ? "on" : ""}
                          onClick={() => {
                            setAreaTab(title);
                            // nothing being edited: the tee turns to show that side
                            if (!active && !narrow) setCamRequest({ view: sides[0], ms: 700, n: nextReq() });
                          }}
                        >
                          {title}
                          {count > 0 && <i aria-label={`${count} with a design`}>{count}</i>}
                        </button>
                      );
                    })}
                  </div>
                  {AREA_GROUPS.filter(([title]) => title === areaTab).map(([title, sides]) => {
                    const list = positions.filter((p) => sides.includes(p.side));
                    if (!list.length) return null;
                    return (
                      <div key={title}>
                        <div className="dr-cards">
                          {list.map((p) => {
                            const [w, h] = areaCm(p, sizeNow);
                            const used = usedKeys.includes(p.key);
                            const blockedBy = used ? [] : blockersOf(p.key, positions, usedKeys);
                            return (
                              <button
                                key={p.key}
                                type="button"
                                className={`dr-area${active === p.key ? " on" : ""}${used ? " used" : ""}${blockedBy.length ? " blocked" : ""}${hoverKey === p.key && active !== p.key ? " hot" : ""}`}
                                onMouseEnter={() => hoverCard(blockedBy.length ? null : p)}
                                onMouseLeave={() => hoverCard(null)}
                                onFocus={() => !blockedBy.length && setHoverKey(p.key)}
                                onBlur={() => setHoverKey(null)}
                                title={blockedBy.length ? `Overlaps ${blockedBy.map((b) => b.label).join(" and ")} — remove that design first` : `${p.label} · ${w} × ${h} cm`}
                                aria-label={`${p.label}, ${w} by ${h} cm${used ? ", has a design" : ""}${blockedBy.length ? `, blocked by ${blockedBy.map((b) => b.label).join(" and ")}` : ""}`}
                                aria-disabled={blockedBy.length ? "true" : undefined}
                                aria-pressed={active === p.key}
                                onClick={() => pickAreaByHand(p.key)}
                              >
                                {/* one small tee per print area, with just that area's box — or, once it has a design, that design */}
                                <AreaThumb position={p} size={sizeNow} print={used ? thumbs[p.key] : null} fabric={fabricHex} />
                                {used && <span className="tick" aria-hidden="true">✓</span>}
                                <b>{p.label}</b>
                                <span>{w}×{h} cm</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="dr-empty">A tick = has a design. Faded = covered by another design.</p>
                </>
              }

            </div>
          </aside>
        )}

        <div className="dr-view">
          {model && colour && (
            <div className="dr-room" data-editing={active ? "1" : undefined} data-room={step === "review" ? "boutique" : "studio"} data-hot={hoverPos ? "1" : undefined}>
              <Room3D
                ref={roomApi}
                model={model}
                colour={fabricHex}
                areas={areas3D}
                onPickArea={(k) => step === "design" && pickAreaByHand(k)}
                camRequest={camRequest}
                interactive={step === "design"}
                still={!!active}
                hotspots={step === "design" ? hotspots : undefined}
                glowKey={step === "design" ? hoverKey : null}
                activeKey={active}
                onHoverArea={(k) => {
                  setHoverKey(k);
                  const side = k && positions.find((p) => p.key === k)?.side;
                  if (side) setAreaTab(groupOfSide(side)); // the list shows the side being pointed at
                }}
                popKey={popKey}
                showcase={step === "fit"}
                twirlKey={twirlKey}
                dark={darkRoom}
                room={step === "review" ? "boutique" : "studio"}
                spin={spin}
                face={sideShown}
                unfoldKey={step === "review" ? unfoldKey : 0}
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
              {hoverPos ? (
                <div className="dr-hotchip" role="status" key={hoverPos.key}>
                  <b>{hoverPos.label}</b>
                  <span>{areaCm(hoverPos, sizeNow).join(" × ")} cm</span>
                  <i>{usedKeys.includes(hoverPos.key) ? "Tap to edit" : "Tap to design here"}</i>
                </div>
              ) : (
                !active && <div className="dr-hint">Point at the tee and tap a spot to design there · drag to turn · scroll to zoom</div>
              )}
              {active && sel && !assist && (
                <div className="dr-quickbar" role="toolbar" aria-label="Quick changes to the selected item">
                  <button type="button" onClick={() => resizeSel(1 / 1.1)} aria-label="Smaller" title="Smaller"><span className="a-sm">A</span>−</button>
                  <button type="button" onClick={() => resizeSel(1.1)} aria-label="Bigger" title="Bigger"><span className="a-lg">A</span>+</button>
                  <span className="sep" />
                  <button type="button" onClick={centreSel} title="Put it in the middle, left to right">Centre</button>
                  <button type="button" onClick={dupSel} title="Make a copy">Copy</button>
                  <button type="button" onClick={() => layerSel(1)} title="Bring in front of the other items">To front</button>
                  <span className="sep" />
                  <button type="button" className="del" onClick={removeSel} title="Remove this item">Delete</button>
                </div>
              )}
              {!elements.length && !active && !assist && !areasOpen && (
                <div className="dr-starts" role="group" aria-label="Ways to start">
                  <button type="button" className="photo" onClick={openPhotoStudio}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PHOTO} /></svg>
                    <b>Your photo</b>
                    <small>As art, or print-ready</small>
                  </button>
                  <button type="button" onClick={() => { startAdding(); setAddTab("text"); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_TEXT} /></svg>
                    <b>Add text</b>
                    <small>A name, a slogan, a number</small>
                  </button>
                  <button type="button" onClick={() => { startAdding(); setAddTab("upload"); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_UPLOAD} /></svg>
                    <b>Upload a picture</b>
                    <small>A logo or picture, as it is</small>
                  </button>
                  <button type="button" className="ai" onClick={() => openAiTab("chat")}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_AI} /></svg>
                    <b>Ask the Assistant</b>
                    <small>Describe it, I’ll design it</small>
                  </button>
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
              <div className="dr-credit">
                <a href={model?.credit.href} target="_blank" rel="noopener noreferrer">{model?.credit.text}</a>
              </div>
            </>
          )}
        </div>

        {step === "design" && (
          <nav className="dr-tools" aria-label="Design steps">
            <button type="button" className={`dr-toolbtn${areasOpen ? " on" : ""}`} aria-pressed={areasOpen} onClick={() => { setAssist(false); setAreasOpen((o) => !o); }}>
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
            <button type="button" className={`dr-toolbtn${assist ? " on" : ""}`} aria-pressed={assist} onClick={() => toggleAiTab(aiTab)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON_AI} />
              </svg>
              Assistant
            </button>
          </nav>
        )}

        {step === "design" && assist && (
          // The AI panel: Chat (the assistant), Draw (DrawStudio.jsx) and Photo (PhotoStudio.jsx). All three stay
          // mounted, so a tab keeps its state (and a running request) while another is shown.
          <section className={`dr-editor dr-assist dr-ai tab-${aiTab}`} data-wide={assistWide ? "1" : undefined} aria-label="AI design">
            <header>
              <div>
                <div className="eyebrow">AI design</div>
                <h2>{aiTab === "draw" ? "Describe it, I’ll draw it" : aiTab === "photo" ? "Your photo, on your tee" : "Tell me what you want"}</h2>
                <div className="sub">
                  {aiTab === "draw"
                    ? "The AI draws a design for your tee."
                    : aiTab === "photo"
                      ? `Turn it into art, or keep it a photo — print-ready.${photoTarget ? ` It goes on ${photoTarget.label}.` : ""}`
                      : activePos
                        ? `Working on ${activePos.label}. You can still change anything by hand.`
                        : "Describe your tee, or pick a starting point."}
                </div>
              </div>
              <div className="dr-assisthead">
                {/* more room for the chat: about half the screen, and back */}
                <button
                  type="button"
                  className="dr-widen"
                  aria-pressed={assistWide}
                  aria-label={assistWide ? "Make the assistant narrower" : "Make the assistant wider"}
                  title={assistWide ? "Narrower" : "Wider"}
                  onClick={toggleAssistWide}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={assistWide ? "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" : "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"} />
                  </svg>
                  <span>{assistWide ? "Narrower" : "Wider"}</span>
                </button>
                <button type="button" className="dr-x" aria-label="Close" onClick={() => setAssist(false)}>✕</button>
              </div>
            </header>
            <div className="dr-aitabs" role="tablist" aria-label="AI design">
              {AI_TABS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={aiTab === k} className={aiTab === k ? "on" : ""} onClick={() => setAiTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="dr-aipane" hidden={aiTab !== "chat"}>
              <Assistant messages={chat} setMessages={setChat} state={chatState} setState={setChatState} ctx={assistantCtx} onAct={assistantAct} onFix={applyFix} placed={aiOn} fabric={fabricHex} />
              {elements.length > 0 && (
                <button type="button" className="dr-handoff" onClick={editByHand}>
                  Not quite right? Edit it by hand →
                </button>
              )}
            </div>
            <div className="dr-aipane" hidden={aiTab !== "draw"}>
              <DrawStudio
                ai={{ ...ai, loggedIn: isLoggedIn() }}
                areas={positions.map((p) => ({ key: p.key, label: p.label, free: usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length }))}
                targetKey={photoTarget?.key}
                fabric={fabricHex}
                session={drawSession}
                setSession={setDrawSession}
                onLogin={goToLogin}
                onDraw={drawDesign}
                onChange={changeDrawing}
                onPlace={drawPlace}
                onImprove={improveIdea}
                onClose={() => setAssist(false)}
              />
            </div>
            <div className="dr-aipane" hidden={aiTab !== "photo"}>
              <PhotoStudio
                ai={{ ...ai, loggedIn: isLoggedIn() }}
                target={photoTarget ? { label: photoTarget.label, cm: areaCm(photoTarget, sizeNow) } : { label: "your tee", cm: null }}
                areas={positions.filter((p) => usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length).map((p) => ({ key: p.key, label: p.label }))}
                fabric={fabricHex}
                session={photoSession}
                setSession={setPhotoSession}
                onLogin={goToLogin}
                onUpload={studioUpload}
                onArt={studioArt}
                onPrintReady={studioPrintReady}
                onPlace={studioPlace}
                onClose={() => setAssist(false)}
              />
            </div>
          </section>
        )}

        {step === "design" && activePos && !assist && (
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
            {sel ? (
              <Controls
                sel={sel}
                areaCmW={areaPx(activePos).wCm}
                areaRatio={areaPx(activePos).W / areaPx(activePos).H}
                onPatch={updateSel}
                onDelete={removeSel}
                onDuplicate={dupSel}
                onLayer={layerSel}
                onRemoveBg={removeBg}
                onFix={ai.available ? fixPicture : null}
                onAddMore={() => setSelectedId(null)}
                canEnlarge={ai.available}
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
                <div className="dr-controls">

                {addTab === "text" && (
                  <>
                    <button type="button" className="dr-add big" onClick={() => addText("YOUR TEXT")}>Add a heading</button>
                    <button type="button" className="dr-add" onClick={() => addText("your text here", { small: true })}>Add a small line</button>
                    <div className="dr-two">
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { effect: "arc-up" })}>Curved up</button>
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { effect: "arc-down" })}>Curved down</button>
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { vertical: "up" })}>Vertical (reads up)</button>
                      <button type="button" className="dr-add" onClick={() => addText("YOUR TEXT", { vertical: true })}>Vertical (reads down)</button>
                    </div>
                    <p className="dr-empty">Change the words, font, colour and size after adding.</p>
                  </>
                )}

                {addTab === "upload" && (
                  <>
                    <button type="button" className="dr-photocta" onClick={openPhotoStudio}>
                      <b>Photo studio</b>
                      <span>Turn a photo into art, or make it print-ready →</span>
                    </button>
                    <button type="button" className="dr-drop" onClick={pickUpload}>
                      <b>Upload a photo or logo</b>
                      <span>JPG, PNG or WebP · up to 10 MB</span>
                    </button>
                    <p className="dr-empty">A print-quality check shows if a picture is too small to print sharp.</p>
                  </>
                )}

                {addTab === "art" && <ArtPanel categories={artCategories} designs={artDesigns} onOpen={(id) => dispatch(fetchArtDesigns(id))} onPick={pickArt} />}

                </div>
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
                  <button key={sh.label} type="button" className={`dr-shot${sideShown === SIDES[i][0] ? " on" : ""}`} aria-pressed={sideShown === SIDES[i][0]} onClick={() => showSide(SIDES[i][0])} aria-label={`Show the ${sh.label.toLowerCase()} on the 3D tee`}>
                    {sh.url ? <img src={sh.url} alt="" /> : <div className="ph" />}
                    <span>{sh.label}</span>
                  </button>
                ))}
              </div>
              {roles && (
                <div className="dr-teamswitch">
                  <div className="eyebrow">What is printed on each tee?</div>
                  <div className="dr-seg" role="group" aria-label="What is printed on each tee">
                    <button type="button" className={!teamMode ? "on" : ""} aria-pressed={!teamMode} onClick={() => setTeamOn(false)}>The same on every tee</button>
                    <button type="button" className={teamMode ? "on" : ""} aria-pressed={teamMode} onClick={() => setTeamOn(true)}>A name &amp; number per tee</button>
                  </div>
                </div>
              )}
              {teamMode && (
                <TeamList players={players} setPlayers={setPlayers} sizes={sizes} sizeNow={sizeNow} roles={rolesIn(elements)} shownId={previewId} onShow={showPlayer} />
              )}
              <div className="dr-qty" aria-label="Sizes and quantity" hidden={teamMode}>
                <div className="eyebrow">Sizes &amp; quantity</div>
                {sizes.map((sz) => {
                  const r = garment.sizeChart?.find((x) => x.size === sz);
                  const n = qtys[sz] || 0;
                  return (
                    <div key={sz} className={`dr-qrow${n ? " on" : ""}`}>
                      <b>{sz}</b>
                      <small>
                        {r ? `chest ${r.chest}″ · length ${r.length}″` : ""}
                        {/* a co-ord set's shorts */}
                        {r?.bottomLength ? ` · shorts: waist ${r.waist}″, length ${r.bottomLength}″` : ""}
                      </small>
                      <div className="dr-stepper">
                        <button type="button" onClick={() => setQty(sz, n - 1)} disabled={!n} aria-label={`One less ${sz}`}>−</button>
                        <output key={n} aria-live="polite">{n}</output>
                        <button type="button" onClick={() => setQty(sz, n + 1)} aria-label={`One more ${sz}`}>+</button>
                      </div>
                    </div>
                  );
                })}
                <p className="dr-qnote">Every size is printed at its own true size from the print guide.</p>
                <p className="dr-qnote">By ordering, you confirm you have the right to print everything in this design.</p>
              </div>
              <div className="dr-summary">
                <div>
                  <p>
                    {garment.label} · {colour?.name} · {teamMode ? <b>{chosen.map((c) => `${c.size} × ${c.qty}`).join(", ") || "no players yet"}</b> : <>size <b>{sizeNow}</b></>}
                  </p>
                  <p className="muted">
                    {positions
                      .filter((p) => elements.some((e) => e.position === p.key))
                      .map((p) => `${p.label} ${areaCm(p, sizeNow).join(" × ")} cm`)
                      .join(" · ")}
                  </p>
                </div>
                <div className="dr-total">
                  {wasPrice > 0 && pieces > 0 && <s className="dr-was">₹{(wasPrice * pieces).toLocaleString("en-IN")}</s>}
                  <Rolling value={unitPrice * pieces} format={rupees} />
                  <small>{pieces} × ₹{unitPrice.toLocaleString("en-IN")}{aiAddOn ? ` (incl. ₹${aiAddOn} for the picture)` : ""} · incl. GST</small>
                  {shippingNote(shipRule, pieces) && <small className="dr-shipnote">{shippingNote(shipRule, pieces)}</small>}
                  {siteOffer && <small className="dr-offernote">+ Extra {siteOffer.offerPercentage}% off at checkout with code <b>{siteOffer.code}</b></small>}
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
              if (photoLink) openPhotoStudio();
              if (teamLink) startTeam();
            }}
            onAssistant={() => {
              setEarlier(null);
              enterRoom();
              if (teamLink) startTeam();
              else openAiTab("chat");
            }}
            onPhoto={() => {
              setEarlier(null);
              enterRoom();
              openPhotoStudio();
            }}
            credit={model?.credit}
            earlier={earlier}
            onContinue={continueEarlier}
          />
        )}

        {cartNote && (
          <div className="dr-overlay" role="dialog" aria-modal="true" aria-label="Added to cart">
            <div className="dr-fit dr-added">
              <svg className="dr-tick" viewBox="0 0 52 52" aria-hidden="true">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27l8 8 15-17" />
              </svg>
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
        {/* busy: a line of text, or { label, expect, hint } for the AI (a card with a live seconds count) */}
        {busy && (
          <div className="dr-busy">
            <WaitCard key={typeof busy === "string" ? busy : busy.label} {...(typeof busy === "string" ? { label: busy } : busy)} />
          </div>
        )}
      </main>

      {step === "review" && (
        <nav className="dr-dock" aria-label="Order">
          <button type="button" className="dr-cta ghost" onClick={backToDesign}>← Edit design</button>
          <button type="button" className="dr-cta" onClick={addToCart} disabled={!!busy || !pieces}>Add to cart</button>
          <button type="button" className="dr-cta gold" onClick={order} disabled={!!busy || !pieces}>
            Buy now · {pieces} pc{pieces === 1 ? "" : "s"} · <Rolling value={unitPrice * pieces} format={rupees} /> →
          </button>
        </nav>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
      <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPhotoForArt} />
    </div>
  );
}

/* ---------- pieces ---------- */
// Review of a team order: one row per player (name, number, size). Each row is one tee.
// Tapping a row shows that player's tee on the 3D model.
function TeamList({ players, setPlayers, sizes, sizeNow, roles, shownId, onShow }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const full = players.length >= MAX_PLAYERS;
  const patch = (id, p) => setPlayers((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = () => {
    const row = { id: makeId(), name: "", number: "", size: players[players.length - 1]?.size || sizeNow };
    setPlayers((list) => [...list, row]);
    onShow(row.id);
  };
  const found = parsePlayers(pasted, sizes, sizeNow);
  const addPasted = () => {
    if (!found.length) return;
    // an untouched first row makes way for the list
    setPlayers((list) => [...list.filter(filled), ...found.map((p) => ({ id: makeId(), ...p }))].slice(0, MAX_PLAYERS));
    setPasted("");
    setPasteOpen(false);
  };
  const ready = players.filter(filled);
  return (
    <div className="dr-team" aria-label="Players">
      <div className="dr-teamhead">
        <div className="eyebrow">Players · one tee each</div>
        <b>{ready.length}</b>
      </div>
      <div className="dr-teamrows">
        {players.map((p, i) => (
          <div key={p.id} className={`dr-prow${shownId === p.id ? " on" : ""}`} onFocus={() => onShow(p.id)} onClick={() => onShow(p.id)}>
            <span className="n">{i + 1}</span>
            {(roles.name || p.name) && <input value={p.name} maxLength={NAME_MAX} placeholder="Name" aria-label={`Player ${i + 1} name`} onChange={(e) => patch(p.id, { name: e.target.value })} />}
            {(roles.number || p.number) && <input className="num" value={p.number} maxLength={NUMBER_MAX} inputMode="numeric" placeholder="No." aria-label={`Player ${i + 1} number`} onChange={(e) => patch(p.id, { number: e.target.value.replace(/[^0-9]/g, "") })} />}
            <select value={p.size} aria-label={`Player ${i + 1} size`} onChange={(e) => patch(p.id, { size: e.target.value })}>
              {sizes.map((sz) => <option key={sz}>{sz}</option>)}
            </select>
            <button type="button" className="dr-x" aria-label={`Remove player ${i + 1}`} onClick={(e) => { e.stopPropagation(); setPlayers((list) => list.filter((x) => x.id !== p.id)); }}>✕</button>
          </div>
        ))}
      </div>
      <div className="dr-teamadd">
        <button type="button" className="dr-chip" onClick={add} disabled={full}>+ Add a player</button>
        <button type="button" className="dr-chip" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen} disabled={full}>Paste a list</button>
      </div>
      {pasteOpen && (
        <div className="dr-paste">
          <textarea rows={4} value={pasted} placeholder={"One player per line:\nArun 7 L\nKarthik 10 XL"} aria-label="Paste your list of players" onChange={(e) => setPasted(e.target.value)} />
          <button type="button" className="dr-mini" onClick={addPasted} disabled={!found.length}>
            {found.length ? `Add ${found.length} player${found.length === 1 ? "" : "s"}` : "Add players"}
          </button>
        </div>
      )}
      {/* a list with names (or numbers) but no text on the tee to carry them */}
      {!roles.name && players.some((p) => p.name) && (
        <p className="dr-qnote warn">The names are not printed yet: no text on the tee is set as the player’s name. Press “Edit design”, tap the name text and, at the bottom of its settings, choose “Ordering for a team? … name”.</p>
      )}
      {!roles.number && players.some((p) => p.number) && (
        <p className="dr-qnote warn">The numbers are not printed yet: no text on the tee is set as the player’s number. Press “Edit design”, tap the number text and, at the bottom of its settings, choose “Ordering for a team? … number”.</p>
      )}
      <p className="dr-qnote">Tap a player to see their tee. A long name is made smaller so it fits the print area.</p>
      <p className="dr-qnote">Every size is printed at its own true size from the print guide.</p>
      <p className="dr-qnote">By ordering, you confirm you have the right to print everything in this design.</p>
    </div>
  );
}

function Fitting({ garment, colours, colour, onColour, sizes, size, onSize, onEnter, onAssistant, onPhoto, credit, earlier, onContinue }) {
  return (
    <div className="dr-overlay fit">
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
        {/* the highlighted way in: the customer's own photo, as art or print-ready */}
        <button type="button" className="dr-photoenter" onClick={onPhoto}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PHOTO} />
          </svg>
          <span>
            <b>Start with my photo</b>
            <small>Turn it into art, or keep it a photo — print-ready</small>
          </span>
          <i aria-hidden="true">→</i>
        </button>
        <div className="dr-ways">
          <button type="button" className="dr-enter" onClick={onEnter}>Design it myself →</button>
          <button type="button" className="dr-enter alt" onClick={onAssistant}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON_AI} />
            </svg>
            Design with the Assistant
          </button>
        </div>
        <p className="dr-waysnote">Either way, you can switch at any time and change everything by hand.</p>
        <div className="dr-fitfoot">
          {garment.basePrice > 0 && <PriceTag price={garment.basePrice} was={garment.comparePrice} size={14} offer />}
          {credit && <a href={credit.href} target="_blank" rel="noopener noreferrer">{credit.text}</a>}
        </div>
      </div>
    </div>
  );
}

// rotation + a quarter turn, snapped to the nearest quarter and kept between -180 and 180
const quarterTurn = (rotation, by) => {
  let r = Math.round(((rotation || 0) + by) / 90) * 90;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
};

function Controls({ sel, areaCmW, areaRatio, onPatch, onDelete, onDuplicate, onLayer, onRemoveBg, onFix, onAddMore, canEnlarge }) {
  const quality = () => {
    if (!sel?.pxW) return null;
    const printCm = ((sel.width || 0) / 100) * areaCmW;
    // judged as it will be printed: the shop enlarges a low picture before printing (when the AI is on)
    const sharp = printSharpness(sel.pxW, printCm, canEnlarge);
    const dpi = Math.round(sharp.printed);
    const enlarged = sharp.printed > sharp.now * 1.05 && sharp.now < 150;
    const cls = dpi >= 150 ? "good" : dpi >= 100 ? "ok" : "low";
    const word = { good: "Good", ok: "OK", low: "Low — may print blurry" }[cls];
    return (
      <div className="dr-quality">
        Print quality: <b className={cls}>{word}</b> · {printCm.toFixed(1)} cm wide
        {enlarged && cls !== "low" ? " · we sharpen it before printing" : ` · ${dpi} DPI`}
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
            Words
            <textarea
              rows={Math.min(4, Math.max(1, (sel.text || "").split("\n").length))}
              value={sel.text}
              maxLength={200}
              placeholder="Your text"
              onChange={(e) => onPatch({ text: e.target.value || " " }, { measure: true })}
            />
            <small>Press Enter for a new line.</small>
          </label>
          {(sel.link === "team" || sel.link === "solo") && (
            // These words are on the tee more than once (a team name on the chest and on the back). The
            // choice stays here: it can be switched either way at any time.
            <div className="dr-field">
              These words are on the tee more than once. When I change them:
              <div className="dr-seg" role="group" aria-label="When I change these words">
                <button type="button" className={sel.link === "team" ? "on" : ""} aria-pressed={sel.link === "team"} onClick={() => onPatch({ link: "team" })}>
                  Change everywhere
                </button>
                <button type="button" className={sel.link === "solo" ? "on" : ""} aria-pressed={sel.link === "solo"} onClick={() => onPatch({ link: "solo" })}>
                  Only this one
                </button>
              </div>
              <small>{sel.link === "team" ? "The other places follow what you type here." : "This one changes alone. The other places keep their words."}</small>
            </div>
          )}
          {sel.role && (
            // A text that is swapped for each player on a team order (the Team jersey layout sets this by itself).
            // No question to answer: one line that says so, and a way back.
            <div className="dr-teamnote">
              <b>Each player gets their own {sel.role} here.</b> What you typed is only a sample; you add the players in Review.{" "}
              <button type="button" className="dr-teamlink" onClick={() => onPatch({ role: undefined })}>
                Make it the same on every tee
              </button>
            </div>
          )}
          <div className="dr-row">
            <label className="dr-field">
              Font
              <select value={sel.fontFamily} onChange={(e) => onPatch({ fontFamily: e.target.value }, { measure: true })}>
                {[...new Set([sel.fontFamily, ...FONTS])].map((f) => <option key={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </label>
            <label className="dr-field">
              Size
              <input type="range" min="2" max="60" step="0.5" value={sel.fontSizePct} onChange={(e) => onPatch({ fontSizePct: +e.target.value }, { measure: true })} />
            </label>
          </div>
          <div className="dr-field">
            Style
            <div className="dr-row" aria-label="Text style">
              <button type="button" className={`dr-tgl${sel.bold ? " on" : ""}`} aria-pressed={!!sel.bold} title="Bold" onClick={() => onPatch({ bold: !sel.bold }, { measure: true })}><b>B</b></button>
              <button type="button" className={`dr-tgl${sel.italic ? " on" : ""}`} aria-pressed={!!sel.italic} title="Italic" onClick={() => onPatch({ italic: !sel.italic }, { measure: true })}><i>I</i></button>
              <button type="button" className={`dr-tgl${sel.underline ? " on" : ""}`} aria-pressed={!!sel.underline} title="Underline" onClick={() => onPatch({ underline: !sel.underline })}><u>U</u></button>
              <button
                type="button"
                className="dr-tgl"
                title="Switch between CAPITALS and small letters"
                onClick={() => onPatch({ text: sel.text === sel.text.toUpperCase() ? sel.text.toLowerCase() : sel.text.toUpperCase() }, { measure: true })}
              >
                Aa
              </button>
              <span className="dr-gap" />
              {[
                ["left", "Left", "M4 6h16M4 12h10M4 18h13"],
                ["center", "Centre", "M4 6h16M7 12h10M5.5 18h13"],
                ["right", "Right", "M4 6h16M10 12h10M7 18h13"],
              ].map(([k, label, d]) => (
                <button key={k} type="button" className={`dr-tgl${(sel.align || "center") === k ? " on" : ""}`} aria-pressed={(sel.align || "center") === k} title={`${label} — for text with more than one line`} aria-label={`Align ${label}`} onClick={() => onPatch({ align: k })}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
                </button>
              ))}
            </div>
          </div>
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
          <div className="dr-field">
            Ink colour
            <div className="dr-row">
              {INKS.map((k) => (
                <button key={k} type="button" className={`dr-ink${k === sel.color ? " on" : ""}`} style={{ background: k }} aria-label={`Ink ${k}`} onClick={() => onPatch({ color: k })} />
              ))}
              <input type="color" className="dr-inkpick" value={sel.color} aria-label="Pick any ink colour" onChange={(e) => onPatch({ color: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="dr-row">
            <label className="dr-field">
              Letter spacing
              <input type="range" min="-5" max="40" step="1" value={sel.letterSpacingPct || 0} onChange={(e) => onPatch({ letterSpacingPct: +e.target.value }, { measure: true })} />
            </label>
            <label className="dr-field">
              Line spacing
              <input type="range" min="0.8" max="2" step="0.05" value={sel.lineHeight || 1.05} disabled={!(sel.text || "").includes("\n")} title="For text with more than one line" onChange={(e) => onPatch({ lineHeight: +e.target.value }, { measure: true })} />
            </label>
          </div>
          <div className="dr-field">
            Outline
            <div className="dr-row">
              <button type="button" className={`dr-chip${sel.strokeWidthPct > 0 ? "" : " on"}`} onClick={() => onPatch({ strokeWidthPct: 0 })}>None</button>
              {["#141110", "#FFFFFF", "#C9A24B", "#C2352C", "#2441B5"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`dr-ink${sel.strokeWidthPct > 0 && sel.strokeColor === k ? " on" : ""}`}
                  style={{ background: k }}
                  aria-label={`Outline ${k}`}
                  onClick={() => onPatch({ strokeColor: k, strokeWidthPct: sel.strokeWidthPct > 0 ? sel.strokeWidthPct : 4 })}
                />
              ))}
              <input type="color" className="dr-inkpick" value={sel.strokeColor || "#141110"} aria-label="Pick any outline colour" onChange={(e) => onPatch({ strokeColor: e.target.value.toUpperCase(), strokeWidthPct: sel.strokeWidthPct > 0 ? sel.strokeWidthPct : 4 })} />
            </div>
            {sel.strokeWidthPct > 0 && (
              <input type="range" min="1" max="12" step="0.5" value={sel.strokeWidthPct} aria-label="Outline thickness" onChange={(e) => onPatch({ strokeWidthPct: +e.target.value })} />
            )}
          </div>
        </>
      )}
      {sel?.type === "image" && (
        <>
          {quality()}
          {!sel.artDesignId && (
            <button type="button" className="dr-add dr-bgbtn" onClick={onRemoveBg}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4M9 15l3-6 3 6M10 13h4" />
              </svg>
              <span>
                Remove background
                <small>Free. Works in your browser; the first time takes a little longer.</small>
              </span>
            </button>
          )}
          {!sel.artDesignId && onFix && (
            <div className="dr-two">
              <button type="button" className="dr-add" onClick={() => onFix("sharpen")}>
                Make it sharper
                <small>Redraws a blurry picture</small>
              </button>
              <button type="button" className="dr-add" onClick={() => onFix("recolour")}>
                Recolour for this tee
                <small>So it shows on this colour</small>
              </button>
            </div>
          )}
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
          {/* a quarter turn per tap: the easy way to make text or a picture run up or down a tall area */}
          <div className="dr-row">
            <button type="button" className="dr-chip" title="Turn a quarter to the left — reads from bottom to top" onClick={() => onPatch({ rotation: quarterTurn(sel.rotation, -90) })}>↺ Turn</button>
            <button type="button" className="dr-chip" title="Turn a quarter to the right — reads from top to bottom" onClick={() => onPatch({ rotation: quarterTurn(sel.rotation, 90) })}>↻ Turn</button>
          </div>
          <div className="dr-row">
            {sel.type === "image" && (
              <button
                type="button"
                className="dr-chip"
                title="Make the picture as big as the print area allows"
                onClick={() => {
                  // picture's shape (width ÷ height) against the area's: fill the tighter direction
                  const shape = ((sel.width || 50) / (sel.height || 50)) * areaRatio;
                  if (Math.abs((sel.rotation || 0) % 180) === 90) {
                    // turned on its side: its width runs along the area's height
                    const width = 100 * Math.min(1 / areaRatio, shape);
                    const height = (width * areaRatio) / shape;
                    return onPatch({ width, height, x: 50 - width / 2, y: 50 - height / 2 });
                  }
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
      {sel?.type === "text" && !sel.role && (
        // for a team tee built without the layout: the one place a text can be made the player's name or number
        <p className="dr-teamask">
          Ordering for a team? Use this text as each player’s{" "}
          <button type="button" className="dr-teamlink" onClick={() => onPatch({ role: "name" })}>name</button> or{" "}
          <button type="button" className="dr-teamlink" onClick={() => onPatch({ role: "number" })}>number</button>.
        </p>
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
