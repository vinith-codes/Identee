// studio/DesignRoomPage.jsx  —  /customize/:type
//
// The 3D Design Room (docs/CUSTOMIZER_PLAN.md §5c):
//   fitting (colour + size) → room with the tee in the centre → design each
//   print area in a flat, true-to-size editor (shown live on the 3D tee as a
//   decal) → review (mockups of all sides) → order.
// Designs are saved in "layout v2" (x/y/width/height in % of the print box),
// the same format the server validates and checkout prices.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchArtCategories } from "../redux/slices/artCategorySlice";
import { uploadDesignImage } from "../redux/slices/customizationSlice";
import customizationService from "../services/customizationService";
import artDesignService from "../services/artDesignService";
import { fetchCart } from "../redux/slices/cartWishlistSlice";
import { createPortal } from "react-dom";
import { useBackClose } from "../utils/backClose";
import { imageUrl } from "../utils/imageUrl";
import Room3D from "./Room3D";
import AreaEditor from "./AreaEditor";
import PanelEditor from "./PanelEditor";
import { AreaRenderer, cachedImage, imageSrcs, loadImage, measureText, playerElements, printThumb } from "./konvaRender";
import { MAX_PLAYERS, NAME_MAX, NUMBER_MAX, filled, hasRoles, parsePlayers, playerLabel, rolesIn, sizeCounts } from "./teamOrder";
import { areaCm, blockersOf, clashesIn, modelForGarment, placeArea, pointToCm } from "./teeModel";
import { JOIN_CM, MAX_SPOTS, SPOT_SIDES, applySpotFix, isSpotKey, normaliseSpots, reboxChanged, reboxSpot, spotPosition, spotsIn, spotWhere, withSpotBoxes } from "./panelModel";
import { CAP_MSG, dropThing, keepInside, movedThing, panelBox, panelView, scaledThing, snapLines, spotCount, startBox } from "./panelDrag";
import AreaThumb from "./AreaThumb";
import { AREA_GROUPS, groupOfSide, listOrder } from "./areaGroups";
import { startFontPct, startTextY } from "./textStart";
import Rolling from "./Rolling";
import Assistant from "./Assistant";
import ChatsPanel from "./ChatsPanel";
import MyPictures from "./MyPictures";
import PlaceSheet from "./PlaceSheet";
import { PICTURES_CHANGED } from "./pictureHelpers";
import myPicturesService from "../services/myPicturesService";
import { accountChat, chatTitle, DRAFT_PREFIX, hashText, historyFor, keptChat, listChats, loadChat, makeRoom, moveLocalChats, myId, ROOM_PREFIX, saveChat, slimForSaving, UNDO_PREFIX, unfinishedRoom } from "./chatStore";
import { AFTER_AI_SLOGANS, AFTER_DESIGN_CHIPS, BACK, CHANGE_IDEA, DRAW_MINE, PHOTO_AS_IS, PHOTO_CHOICES, PHOTO_CUT, PHOTO_REVERT, PROMPT_MAX, bot as botSays, checkMessages, chips as chipRow, firstMessages, firstState, smartPlan } from "./assistantScript";
import { makeShareCard, shareTee } from "./shareTee";
import { makeShareLink, shareMessage, whatsappUrl } from "../services/shareService";
import { firstMessagesV2, isUntouchedStart, sheetsFromChat, nextConceptNumber, findConcept, piecesOf, pieceArea, placementHint, shrinkForHint, aiPictureOnTee, ideaSheet, STARTER_CHIP, suggestionsFor } from "./assistantV2";
import { styleIn } from "./styleInfo";
import { costLine, makeSideBySide, photoDataUrl, planSides, printedSides, sideLabel, sideWords, skippedNote, wornCaption } from "./wornPhotos";
import { areasFromWords, photoJobFrom, SAME_THEME } from "./photoIntent";
import { limitLine, makeActFor, noWordsLine, photosFromWords, pictureCost, picturesNeeded, planPhotos } from "./multiPhoto";
import aiService from "../services/aiService";
import { applyAiOps, areaFor, describeDesign } from "./aiOps";
import WaitCard from "./WaitCard";
import PriceTag from "../components/PriceTag";
import { shippingNote, useShippingRule, useSiteOffer } from "../utils/sitePricing";
import { MIN_DPI, SMALL_PHOTO, SOFT_OWN_DPI, checkDesign, inksFor, printSharpness } from "./designCheck";
import { cropMockup } from "./mockupCrop";
import { NECK_LABEL, labelWords } from "./neckLabel";
import { PhotoError, shrinkPhoto } from "./shrinkPhoto";
import { TEMPLATES } from "./designTemplates";
import TeamModeChoice from "./TeamModeChoice";
import SizeFinder from "./SizeFinder.jsx";
import { FONTS, addStudioFonts, fontChoices, hasTamil } from "./fonts";
import { fitNote, matchWord, rankSizes } from "./sizeMatch";
import { keepTyped, playersFromEntries, qtysFromEntries, SUGGEST } from "./assistantExtras";
import "./designRoom.css";

const PX_PER_CM = 24; // texture / editor resolution (print files are made separately at 300 DPI)
const MIN_AREA_PX = 480; // small areas (sleeves, chest) are drawn finer so they stay sharp on the 3D tee
// ...but never longer than this: a thin print in a free place (a 20 × 1.2 cm strip of words) would otherwise need a
// picture too big for a phone's 3D tee. Every print area stays well under it (the longest, Vertical Front: 2,592 px).
const MAX_AREA_PX = 4096;
// a print in a free place (phase 3): its 3D picture at most this long on a phone / a laptop — a tee can have 8 of them.
// Chosen by the device, not the page's width (a phone held sideways is wider than the phone layout, and still a phone).
const SPOT_PX = [1024, 2048];
const SMALL_DEVICE = (() => {
  try {
    return window.matchMedia("(pointer: coarse)").matches || Math.min(window.screen.width, window.screen.height) < 600;
  } catch {
    return false;
  }
})();
// the panel editor's sides, as the customer reads them ("Whole front", "Front · size M")
const PANEL_SIDES = { front: "Front", back: "Back", left: "Left sleeve", right: "Right sleeve" };
const wholeWord = (side) => (side === "left" || side === "right" ? "sleeve" : side);
const INKS = ["#FFFFFF", "#141110", "#C9A24B", "#C2352C", "#2441B5", "#1C5A2B", "#F0C24C", "#B7A2E0", "#F08A24", "#8DC1EC"];
// what can be added to a print area — the tabs in the editor: [key, label, icon path]
const ADD_TABS = [
  ["text", "Text", "M5 6V4h14v2M12 4v16M9 20h6"],
  ["upload", "Upload", "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"],
  ["art", "Art", "M4 5h16v14H4zM8 13l3-3 5 5M15 9h.01"],
  // the pictures made or uploaded before, in any chat (23 Oct 2026)
  ["mine", "My pictures", "M8 4h12v12H8zM4 8v12h12M11 13l2.5-2.5L17 14"],
];
// (drawing and photos happen in the chat — the Assistant — since 20 Oct 2026; there are no Draw / Photo pages)
const ICON_AI = "m12 3 1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3Z";
const ICON_PHOTO = "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z";
const ICON_AREAS = "M8 4 4 6.5 2 10l3 1.5V20h14v-8.5L22 10l-2-3.5L16 4a4 4 0 0 1-8 0Z";
const ICON_ADD = "M12 5v14M5 12h14";
// (the groups Front / Back / Sleeves / Shorts and the order of the areas in them: areaGroups.js)
const ICON_TEXT = "M5 6h14M12 6v13M9 19h6";
const ICON_UPLOAD = "M12 16V5m0 0-4 4m4-4 4 4M5 19h14";
const SIDES = [["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"]];
const DRAFT_KEY = (type) => `${DRAFT_PREFIX}${type}`; // identee:design:v3:<garment>
// What a reload must bring back besides the design itself: that the customer is in the room, the colour and
// size, and the assistant's conversation (with the pictures it offered that are not on the tee yet).
// 13 Nov 2026 (feedback 9): also the step (Review), the open print area and Review's sizes — and the whole chat.
const ROOM_KEY = (type) => `${ROOM_PREFIX}${type}`; // identee:room:v1:<garment>
// the room copy's stamps (13 Nov 2026, chatStore.js): the chat it holds, the stamp of its last save and of the last
// one the account took, a fingerprint of what was sent, and whose room it is — small, so written as often as needed
const STAMP_KEY = (type) => `${ROOM_PREFIX}${type}:at`;
const UNDO_KEY = (type) => `${UNDO_PREFIX}${type}`; // undo / redo after a reload (sessionStorage: this tab only)
const UNDO_KEPT = 20;
const SIZE_KEY = "identee:size";
const ASSIST_WIDE_KEY = "identee:assistWide";
const ASSIST_SMALL_KEY = "identee:assistSmall"; // phones: the assistant made half height ("Show the tee")
const DARK_KEY = "identee:room-dark"; // the customer's light / dark studio choice
const HISTORY_CAP = 50;

// The chat worked from a snapshot of the design (base) and made next; the customer may have edited by hand
// meanwhile (now). Keep their edits: the chat's new items are added, the items it changed take its version
// (unless the customer deleted them), the items it removed go.
const mergeAiChanges = (now, base, next) => {
  const baseById = new Map(base.map((e) => [e.id, e]));
  const nextById = new Map(next.map((e) => [e.id, e]));
  const kept = now
    .filter((e) => !baseById.has(e.id) || nextById.has(e.id))
    .map((e) => {
      const b = baseById.get(e.id);
      const n = nextById.get(e.id);
      return b && n && n !== b ? n : e;
    });
  return [...kept, ...next.filter((e) => !baseById.has(e.id))];
};
const readJSON = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};
// -> true when it was written (13 Nov 2026)
const writeJSON = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    // storage full or blocked — the design just isn't kept after a reload
    return false;
  }
};
// The room copy, kept even when the browser's storage is nearly full (13 Nov 2026): the other garments' room copies
// make way first (their chats are safe in Chats, their designs stay), then a shorter chat, then the room without
// its chat — a reload then takes the chat from the account (`short` / `pointer`). -> "full" | "short" | "none" | ""
const writeRoom = (type, room) => {
  if (writeJSON(ROOM_KEY(type), room)) return "full";
  makeRoom(type);
  if (writeJSON(ROOM_KEY(type), room)) return "full";
  if (writeJSON(ROOM_KEY(type), { ...room, chat: keptChat(room.chat, 40, 0), short: true })) return "short";
  if (writeJSON(ROOM_KEY(type), { ...room, chat: [], pointer: true })) return "none";
  return "";
};
// The tee as a saved chat keeps it: the same fields in the same order wherever it is made (13 Nov 2026), so a chat
// put away unchanged is known to be saved already.
const teeOf = (d) => ({ elements: Array.isArray(d.elements) ? d.elements : [], colour: d.colour, size: d.size, designId: d.designId || null, name: d.name || "", dirty: Boolean(d.dirty), locked: Boolean(d.locked), players: Array.isArray(d.players) ? d.players : [] });
// a saved chat's next stamp: now, but always above the last one (a device with a slow clock still goes up)
const nextStamp = (last) => Math.max(Date.now(), (Number(last) || 0) + 1);
// undo / redo kept for a reload of this tab
const readUndo = (type, chatId) => {
  try {
    const v = JSON.parse(sessionStorage.getItem(UNDO_KEY(type)) || "null");
    return v && v.chatId === chatId && Array.isArray(v.past) && Array.isArray(v.future) ? { past: v.past, future: v.future } : null;
  } catch {
    return null;
  }
};
const keepUndo = (type, chatId, h) => {
  try {
    sessionStorage.setItem(UNDO_KEY(type), JSON.stringify({ chatId, past: h.past.slice(-UNDO_KEPT), future: h.future.slice(0, UNDO_KEPT) }));
  } catch {
    /* blocked or full: undo just starts again after a reload */
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
// "Left Chest, Centre Front and Back 1"
const andList = (labels) => (labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0] || "");

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
  // ?team=<layout> (picked in TeamLayoutPicker: team, team-back, team-office, team-event) or ?team=own (a blank tee);
  // ?team=1 from older links = the Team jersey
  const [teamLink] = useState(() => {
    const t = params.get("team");
    if (!t) return null;
    if (t === "own") return "own";
    return TEMPLATES.some((x) => x.key === t && x.team) ? t : "team";
  });
  // The home page's ways in (read once): ?start=text | upload | art | draw opens that tool on entering the room, and
  // an idea typed in "What do you want on your tee?" (navigation state, not the address) is sent to the assistant.
  const [startLink] = useState(() => params.get("start"));
  // the collection the garment was opened from (?from=girls-wear): Find my size asks only what fits it
  const [fromLink] = useState(() => params.get("from") || "");
  const [ideaLink] = useState(() => (typeof location.state?.idea === "string" ? location.state.idea.trim().slice(0, PROMPT_MAX) : ""));
  const [chatAuto, setChatAuto] = useState(""); // the idea, waiting for the chat to send it
  // was the room opened from another page of the site? (read once: tidying the address below changes location.key)
  const [cameFromSite] = useState(() => location.key !== "default");
  // how the room was opened: by the browser's Back / Forward ("POP") or a link
  const navType = useNavigationType();
  const stored = useMemo(() => readJSON(DRAFT_KEY(type)), [type]);
  // the room copy's stamps (13 Nov 2026) — whose room it is, and where its chat stands with the account
  const stamps = useMemo(() => readJSON(STAMP_KEY(type)), [type]);
  // a room left in this browser by another customer (a shared phone): its tee stays as before, its chat isn't shown.
  // (Signing out clears the room; a login that only ran out keeps it for the same person.)
  const othersRoom = Boolean(stamps?.owner && myId() && stamps.owner !== myId());
  // the room as it was before "Start designing": its chat goes to Chats before the new one starts (below)
  const oldRoom = useMemo(() => (fresh && !othersRoom ? readJSON(ROOM_KEY(type)) : null), [type]); // eslint-disable-line react-hooks/exhaustive-deps
  // what "Start designing" offers back: a tee not saved to My designs (or changed since), or a chat with the Assistant
  const [earlier, setEarlier] = useState(() => (fresh ? unfinishedRoom(stored, oldRoom) : null));
  const draft = fresh ? null : stored;
  const session = useMemo(() => (fresh ? null : readJSON(ROOM_KEY(type))), [type]); // eslint-disable-line react-hooks/exhaustive-deps
  // the room's chat, when it is this customer's (13 Nov 2026)
  const roomChat = othersRoom ? null : session;
  // a reload or coming back: the same spot (Review, the open print area) — not when the address opens another
  // design or chat (13 Nov 2026)
  const resumable = Boolean(session) && !params.get("chat") && (!params.get("design") || params.get("design") === draft?.designId);
  const resumeAt = useRef(resumable && (session.step === "review" || session.active) ? { step: session.step, active: session.active } : null);
  const [step, setStep] = useState(draft?.elements?.length || session?.entered ? "design" : "fit");
  // the colour in the address starts a NEW design; a design in progress keeps its own colour
  const [colourSlug, setColourSlug] = useState((fresh && params.get("color")) || draft?.colour || session?.colour || params.get("color") || null);
  const [size, setSize] = useState(draft?.size || session?.size || readJSON(SIZE_KEY) || "M");
  const [elements, setElements] = useState(() => (Array.isArray(draft?.elements) ? normaliseSpots(draft.elements) : []));
  // the garment's print areas as the server sends them, and the biggest print per size (for the free places)
  const [catalog, setCatalog] = useState([]);
  const [maxPrint, setMaxPrint] = useState(null);
  // Free placement phase 2 (14 Nov 2026, panelModel.js): a print can sit in a free place (a "spot", its box kept on its
  // elements). The room's print positions = the print areas + one position per spot, shaped like a print area, so
  // everything below treats it as one. Worked out again only when a spot's box changes; a design with no spots gets
  // the server's list itself.
  const spotSig = JSON.stringify(spotsIn(elements));
  const spotBoxes = useMemo(() => JSON.parse(spotSig), [spotSig]);
  // Free placement phase 3 (15 Nov 2026, PanelEditor.jsx, panelDrag.js): the panel editor — a whole side of the tee
  // where any print can be dragged anywhere ({ side, cw, ch }: the canvas size is fixed when it opens, so the phone's
  // keyboard can't make it jump; null = the print area editor, as before). "Anywhere": waiting for a tap on the tee
  // ({ side, pic }). pending: the new free place that tap made, waiting for its first thing — a spot box kept here and
  // in the positions (so its editor opens like any print's), not in the design until something is put in it.
  const [panel, setPanel] = useState(null);
  const [anywhere, setAnywhere] = useState(null);
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null);
  const [panelZoomed, setPanelZoomed] = useState(false);
  const [nudged, setNudged] = useState(0); // a nudge (arrow keys, Centre): the panel says the new size and place
  const panelRef = useRef(null);
  const told = useRef({ edge: false, left: false }); // the "Move anywhere" hint and the first "Moved outside" note, once a visit
  // (the pending box is listed only until the design has a print with its key: never twice)
  const positions = useMemo(() => withSpotBoxes(catalog, pending && !spotBoxes.some((b) => b.key === pending.key) ? [...spotBoxes, pending] : spotBoxes, garment, maxPrint), [catalog, spotBoxes, pending, garment, maxPrint]);
  const [active, setActive] = useState(null); // print area key being edited
  const [selectedId, setSelectedId] = useState(null);
  const selectedIdRef = useRef(null); // (for Undo / Redo, which an old message's button may call)
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  // Step 1 (left): where to print. Step 2 (right, in the editor): what to add.
  const [addTab, setAddTab] = useState("text");
  // The design assistant has its own panel (it works on the whole tee, not one print area). It takes
  // the editor's place on the right; picking a print area or "Edit by hand" brings the editor back.
  const [assist, setAssist] = useState(() => Boolean(session?.assist));
  const [aiTab, setAiTab] = useState("chat"); // the AI panel shows the chat (the Draw / Photo pages are gone)
  // the assistant made wide (about half the screen) with its Expand button — remembered on this device
  const [assistWide, setAssistWide] = useState(() => readJSON(ASSIST_WIDE_KEY) === true);
  const toggleAssistWide = () => {
    writeJSON(ASSIST_WIDE_KEY, !assistWide);
    setAssistWide(!assistWide);
  };
  // phones: the assistant fills the screen (room for the chat and its pictures); "Show the tee" makes it half
  // height so the tee shows above it — remembered on this device
  const [assistSmall, setAssistSmall] = useState(() => readJSON(ASSIST_SMALL_KEY) !== false); // (v2, 7 Nov 2026: the tee in view by default)
  const toggleAssistSmall = () => {
    writeJSON(ASSIST_SMALL_KEY, !assistSmall);
    setAssistSmall(!assistSmall);
  };
  // the assistant's conversation (kept while you switch tabs, and across a reload of the page) — the whole of it
  // (13 Nov 2026; keptChat also tidies copies kept before)
  const [chat, setChat] = useState(() => (Array.isArray(roomChat?.chat) && roomChat.chat.length ? keptChat(roomChat.chat) : firstMessages()));
  const [chatState, setChatState] = useState(() => roomChat?.chatState || firstState());
  // Chats (23 Oct 2026, studio/chatStore.js): this conversation's id, the memory note of a long chat, the list open
  const [chatId, setChatId] = useState(() => roomChat?.chatId || makeId());
  const [chatMemory, setChatMemory] = useState(() => (typeof roomChat?.memory === "string" ? roomChat.memory : ""));
  const [chatsOpen, setChatsOpen] = useState(false);
  // Where the open chat stands (13 Nov 2026, chatStore.js): its stamp (`at`, only goes up), the stamp and fingerprint
  // of the last copy the account (or, for a visitor, this browser) took, whose chat it is, and whether only part of
  // it is here (the browser's storage was full: the rest comes from the account before anything is saved)
  const known = Boolean(roomChat?.chatId && stamps?.chatId === roomChat.chatId);
  const chatIdRef = useRef(chatId);
  const chatAt = useRef(known ? Number(stamps.at) || 0 : 0);
  const sentAt = useRef(known ? Number(stamps.sentAt) || 0 : 0);
  const ackHash = useRef(known ? stamps.sentHash || null : null); // the last copy taken
  const sentHash = useRef(known ? stamps.sentHash || null : null); // the last copy sent (maybe not taken yet)
  // the copies sent with no answer yet, [{ at, hash }] (13 Nov 2026): after a reload, one of them found on the account
  // is this device's own copy, not another device's change
  const unacked = useRef(known && Array.isArray(stamps.unacked) ? stamps.unacked.filter((u) => u && Number(u.at) > 0) : []);
  const chatOwner = useRef(othersRoom ? myId() : stamps?.owner || myId());
  const partAtStart = Boolean(roomChat?.chatId && (roomChat.short || roomChat.pointer));
  const partial = useRef(partAtStart);
  // the chat's fingerprint as it came in (a reload with only part of it here, "Continue it"): a change after it is
  // this device's own, kept apart if the account's copy takes its place (wantHash: taken at the next render). Kept
  // with the stamps, so what was added offline still counts after the next reload.
  const keptPartHash = known && partAtStart && typeof stamps.partHash === "string" ? stamps.partHash : null;
  const cameHash = useRef(keptPartHash);
  const wantHash = useRef(partAtStart && !keptPartHash);
  const fromAccount = useRef(false); // (with partial) the account's copy is put in whole, tee too: this one is in Chats already
  const syncing = useRef(false); // the account's copy is being checked: saves wait
  const checking = useRef(false); // (one check at a time)
  const lastPut = useRef(0);
  // (for timers and page events: always this render's saveChatNow / syncRoomChat — set in an effect below)
  const saveNowRef = useRef(null);
  const syncRef = useRef(null);
  // the design in My designs this chat is about: opening another one from My designs starts (or finds) its own chat
  const chatDesign = useRef(draft?.designId || null);
  // "the same tee again": { id, no, colour } of the copy being opened, so its new chat says why it is new (set by
  // orderAgain for the same garment; from the address state when another garment's room opens — a new page)
  const openedAgain = useRef(location.state?.again || null);
  // the AI design maker: whether it is on, how many requests are left today, and where its designs sit on the tee
  const [ai, setAi] = useState({ available: false, reason: "setup", styles: [], photoStyles: [], left: null });
  const photoRef = useRef(null); // the file picker for "photo to art"
  const [aiPlaced, setAiPlaced] = useState(() => session?.aiPlaced || {}); // { [print area key]: { url, elId } }
  const aiCuts = useRef(new Map()); // design url -> { path, w, h } (the server sends each design already cut out)
  useEffect(() => {
    let alive = true;
    aiService
      .status()
      .then((st) => {
        if (!alive) return;
        setAi(st);
        // Assistant v2 (7 Nov 2026): an untouched chat opens with the v2 start (one line, three suggestions) when v2 is on
        if (st?.v2) setChat((c) => (isUntouchedStart(c) && c.some((m) => m.examples) ? firstMessagesV2() : c));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const ackIssues = useRef(""); // design-check findings the customer has already been shown before Review
  const keptSmall = useRef(new Map()); // "Keep this size" on a small-photo note: elId -> the width it was kept at (15 Nov 2026)
  const [areasOpen, setAreasOpen] = useState(false); // phones: the "where to print" sheet
  const [pickOpen, setPickOpen] = useState(false); // colour & size menu in the top bar
  const [finder, setFinder] = useState(null); // "Find my size" open from: "fit" | "pick" | "review"
  const [finderSeen, setFinderSeen] = useState(false); // saw their size in this visit: reopening shows it again
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
  const [labelShot, setLabelShot] = useState(null); // Review: the neck label close-up picture (13 Nov 2026)
  const [sharing, setSharing] = useState(false); // Share my tee: the picture is being made
  const [waLink, setWaLink] = useState(""); // Share my tee: the WhatsApp address, when the browser blocked the new tab
  const [emailing, setEmailing] = useState(false); // Email me this design (round 8): the email is on its way
  // Photo of it worn (round 5) / Try it on me (round 7). Since 17 Nov 2026 one photo per printed side:
  // null | "making" (the first side) | { run, me, at, note, photos: [{ side, label, url?, making?, failed?, from? }] }
  const [worn, setWorn] = useState(null);
  const wornRun = useRef(0); // which set the window shows: closing it leaves the answers still on their way unused
  const tryOnRef = useRef(null); // Try it on me (round 7): the customer's own photo
  const tryOnBackRef = useRef(null); // (17 Nov 2026) and, if they like, a photo of their back
  const [tryOnAsk, setTryOnAsk] = useState(null); // (17 Nov 2026) { photo }: their photo is in — add a photo of the back too?
  const [spin, setSpin] = useState(true);
  const [lit, setLit] = useState(false); // Review: the dressing room has been drawn, so its lights can come up
  const litTimer = useRef(null);
  const [unfoldKey, setUnfoldKey] = useState(0); // Review opens with the tee unfolding in the air (changes each time)
  const [sideShown, setSideShown] = useState(null); // the side picture last tapped in Review
  // Review: { M: 2, L: 1 } — one design, any mix of sizes (kept across a reload, 13 Nov 2026)
  const [qtys, setQtys] = useState(() => (resumable && session.qtys && typeof session.qtys === "object" ? session.qtys : {}));
  // Team order (studio/teamOrder.js): one tee per player, each with their own name and number
  // in place of the texts marked for them. Filled in Review; saved with the design.
  // (13 Nov 2026: the design keeps every row, also one not filled in yet, and whether the switch is on)
  const draftRows = Array.isArray(draft?.rows) ? draft.rows : draft?.players;
  const [players, setPlayers] = useState(() => (Array.isArray(draftRows) ? draftRows.map((p) => ({ id: makeId(), ...p })) : []));
  const [team, setTeam] = useState(() => (typeof draft?.team === "boolean" ? draft.team : Boolean(draft?.players?.length)));
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
  // A slow job the customer may stop (a picture fix, removing a background): startBusy gives it a token;
  // Stop marks the token, clears the overlay and the job then leaves the design alone when it finishes.
  const busyRun = useRef(null);
  const toastTimer = useRef(null);
  // action: { label, onClick } — a button in the message (e.g. Undo); it stays a little longer then
  const say = (msg, action = null) => {
    setToast(action ? { text: msg, action } : msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), action ? 8000 : 4500);
  };
  const startBusy = (info) => {
    const me = { stopped: false };
    busyRun.current = me;
    setBusy({ ...(typeof info === "string" ? { label: info } : info), stoppable: true });
    return me;
  };
  const endBusy = (me) => {
    if (busyRun.current === me) {
      busyRun.current = null;
      setBusy("");
    }
  };
  const stopBusy = () => {
    const me = busyRun.current;
    if (!me) return;
    me.stopped = true;
    busyRun.current = null;
    setBusy("");
    say("Stopped. Nothing was changed.");
  };
  // the chat's AI request in progress (the Assistant reports it), for the leave-page warning below
  const [aiWorking, setAiWorking] = useState(false);
  const aiWorkingRef = useRef(false); // (for the chat saves, which run outside a render)
  useEffect(() => {
    aiWorkingRef.current = aiWorking;
  }, [aiWorking]);
  useEffect(() => {
    if (!busy && !aiWorking && worn !== "making") return;
    // leaving now would lose the result (and a paid picture) — also the photo of it worn (13 Nov 2026)
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, aiWorking, worn]);
  // the same, for the room's own ways out (the back arrow, My designs): the page asks first (13 Nov 2026)
  const sureToLeave = () => !(aiWorking || busy || worn === "making") || window.confirm("Your picture is still being made. Leave anyway? Pictures that finish are kept in My pictures.");
  // the saved design this is (My designs); locked = already ordered → saving makes a copy
  const [designId, setDesignId] = useState(params.get("design") || draft?.designId || null);
  // a copy of a Shop your IDENTEE tee: { id, pictures } — its own pictures add nothing to the price and it ships
  // free (30 Oct 2026); null for any other design
  const [shopTee, setShopTee] = useState(null);
  const shopTeeChecked = useRef(null); // the design id already checked for it
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
      .then((d) => {
        if (!alive) return;
        setCatalog(d.positions || []);
        setMaxPrint(d.maxPrint || null);
      })
      .catch(() => alive && setToast("Couldn't load the print areas. Please reload the page."));
    return () => {
      alive = false;
    };
  }, [type]);

  /* ---------- derived ---------- */
  // (a "Shop your IDENTEE only" colour is not offered here, except the one a copied Studio tee is already in)
  const colours = useMemo(() => (garment?.colors || []).filter((c) => !c.shopOnly || c.slug === colourSlug), [garment, colourSlug]);
  const colour = colours.find((c) => c.slug === colourSlug) || colours[0];
  const sizes = garment?.sizes?.length ? garment.sizes : ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const sizeNow = sizes.includes(size) ? size : sizes.includes("M") ? "M" : sizes[0];
  const chartRow = garment?.sizeChart?.find((r) => r.size === sizeNow);
  const lengthCm = (chartRow?.length || 30) * 2.54;
  // a co-ord set's shorts: their own length for this size (else the shorts model's own length)
  const bottomLengthCm = chartRow?.bottomLength ? chartRow.bottomLength * 2.54 : model?.bottom?.lengthCm;
  const fabricHex = colour?.hex || "#1C1C1D";
  const inkDefault = lum(fabricHex) < 0.55 ? "#FFFFFF" : "#141110";
  // The identee woven neck label sewn inside the back neck of every garment (neckLabel.js): the same tag on every
  // colour, this size on its tab
  const neckLabel = useMemo(() => (NECK_LABEL.on && model ? { ...labelWords(sizeNow), lengthCm } : null), [model, sizeNow, lengthCm]);
  // Price per piece (launch, 16 Oct 2026): the garment's price + a set amount when the design has a picture —
  // AI-made or uploaded (Admin → Settings → AI designs); once per tee. Art library pictures and text only add
  // nothing. The server works it out the same way at checkout (checkoutService.customizationLine).
  const shopTeeNow = shopTee && shopTee.id === designId ? shopTee : null;
  const hasPictureOn = elements.some((e) => e.type === "image" && e.src && !e.artDesignId && !shopTeeNow?.pictures.includes(e.src));
  const aiAddOn = hasPictureOn ? Number(ai.designAddOnInr ?? 100) : 0;
  const unitPrice = (garment?.basePrice || 0) + aiAddOn;
  // the struck-out "was" price, with the same AI amount on top so the saving stays the same
  const wasPrice = garment?.comparePrice > garment?.basePrice ? garment.comparePrice + aiAddOn : 0;
  const siteOffer = useSiteOffer(); // "+ Extra 10% off with code …" (Admin → Offers, shown on the site)
  const shipRule = useShippingRule(); // ₹100 shipping, free from 3 pieces
  const activePos = positions.find((p) => p.key === active) || null;
  // a free place whose last thing was removed is gone, so its editor closes (a print area stays open, empty). Set while
  // drawing, as React suggests for state that follows other state: it runs once, then `active` is null.
  if (active && isSpotKey(active) && catalog.length && !activePos) {
    setActive(null);
    setSelectedId(null);
  }
  // a new free place ("Anywhere", phase 3) nobody put anything in goes as soon as another print is opened (set while
  // drawing too); pendingRef follows it for commit, which runs outside a render
  if (pending && active !== pending.key) setPending(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const roles = hasRoles(elements);
  const teamMode = roles && team;
  const teamPlayers = teamMode ? players.filter(filled) : [];
  const previewPlayer = step === "review" && teamMode ? players.find((p) => p.id === previewId && filled(p)) || null : null;

  const areaPx = useCallback(
    (pos) => {
      const [w, h] = areaCm(pos, sizeNow);
      // (a print in a free place: at most SPOT_PX on its long side — up to 8 of them, each a 3D picture, and iPhones
      // have run out of memory before; print areas keep their size)
      const most = pos.spot ? SPOT_PX[SMALL_DEVICE ? 0 : 1] : MAX_AREA_PX;
      const pxPerCm = Math.min(Math.max(PX_PER_CM, MIN_AREA_PX / Math.min(w, h)), most / Math.max(w, h));
      return { W: Math.round(w * pxPerCm), H: Math.round(h * pxPerCm), wCm: w, hCm: h };
    },
    [sizeNow],
  );
  // the panel editor's side, its prints, the print areas' frames and the snap lines (worked out again only when the
  // design, the side or the size changes: never on a selection, which would cut off a drag that has just started)
  // the sides this tee can show flat (a garment with no 3D tee has none: its editor stays exactly as it was)
  const panelSides = useMemo(() => (model && garment ? SPOT_SIDES.filter((side) => panelView(garment, sizeNow, side, maxPrint)) : []), [model, garment, sizeNow, maxPrint]);
  const panelSide = panel?.side || null;
  const pView = useMemo(() => (panelSide ? panelView(garment, sizeNow, panelSide, maxPrint) : null), [panelSide, garment, sizeNow, maxPrint]);
  const openEmpty = active && !elements.some((e) => e.position === active) ? active : null;
  // (the prints with things only, and the same list as long as nothing about them changed: picking a thing on another
  // print drops an empty one, and drawing the prints again then would cut off the drag that thing just started)
  const pPrintsNow = useMemo(() => {
    if (!pView) return [];
    return positions
      .filter((p) => p.side === panelSide && elements.some((e) => e.position === p.key))
      .map((p) => ({ key: p.key, label: p.label, box: panelBox(p, sizeNow, garment), ...areaPx(p), spot: !!p.spot, grows: p.spot?.scale === "G", elements: elements.filter((e) => e.position === p.key) }));
  }, [pView, positions, panelSide, elements, sizeNow, garment, areaPx]);
  const pPrintsSig = useMemo(() => JSON.stringify(pPrintsNow.map(({ elements: _e, ...p }) => p)), [pPrintsNow]); // eslint-disable-line no-unused-vars
  const pPrints = useMemo(() => pPrintsNow, [pPrintsSig, elements]); // eslint-disable-line react-hooks/exhaustive-deps
  // the open print when nothing is in it yet: its dashed box and name on the panel
  const pOpenBox = useMemo(() => {
    const p = pView && openEmpty ? positions.find((x) => x.key === openEmpty && x.side === panelSide) : null;
    return p ? { key: p.key, label: p.label, box: panelBox(p, sizeNow, garment) } : null;
  }, [pView, openEmpty, positions, panelSide, sizeNow, garment]);
  const pFrames = useMemo(() => (pView ? catalog.filter((p) => p.side === panelSide).map((p) => ({ key: p.key, box: panelBox(p, sizeNow, garment) })).filter((f) => f.box.w > 0) : []), [pView, catalog, panelSide, sizeNow, garment]);
  const pLines = useMemo(() => (pView ? snapLines(catalog, panelSide, sizeNow, garment, pView.w) : null), [pView, catalog, panelSide, sizeNow, garment]);

  /* ---------- autosave ---------- */
  // Never replace a stored design with an empty one, unless this visit had
  // elements and the customer removed them all.
  const hadElements = useRef(elements.length > 0);
  // the browser's storage is full: said once a visit (13 Nov 2026)
  const toldFull = useRef(false);
  const tellFull = () => {
    if (toldFull.current) return;
    toldFull.current = true;
    say("This browser’s storage is full, so your latest changes may not come back after a reload. Save your design to keep it.");
  };
  useEffect(() => {
    if (!type) return;
    if (elements.length) hadElements.current = true;
    else if (!hadElements.current) return;
    // (13 Nov 2026: also the team order's switch and every row, filled in or not — `players` stays the filled ones)
    const d = { elements, colour: colour?.slug, size: sizeNow, designId, name: designName, dirty: unsaved.current, locked, players: players.filter(filled).map(({ name, number, size: sz }) => ({ name, number, size: sz })), team, rows: players.map(({ name, number, size: sz }) => ({ name, number, size: sz })) };
    if (writeJSON(DRAFT_KEY(type), d)) return;
    makeRoom(type);
    if (!writeJSON(DRAFT_KEY(type), d)) tellFull();
  }, [type, elements, colour?.slug, sizeNow, designId, designName, players, team, locked, savedAt]); // eslint-disable-line react-hooks/exhaustive-deps -- (savedAt: Save turns `dirty` off)

  // The room itself, so a reload comes back to where the customer was — also with an empty tee — and the
  // assistant still remembers the conversation. Not written before they step in, so looking at the first
  // screen never disturbs what was kept from an earlier visit.
  // 13 Nov 2026 (feedback 9): the whole chat, the step and open print area, Review's sizes; its stamps beside it.
  const entered = useRef(step !== "fit");
  const writeStamps = () => {
    if (entered.current) writeJSON(STAMP_KEY(type), { chatId: chatIdRef.current, at: chatAt.current, sentAt: sentAt.current, sentHash: ackHash.current, unacked: unacked.current, partHash: partial.current ? cameHash.current : null, owner: chatOwner.current || myId() });
  };
  useEffect(() => {
    if (!type) return;
    if (step !== "fit") entered.current = true;
    if (!entered.current) return;
    // (only part of the chat here, until the account's whole copy comes in: marked, so it never replaces it)
    const room = { entered: step !== "fit", step, active, qtys, colour: colour?.slug, size: sizeNow, assist, chat: keptChat(chat), chatState, aiPlaced, chatId, memory: chatMemory, ...(partial.current ? { short: true } : {}) };
    const kept = writeRoom(type, room);
    writeStamps();
    // (a shorter copy is fine when logged in: a reload takes the chat from the account)
    if (!kept || (kept !== "full" && !isLoggedIn())) tellFull();
  }, [type, step, active, qtys, colour?.slug, sizeNow, assist, chat, chatState, aiPlaced, chatId, chatMemory]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- history (undo / redo) ---------- */
  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  // what commit needs to re-box a print in a free place (panelModel.js reboxChanged)
  const spotCtx = useRef({ garment: null, catalog: [], maxPrint: null });
  useEffect(() => {
    spotCtx.current = { garment, catalog, maxPrint };
  }, [garment, catalog, maxPrint]);
  // (13 Nov 2026: a reload of this tab brings back undo and redo — the same tee and chat only)
  const [undoAtStart] = useState(() => (resumable && !othersRoom && readUndo(type, chatId)) || { past: [], future: [] });
  const hist = useRef(undoAtStart);
  const [histSize, setHistSize] = useState({ past: undoAtStart.past.length, future: undoAtStart.future.length });
  const bumpHistory = () => setHistSize({ past: hist.current.past.length, future: hist.current.future.length });
  // soft: a key for a change that repeats quickly (a slider drag, typing) — the same key again within
  // 1.5 s joins the previous step, so one Undo takes the whole drag back instead of one notch
  const softRef = useRef({ key: null, at: 0 });
  const commit = useCallback((next, { soft = null } = {}) => {
    const prev = elementsRef.current;
    // (every thing in a free place carries its spot's box: a new picture or words there take it; a thing made bigger,
    // copied or added past the box's edge grows the box round it, so nothing is cut off — panelModel.js)
    let made = normaliseSpots(typeof next === "function" ? next(prev) : next, prev);
    // the first thing put in a new free place ("Anywhere", phase 3) takes its box, boxed round it from then on (also
    // when it comes with the box already: the Assistant's words carry their place's box)
    const wait = pendingRef.current;
    if (wait && made.some((e) => e.position === wait.key)) {
      made = reboxSpot(made.map((e) => (e.position === wait.key && !e.spot ? { ...e, spot: wait } : e)), wait, spotCtx.current).elements;
      pendingRef.current = null;
      setPending(null);
    }
    const value = reboxChanged(made, prev, spotCtx.current);
    const joins = soft && softRef.current.key === soft && Date.now() - softRef.current.at < 1500;
    softRef.current = { key: soft, at: Date.now() };
    hist.current = { past: joins ? hist.current.past : [...hist.current.past, prev].slice(-HISTORY_CAP), future: [] };
    unsaved.current = true;
    if (value.length > prev.length) setPopKey((k) => k + 1);
    setElements(value);
    bumpHistory();
  }, []);
  // (the panel editor: the open print follows the selected thing back — an Undo of a join puts it in its own print
  // again, and the panel's header and name tab must say that print)
  const followSelected = (els) => {
    const on = els.find((e) => e.id === selectedIdRef.current);
    if (on && panelRef.current) setActive(on.position);
  };
  const undo = () => {
    const { past, future } = hist.current;
    if (!past.length) return;
    hist.current = { past: past.slice(0, -1), future: [elementsRef.current, ...future] };
    setElements(past[past.length - 1]);
    followSelected(past[past.length - 1]);
    bumpHistory();
  };
  const redo = () => {
    const { past, future } = hist.current;
    if (!future.length) return;
    hist.current = { past: [...past, elementsRef.current], future: future.slice(1) };
    setElements(future[0]);
    followSelected(future[0]);
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
      // a free place whose last thing was removed has no position any more: its drawing and picture go too (the
      // mockup pictures redraw every drawing that is kept)
      const keys = new Set(positions.map((p) => p.key));
      const gone = [...renderers.current.keys()].filter((key) => !keys.has(key));
      for (const key of gone) {
        renderers.current.get(key).r.destroy();
        renderers.current.delete(key);
        lastSig.current.delete(key);
        paintedEls.current.delete(key);
      }
      if (alive && (Object.keys(updates).length || gone.length)) {
        setTextures((t) => {
          const next = { ...t, ...updates };
          for (const key of gone) delete next[key];
          return next;
        });
      }
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
  /* ---------- Chats: this conversation and its tee, saved as the customer goes (studio/chatStore.js) ---------- */
  // (13 Nov 2026: the whole chat — slimForSaving keeps a long one under the server's limit — and whose it is)
  const chatRecord = () => {
    const body = slimForSaving({ chat, chatState, aiPlaced, memory: chatMemory, design: teeOf({ elements, colour: colour?.slug, size: sizeNow, designId, name: designName, dirty: unsaved.current, locked, players: players.filter(filled).map(({ name, number, size: sz }) => ({ name, number, size: sz })) }) });
    return { id: chatId, type, title: chatTitle(body.chat, designName || `${garment?.label || "My"} design`), colour: colour?.slug || "", designId, owner: chatOwner.current || myId(), updatedAt: Date.now(), body };
  };
  const recordNow = useRef(chatRecord);
  // a chat just put in the room that is saved already (opened from Chats, brought in from the account): as it is
  // now, it counts as sent — opening a chat is no change, so no save and its place in Chats stays (13 Nov 2026)
  const adopt = useRef(false);
  useEffect(() => {
    recordNow.current = chatRecord;
    if (!adopt.current) return;
    adopt.current = false;
    const rec = chatRecord();
    if (rec.id !== chatIdRef.current) return;
    ackHash.current = sentHash.current = hashText(JSON.stringify(rec.body));
    writeStamps();
  });
  const saveTimer = useRef(0);
  const stale = useRef(false); // the account had a newer copy while the Assistant was busy: dealt with after it
  const toldLong = useRef(false);
  const mounted = useRef(true);
  // Save the open chat now (13 Nov 2026). Nothing before the customer has stepped into the room, nothing while the
  // account's copy is being checked, never when only part of the chat is here, and nothing when it hasn't changed
  // since the last copy sent. leaving: the page is closing (sent so it arrives after the page has gone).
  // asKept: put away without being checked against the account first (a reload that opens another chat): it keeps
  // its own stamp (one above the last it used, not now), so a newer copy on the account is never written over.
  const saveChatNow = async ({ leaving = false, asKept = false } = {}) => {
    clearTimeout(saveTimer.current);
    if (!entered.current || partial.current || (syncing.current && !asKept)) return null;
    const rec = recordNow.current();
    if (rec.id !== chatIdRef.current) return null; // (a record from just before another chat was put in)
    const sig = hashText(JSON.stringify(rec.body));
    // (the page closing sends it again unless the account has surely taken it: a save still on its way may be cut off)
    if (sig === (leaving ? ackHash.current : sentHash.current)) return null;
    if (stale.current && !asKept) {
      if (leaving || aiWorkingRef.current) return null;
      return keepBoth(rec);
    }
    // (put away: one above any stamp this device used — the copy sent with that stamp may differ from this one, and
    // the account would answer "saved already" without taking it; 13 Nov 2026)
    const at = asKept ? Math.max(chatAt.current, sentAt.current) + 1 : nextStamp(chatAt.current);
    chatAt.current = at;
    sentHash.current = sig;
    unacked.current = [...unacked.current.filter((u) => u.at !== at), { at, hash: sig }].slice(-6);
    if (isLoggedIn() && !asKept) lastPut.current = at;
    writeStamps();
    const r = (await saveChat({ ...rec, at }, { leaving }).catch(() => null)) || { failed: true };
    if (chatIdRef.current !== rec.id) return r;
    if (r.saved || r.local) {
      if (at >= sentAt.current) {
        sentAt.current = at;
        ackHash.current = sig;
        unacked.current = unacked.current.filter((u) => u.at > at);
        writeStamps();
      }
    } else if (r.stale) {
      // a newer copy is on the account (another device changed it): both are kept and the newer one is shown — or,
      // for a chat being put away, this one is kept apart if it had changes of its own
      sentHash.current = null;
      if (asKept) {
        if (ackHash.current && ackHash.current !== sig) keepBoth(rec, { show: false });
      } else if (aiWorkingRef.current) stale.current = true;
      else keepBoth(rec);
    } else if (r.tooLong) {
      if (!toldLong.current) {
        toldLong.current = true;
        say("This chat is very long. Start a New chat to keep saving it to your account.");
      }
    } else if (!r.left && sentHash.current === sig) sentHash.current = null; // not saved: tried again at the next change
    return r;
  };
  // Two devices changed this chat (13 Nov 2026): this device's version is saved as a chat of its own ("… (this
  // device)") and the account's newer one is shown (show) — nothing is lost.
  const keepApart = (rec) => saveChat({ ...rec, id: makeId(), title: `${rec.title} (this device)`, at: nextStamp(0) }).catch(() => null);
  const keepBoth = async (rec, { show = true, acc = null } = {}) => {
    stale.current = false;
    await keepApart(rec);
    if (!show) return null;
    const got = acc ? { rec: acc } : await accountChat(rec.id);
    if (!got.rec || !mounted.current || chatIdRef.current !== rec.id) return null;
    applyChat(got.rec, { quiet: true });
    say("This chat was also changed on another device. Your version is saved in Chats as “(this device)”.");
    return null;
  };
  // a couple of seconds after each change (typing, dragging and the chat come in bursts); to the account at most
  // every 10 s (13 Nov 2026) — the room copy on this device is written at once anyway
  useEffect(() => {
    if (!type || !entered.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNowRef.current(), isLoggedIn() ? Math.min(10_000, Math.max(2000, lastPut.current + 10_000 - Date.now())) : 2000);
  }, [type, step, chatId, chat, chatState, aiPlaced, chatMemory, elements, colour?.slug, sizeNow, designId, designName, players, locked]);
  useEffect(() => {
    mounted.current = true;
    const keepUndoNow = () => keepUndo(type, chatIdRef.current, hist.current);
    // the tab hidden (phones: another app): a normal save, which usually finishes even on a phone (13 Nov 2026)
    const hidden = () => {
      if (document.visibilityState !== "hidden") return;
      keepUndoNow();
      saveNowRef.current();
    };
    // the page closing
    const gone = () => {
      keepUndoNow();
      saveNowRef.current({ leaving: true });
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", gone);
    moveLocalChats(); // chats made before logging in go to the account
    return () => {
      // leaving the room for another page of the site
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", gone);
      keepUndoNow();
      saveNowRef.current();
      mounted.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Start designing" (?new=1) begins a new chat: the one this device had open goes to Chats first.
  // 13 Nov 2026: with its own stamp (the account answers "saved already", or refuses it when its copy is newer), not
  // at all when it is saved as it is, and never a room left by someone else or only part of a chat.
  const archivedId = useRef(oldRoom?.chatId || makeId());
  // where the earlier chat stands (13 Nov 2026): { at, taken: true } in Chats as it is · { at, hash, taken: false } sent,
  // not known to be taken · { apart: true } the account had a newer copy, so this one is in Chats as "(this device)"
  const archived = useRef(null);
  const archiving = useRef(null); // that save, while it is on its way ("Continue it" waits for it)
  useEffect(() => {
    if (!fresh || !oldRoom || !Array.isArray(oldRoom.chat) || oldRoom.short || oldRoom.pointer) return;
    if (stamps?.owner && stamps.owner !== myId()) return;
    const d = stored || {};
    const body = slimForSaving({ chat: keptChat(oldRoom.chat), chatState: oldRoom.chatState || null, aiPlaced: oldRoom.aiPlaced || {}, memory: typeof oldRoom.memory === "string" ? oldRoom.memory : "", design: teeOf({ ...d, colour: d.colour || oldRoom.colour, size: d.size || oldRoom.size }) });
    const was = stamps?.chatId === oldRoom.chatId ? stamps : {};
    const sig = hashText(JSON.stringify(body));
    if (sig === was.sentHash) {
      archived.current = { at: Number(was.sentAt) || 0, taken: true };
      return;
    }
    // (one above any stamp used: the copy sent with that stamp may differ from this one)
    const at = Math.max(Number(was.at) || 0, Number(was.sentAt) || 0) + 1;
    const rec = { id: archivedId.current, type, title: chatTitle(body.chat, d.name || "My design"), colour: body.design.colour || "", designId: body.design.designId, owner: was.owner || myId(), updatedAt: Date.now(), at, body };
    archived.current = { at, hash: sig, taken: false, known: Boolean(was.chatId) };
    archiving.current = saveChat(rec)
      .then((r) => {
        if (r?.saved || r?.local) archived.current = { at, taken: true };
        else if (r?.stale) {
          // another device changed it since: this device's version is kept as a chat of its own (nothing is lost)
          archived.current = { apart: true };
          return keepApart(rec);
        }
        return null;
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Put a chat in the room: the conversation only (a design opened from My designs keeps its own tee) …
  // 13 Nov 2026: with the chat's stamp and owner. A saved chat (adopt) counts as sent as it is, so opening it is no
  // change. rec null = a new chat.
  const applyConversation = (rec, { adopt: saved = Boolean(rec?.body) } = {}) => {
    const b = rec?.body || {};
    const id = rec?.id || makeId();
    chatIdRef.current = id;
    chatAt.current = sentAt.current = Number(rec?.at) || 0;
    ackHash.current = sentHash.current = null;
    unacked.current = [];
    chatOwner.current = rec?.owner || myId();
    partial.current = fromAccount.current = false;
    stale.current = false;
    adopt.current = saved;
    setChatId(id);
    setChat(Array.isArray(b.chat) && b.chat.length ? keptChat(b.chat) : ai?.v2 ? firstMessagesV2() : firstMessages());
    setChatState(b.chatState || firstState());
    setAiPlaced(b.aiPlaced && typeof b.aiPlaced === "object" ? b.aiPlaced : {});
    setChatMemory(typeof b.memory === "string" ? b.memory : "");
  };
  // … or the conversation and its tee (Chats, New chat). quiet: brought in from the account without moving the
  // customer (no jump to Design, the Assistant left as it is)
  const applyChat = (rec, { quiet = false } = {}) => {
    const d = rec?.body?.design || {};
    applyConversation(rec);
    hadElements.current = true; // (an empty tee is written over the one before)
    hist.current = { past: [], future: [] };
    bumpHistory();
    setElements(Array.isArray(d.elements) ? normaliseSpots(d.elements) : []);
    if (d.colour) setColourSlug(d.colour);
    if (d.size) setSize(d.size);
    unsaved.current = Boolean(d.dirty);
    chatDesign.current = d.designId || null;
    setDesignId(d.designId || null);
    setDesignName(d.name || "");
    setLocked(Boolean(d.locked));
    setPlayers((Array.isArray(d.players) ? d.players : []).map((p) => ({ id: makeId(), ...p })));
    setTeam(Boolean(d.players?.length));
    setSelectedId(null);
    if (quiet) return;
    setActive(null);
    setStep("design");
    setAssist(true);
    setCamRequest({ view: "front", ms: 1400, n: nextReq() });
    // (a plain address: ?design=<id> would load the saved design over this one; a reload keeps it from this device)
    navigate(`/customize/${type}`, { replace: true });
  };
  const newChat = async () => {
    setChatsOpen(false);
    await saveChatNow({ asKept: syncing.current });
    applyChat({ id: makeId(), body: { design: { colour: colour?.slug, size: sizeNow } } });
    say("New chat started. Your earlier chat is saved in Chats.");
  };
  const openChat = async (c) => {
    await saveChatNow({ asKept: syncing.current });
    // another garment's chat opens in that garment's room
    if (c.type && c.type !== type) return window.location.assign(`/customize/${c.type}?chat=${c.id}`);
    setChatsOpen(false);
    const rec = await loadChat(c.id);
    if (!rec) return say("Couldn’t open that chat. Check your connection and try again.");
    applyChat(rec);
  };
  // /customize/<garment>?chat=<id>: a chat opened from another garment's room
  const [chatLink] = useState(() => params.get("chat"));
  useEffect(() => {
    if (!chatLink) return undefined;
    let alive = true;
    syncing.current = true; // (this room's own chat waits: the account may have a newer copy of it)
    loadChat(chatLink).then(async (rec) => {
      if (!alive) return;
      if (!rec) {
        navigate(location.pathname, { replace: true });
        say("Couldn’t open that chat. It may have been deleted.");
        syncRef.current(); // this room's own chat stays: checked against the account as on a reload
        return;
      }
      await saveChatNow({ asKept: true }); // the chat this device had open here, put away with its own stamp
      syncing.current = false;
      applyChat(rec);
    });
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After a reload (13 Nov 2026) the open chat may have been changed on another device meanwhile, so the account's
  // copy is looked at before anything is saved:
  //   not changed there → carry on (what changed here goes with the next save)
  //   changed there, not here → its newer messages come in
  //   changed in both places → this device's version is kept as a chat of its own, the account's is shown
  //   deleted there → a new chat starts; the tee stays
  //   gone from the account by itself (not changed for 90 days, or past the newest 20) → this device's copy is saved again
  // Offline: the room's copy is worked from (a part of a chat is looked for again — never saved over the whole one).
  // 13 Nov 2026: also for "Continue it" (continued: the chat put in Chats as the page opened), and saves wait until the
  // check is settled, not only while the account is asked.
  const syncTries = useRef(0);
  const syncRoomChat = async (id = roomChat?.chatId, { continued = false } = {}) => {
    if (!id || chatIdRef.current !== id) {
      syncing.current = false;
      return null;
    }
    if (!isLoggedIn()) {
      // a visitor's room that held only part of its chat: the whole chat is in this browser's Chats
      if (partial.current) {
        const rec = await loadChat(id).catch(() => null);
        if (rec && chatIdRef.current === id) applyConversation(rec, { adopt: false });
        partial.current = false;
      }
      syncing.current = false;
      return null;
    }
    if (checking.current) return null;
    checking.current = true;
    syncing.current = true;
    try {
      // (Continue: the earlier chat's trip to Chats, started as the page opened, ends first)
      const r = await Promise.race([Promise.resolve(continued ? archiving.current : null).then(() => moveLocalChats()).then(() => accountChat(id)), wait(8000).then(() => ({ failed: true }))]);
      const done = (out = null) => {
        syncing.current = false;
        return out;
      };
      const saveAfter = () => done(saveNowRef.current()); // (the save waiting for the check, if anything changed)
      if (!mounted.current) return done();
      if (chatIdRef.current !== id) return saveAfter();
      if (r.failed) {
        if (partial.current && syncTries.current++ < 4) setTimeout(() => syncRef.current(id), 15_000);
        return saveAfter();
      }
      if (r.gone) {
        const kept = fromAccount.current; // (this version is in Chats as "(this device)" already)
        partial.current = fromAccount.current = false;
        if (sentAt.current > 0 || kept) {
          applyConversation(null);
          say("This chat was deleted on another device. Your tee is still here.");
        }
        return saveAfter();
      }
      if (r.missing) {
        // not on the account: it went by itself (too old, or past the newest 20) or never got there. This device's
        // copy is all there is, so it is saved again, with a new stamp
        partial.current = fromAccount.current = false;
        sentAt.current = 0;
        ackHash.current = sentHash.current = null;
        unacked.current = [];
        writeStamps();
        return saveAfter();
      }
      const acc = r.rec;
      const accAt = acc.at || 0;
      const here = recordNow.current();
      const hereHash = hashText(JSON.stringify(here.body));
      // (Continue: the trip to Chats ended after the tap, refused — this version is in Chats already: as below)
      if (continued && archived.current?.apart) partial.current = fromAccount.current = true;
      if (partial.current) {
        // only part of the chat was kept here (the storage was full): the whole one comes in, and the tee here stays.
        // This device's version is kept apart too when it changed since (messages added meanwhile), or when a save
        // of this device's may not have arrived.
        const changed = Boolean(cameHash.current) && hereHash !== cameHash.current;
        const notArrived = !fromAccount.current && chatAt.current > sentAt.current && accAt !== chatAt.current;
        if (changed || notArrived) await keepBoth(here, { show: false });
        if (chatIdRef.current !== id) return saveAfter();
        if (fromAccount.current) {
          applyChat(acc, { quiet: true });
          say("This chat was also changed on another device. Your version is saved in Chats as “(this device)”.");
        } else {
          applyConversation(acc, { adopt: false });
          if (changed) say("Your whole chat came back from your account. What you added meanwhile is saved in Chats as “(this device)”.");
        }
        return done();
      }
      const isKnown = continued ? Boolean(archived.current?.taken || archived.current?.known) : known;
      if (!isKnown || accAt <= sentAt.current) return saveAfter(); // nothing new there (or a room kept before stamps)
      const mine = unacked.current.find((u) => u.at === accAt);
      if (mine || accAt === chatAt.current) {
        // a copy this device sent did arrive (the page closed before the answer came): it counts as taken, and what
        // changed since goes with the save after this — never "changed on another device"
        sentAt.current = accAt;
        ackHash.current = sentHash.current = mine?.hash || hereHash;
        unacked.current = unacked.current.filter((u) => u.at > accAt);
        writeStamps();
        return saveAfter();
      }
      if (hereHash === ackHash.current) {
        applyChat(acc, { quiet: true });
        say("Brought in the newer messages from your other device.");
        return done();
      }
      return done(await keepBoth(here, { acc }));
    } finally {
      checking.current = false;
    }
  };
  // a chat only partly here: looked for again when the connection comes back or the page is shown again (13 Nov 2026)
  useEffect(() => {
    const again = () => {
      if (partial.current && !checking.current && document.visibilityState !== "hidden") syncRef.current(chatIdRef.current);
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);
  useEffect(() => {
    if (!wantHash.current) return;
    wantHash.current = false;
    cameHash.current = hashText(JSON.stringify(chatRecord().body));
  });
  useEffect(() => {
    saveNowRef.current = saveChatNow;
    syncRef.current = syncRoomChat;
  });
  useEffect(() => {
    if (!fresh && !chatLink && roomChat?.chatId) syncRef.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // a short line for a chat in the list: the garment and the tee colour
  const chatAbout = (c) => {
    const g = garments.find((x) => x.key === c.type);
    const col = g?.colors?.find((x) => x.slug === c.colour);
    return { text: [g?.label, col?.name].filter(Boolean).join(" · "), hex: col?.hex };
  };

  // Drop ?new=1 and ?color= from the address so a reload keeps the design in progress. (The colour in
  // the address is only where a new design starts; left there, a reload brought it back over the colour
  // the customer had picked since.)
  useEffect(() => {
    if (!fresh && !params.get("color") && !params.get("team") && !params.get("start")) return;
    const next = new URLSearchParams(params);
    next.delete("new");
    next.delete("color");
    next.delete("team");
    next.delete("start");
    // (a fresh visit has no Back step yet: the home page's idea is dropped from the address state as before)
    navigate(`${location.pathname}${next.toString() ? `?${next}` : ""}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Continue it" (13 Nov 2026): everything a reload brings back — the tee with its sizes and team rows, the whole
  // chat, the words typed, Review or the open print area
  const continueEarlier = () => {
    if (!earlier) return;
    const room = oldRoom || {};
    hadElements.current = true;
    setElements(normaliseSpots(earlier.elements));
    if (earlier.colour || room.colour) setColourSlug(earlier.colour || room.colour);
    if (earlier.size || room.size) setSize(earlier.size || room.size);
    setDesignId(earlier.designId || null);
    setDesignName(earlier.name || "");
    unsaved.current = Boolean(earlier.dirty);
    setLocked(Boolean(earlier.locked));
    const rows = Array.isArray(earlier.rows) ? earlier.rows : earlier.players || [];
    setPlayers(rows.map((p) => ({ id: makeId(), ...p })));
    setTeam(typeof earlier.team === "boolean" ? earlier.team : Boolean(earlier.players?.length));
    setQtys(room.qtys && typeof room.qtys === "object" ? room.qtys : {});
    // and its conversation (put in Chats when the page opened, under the same id)
    if (oldRoom) {
      const id = archivedId.current;
      const st = archived.current || {};
      const was = stamps?.chatId === oldRoom.chatId ? stamps : null;
      applyConversation({ id, body: oldRoom, at: st.at || 0, owner: was?.owner }, { adopt: Boolean(st.taken) });
      if (st.at && !st.taken) {
        // still on its way to Chats (or not taken): where it stands with the account, as a reload would have it
        sentAt.current = Number(was?.sentAt) || 0;
        ackHash.current = sentHash.current = was?.sentHash || null;
        unacked.current = [...(Array.isArray(was?.unacked) ? was.unacked.filter((u) => u && Number(u.at) > 0) : []), { at: st.at, hash: st.hash }];
      }
      if (ideaLink) keepTyped(type, id, ideaLink); // the home page's new idea waits in the box, not sent
      // 13 Nov 2026: checked against the account before anything is saved, as on a reload (another device may have
      // changed it). Only part of it kept here: the whole one comes in. The account had a newer copy: that one is
      // shown (this one is in Chats as "(this device)" already) — nothing is ever saved over it.
      partial.current = Boolean(oldRoom.short || oldRoom.pointer || st.apart);
      fromAccount.current = Boolean(st.apart);
      cameHash.current = null;
      wantHash.current = true;
      syncRef.current(id, { continued: true });
    }
    setAssist(Boolean(room.assist) || !earlier.elements.length || Boolean(ideaLink)); // (a chat-only room opens on the chat)
    chatDesign.current = earlier.designId || null;
    setEarlier(null);
    setStep("design");
    setCamRequest({ view: "front", ms: 1600, n: nextReq() });
    resumeAt.current = room.step === "review" || room.active ? { step: room.step, active: room.active } : null;
  };

  /* ---------- a saved design shown from this browser's draft: is it a Shop your IDENTEE tee? ---------- */
  useEffect(() => {
    // (a design opened by its address is checked when it loads, below)
    if (!designId || !isLoggedIn() || shopTeeChecked.current === designId || params.get("design") === designId) return undefined;
    shopTeeChecked.current = designId;
    let alive = true;
    customizationService
      .getCustomizationById(designId)
      .then((d) => alive && d.fromReady && setShopTee({ id: d._id, pictures: d.readyPictures || [] }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [designId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- open a saved design: /customize/<garment>?design=<id> ---------- */
  const openId = params.get("design");
  const onScreenId = useRef(keepLocal ? draft.designId : null); // id of the saved design currently shown (set on load and on save)
  const opening = useRef(null); // a design being opened by its address (the Back steps wait for it)
  const firstOpen = useRef(true);
  useEffect(() => {
    // A Back step inside the room can land on an older address (13 Nov 2026): another ?design= — from before Save
    // made a copy, a chat was opened or New chat started. Only a new address opens a design: the tee on screen
    // stays, and the address is put right so a reload opens this tee, not the older one. (state: that step's own
    // mark — in the middle of a Back press the room's count isn't up to date yet)
    const byBack = !firstOpen.current && navType === "POP";
    firstOpen.current = false;
    if (byBack) {
      if (openId && openId !== designId) {
        onScreenId.current = designId;
        navigate(designId ? `${location.pathname}?design=${designId}` : location.pathname, { replace: true, state: location.state });
      }
      return;
    }
    // after Save the address gets ?design=<id> of the design already on screen —
    // nothing to load (re-loading would jump back from Review to Design)
    if (!openId || !isLoggedIn() || openId === onScreenId.current) return;
    let alive = true;
    const me = {};
    opening.current = me;
    const opened = () => {
      if (opening.current === me) opening.current = null;
    };
    customizationService
      .getCustomizationById(openId)
      .then((d) => {
        opened();
        if (!alive) return;
        // (another garment's room is a new page: it starts its own Back steps)
        if (d.garmentType !== type) return navigate(`/customize/${d.garmentType}?design=${d._id}`, { replace: true });
        // another design than the one this chat is about: the chat goes to Chats, and the design gets its own —
        // the one it had before if there is one, else a new chat
        const other = d._id !== chatDesign.current;
        if (other) {
          saveChatNow({ asKept: syncing.current }); // (not checked against the account yet: put away with its own stamp)
          applyConversation(null);
          // an ordered tee opened again: its new chat starts by saying what this tee is and where the chat before went
          const again = openedAgain.current?.id === d._id ? openedAgain.current : null;
          openedAgain.current = null;
          if (again)
            setChat([
              botSays(`This is your tee from order ${again.no || ""}, opened as a new design${again.colour ? ` in ${again.colour}` : ""}. A new design gets its own chat, so this one starts fresh. The chat we just had is kept under “Your chats” (the button at the top). Tell me what to change, or pick the sizes and go to Review.`.replace("  ", " ")),
              chipRow(["Continue to review"]),
            ]);
          listChats().then(({ chats }) => {
            const was = chats.find((c) => c.designId === d._id && c.type === type);
            if (was) loadChat(was.id).then((rec) => alive && rec && chatDesign.current === d._id && applyConversation(rec));
          });
        }
        chatDesign.current = d._id;
        shopTeeChecked.current = d._id;
        setShopTee(d.fromReady ? { id: d._id, pictures: d.readyPictures || [] } : null);
        setElements(normaliseSpots(d.elements.map((e) => ({ ...e, id: e._id || e.id || makeId() }))));
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
      .catch(() => {
        opened();
        if (alive) setToast("Couldn't open that design. It may have been deleted.");
      });
    return () => {
      alive = false;
    };
  }, [openId, type]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // (the panel editor open: it turns to the print's side)
    if (panel && pos.side !== panel.side && panelSides.includes(pos.side)) setPanel((cur) => cur && { ...cur, side: pos.side });
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
    // (before the print areas come, a design's prints in free places are its only positions: wait for them)
    if (!catalog.length) return null;
    const free = (p) => usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length;
    const main = positions.find((p) => p.side === "front" && p.main && free(p)) || positions.find((p) => p.side === "front" && free(p)) || positions.find(free) || positions[0];
    if (main) openArea(main.key);
    return main;
  };
  const goView = (view) => {
    closeArea();
    setCamRequest({ view, n: nextReq() });
  };
  // the neck label close up (13 Nov 2026): the camera looks down into the neck, like the sample the owner picked
  const goLabel = () => {
    closeArea();
    setCamRequest({ label: true, ms: 1100, n: nextReq() });
  };
  // the Assistant header's flip (phones): the side the tee will turn to next
  const [flipSide, setFlipSide] = useState("front");
  const flipTee = () => {
    const to = flipSide === "front" ? "back" : "front";
    setFlipSide(to);
    goView(to);
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

  /* ---------- free placement phase 3: the panel editor (a whole side, drag anywhere) and "Anywhere on the tee" ---------- */
  const dropCtx = () => ({ catalog, garment, size: sizeNow, maxPrint });
  // a new free place nobody put anything in is dropped as soon as another print is opened (pendingRef follows pending
  // for commit, which runs outside a render; the handlers that make or take a pending box also set it at once)
  const dropPending = () => {
    pendingRef.current = null;
    setPending(null);
  };
  // The canvas size is set when the panel opens, so the phone's keyboard can never make it jump (it changes only the
  // height); a turned phone or a resized window sets it again (below).
  const panelSize = () => {
    const thin = window.innerWidth < 760;
    const top = appRef.current?.querySelector(".dr-top")?.offsetHeight || 56;
    const cw = thin ? window.innerWidth : (window.innerWidth >= 1280 ? 364 : 340) - 40;
    // phones: what the sheet's top bar (52 px) and bottom bar (64 px) leave; laptops: the column less its header (one
    // line of each, about 112 px) and the side tabs (about 54 px), so the whole side shows without scrolling (the
    // controls are under it)
    const column = (appRef.current?.querySelector(".dr-stage")?.getBoundingClientRect().height || window.innerHeight - 64) - 24;
    const head = appRef.current?.querySelector(".dr-editor > header")?.offsetHeight || 112;
    const tabs = appRef.current?.querySelector(".dr-panelsides")?.offsetHeight || 54;
    const ch = Math.round(thin ? Math.max(240, window.innerHeight - top - 6 - 52 - 64) : Math.max(340, Math.min(640, column - Math.max(100, Math.min(140, head)) - tabs - 8)));
    return { cw, ch };
  };
  const openPanel = (side) => {
    if (!panelSides.includes(side)) return;
    setPanel({ side, ...panelSize() });
    setPanelZoomed(false);
    setAssist(false);
    setAreasOpen(false);
    setHoverKey(null);
    setCamRequest({ view: side, ms: 700, n: nextReq() });
  };
  const panelOpen = !!panel;
  useEffect(() => {
    if (!panelOpen) return undefined;
    let width = window.innerWidth;
    let frame = 0;
    const resized = () => {
      if (Math.abs(window.innerWidth - width) < 2) return; // (the keyboard: only the height changed)
      width = window.innerWidth;
      const size = panelSize();
      setPanel((cur) => cur && { ...cur, ...size });
      // (once more when the page has its new layout: phone ↔ laptop changes the bars round the canvas)
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const again = panelSize();
        setPanel((cur) => (cur && (cur.cw !== again.cw || cur.ch !== again.ch) ? { ...cur, ...again } : cur));
      });
    };
    window.addEventListener("resize", resized);
    return () => {
      window.removeEventListener("resize", resized);
      cancelAnimationFrame(frame);
    };
  }, [panelOpen]);
  // Done ✓ / "Just Left Chest" / Esc: back to the selected thing's print (or the open one) in its own editor
  const closePanel = () => {
    const on = elements.find((e) => e.id === selectedId);
    const key = on?.position || (active && positions.some((p) => p.key === active) ? active : null);
    setPanel(null);
    setPanelZoomed(false);
    setHoverKey(null);
    if (key) openArea(key, { force: true });
    else closeArea();
  };
  const panelTo = (side) => {
    if (!panel || side === panel.side) return;
    setPanel({ ...panel, side });
    setPanelZoomed(false);
    setSelectedId(null);
    // (its first print is the open one; a side with no prints has none, so nothing can be added to a print on another side)
    setActive(elements.find((e) => e.side === side)?.position || null);
    setCamRequest({ view: side, ms: 700, n: nextReq() });
  };
  // a thing picked on the panel: its print is the open one
  const panelSelect = (id) => {
    if (id == null) return setSelectedId(null);
    const el = elements.find((e) => String(e.id) === String(id));
    if (!el) return;
    setSelectedId(el.id);
    if (el.position !== active) setActive(el.position);
  };
  // what a drop did, said with an Undo (moving out of a print area: the first time a visit)
  const sayDrop = (out) => {
    if (out.joined?.length) {
      say(`Joined with ${andList(out.joined)}. Prints this close are pressed as one piece.${out.otherSize ? " (They meet on the bigger tee sizes.)" : ""}`, { label: "Undo", onClick: undo });
    } else if (out.left && !told.current.left) {
      told.current.left = true;
      say(`Moved outside ${out.left}. It’s now its own print, “${out.name}”.`, { label: "Undo", onClick: undo });
    }
  };
  // a thing let go on the panel (dragged, resized or turned): one commit, so one Undo takes the drop back
  const panelDrop = (next) => {
    const out = dropThing(elements, next, dropCtx());
    liveQueue.current = null;
    setLive(null);
    if (out.refused) {
      // (it goes back: the panel and the 3D tee are drawn again from the design as it was)
      lastSig.current.clear();
      setElements((els) => els.slice());
      return say(out.refused);
    }
    if (pendingRef.current) dropPending();
    commit(out.elements);
    if (out.key && out.key !== active) setActive(out.key);
    sayDrop(out);
  };
  // the arrow keys (0.5 cm, Shift 2 cm) and the panel's Centre: through the same drop rule
  const panelNudge = (move, soft = null) => {
    const next = selectedId != null ? movedThing(elements, selectedId, move, dropCtx()) : null;
    if (!next) return;
    const out = dropThing(elements, next, dropCtx());
    if (out.refused) return say(out.refused);
    if (pendingRef.current) dropPending();
    commit(out.elements, { soft });
    setNudged((n) => n + 1);
    if (out.key && out.key !== active) setActive(out.key);
    sayDrop(out);
  };
  // the phone panel's Smaller / Bigger: as the panel's corner handles — never past the biggest print or the safe zone
  // (resizeSel has no limits: tap after tap, a free place's print grew past both), then the same drop rule
  const panelResize = (f) => {
    const sized = selectedId != null ? scaledThing(elements, selectedId, f, dropCtx()) : null;
    if (!sized) return resizeSel(f);
    if (sized.capped && f > 1 && Math.abs(sized.el.width - (elements.find((e) => e.id === selectedId)?.width || 0)) < 1e-6) return say("That’s as big as it can be here.");
    const out = dropThing(elements, sized.el, dropCtx());
    if (out.refused) return say(out.refused);
    if (pendingRef.current) dropPending();
    commit(out.elements, { soft: `size:${selectedId}` });
    setNudged((n) => n + 1);
    if (out.key && out.key !== active) setActive(out.key);
    sayDrop(out);
  };
  // "Anywhere on the tee": the tee waits for a tap (a picture from My pictures waits with it)
  const anywhereInfo = panelSides.length ? { used: spotsIn(elements).length, max: MAX_SPOTS } : null;
  const anyFull = !!anywhereInfo && anywhereInfo.used >= anywhereInfo.max;
  const startAnywhere = (side, pic = null) => {
    if (spotCount(elements) >= MAX_SPOTS) return say(CAP_MSG);
    const to = panelSides.includes(side) ? side : panelSides[0];
    if (!to) return;
    setAssist(false);
    setAreasOpen(false);
    setPlacePic(null); // (the picture from My pictures waits for the tap)
    setPanel(null);
    closeArea();
    // (an old message would sit on the banner: the next one is about the tap)
    clearTimeout(toastTimer.current);
    setToast("");
    setAnywhere({ side: to, pic });
    setCamRequest({ view: to, ms: 700, n: nextReq() });
  };
  // A new print where the tee was tapped (or "+ New print here" on the panel): a 10 × 10 cm box there, kept in the
  // safe zone, waiting for its first thing. On a print, or within 1 cm of one, that print opens instead.
  const newPrintAt = (point, pic = null) => {
    const { box, hit, here, otherSize } = startBox(point, { ...dropCtx(), elements });
    if (hit) {
      openArea(hit.key, { force: true });
      if (pic) setPlacePic(pic);
      say(
        here
          ? `There’s already a print here (${hit.label}). Add to it, or tap further away.`
          : otherSize
            ? `That’s close to ${hit.label}, which is bigger and lower on the larger tee sizes. Add to it, or tap a little further away.`
            : `That’s too close to ${hit.label}: prints less than ${JOIN_CM} cm apart are pressed as one. Tap a little further away, or add to it.`,
      );
      return null;
    }
    if (spotCount(elements) >= MAX_SPOTS) {
      say(CAP_MSG);
      return null;
    }
    pendingRef.current = box;
    setPending(box);
    setActive(box.key);
    setSelectedId(null);
    setAreaTab(groupOfSide(box.side));
    setAreasOpen(false);
    setHoverKey(null);
    if (pic) placeInPending(box, pic);
    return box;
  };
  const placeInPending = async (box, pic) => {
    try {
      let { width: w, height: h } = pic;
      if (!w || !h) {
        const img = await loadImage(pic.url);
        w = img.naturalWidth;
        h = img.naturalHeight;
      }
      if (pendingRef.current?.key !== box.key) return; // (another print was opened meanwhile)
      const pos = spotPosition(box, garment, { maxPrint });
      const el = { id: makeId(), position: box.key, side: box.side, rotation: 0, zIndex: elements.length + 1, ...imageEl(pos, pic.url, w, h) };
      commit((prev) => [...prev, el]);
      setSelectedId(el.id);
      say(`Added to ${box.label}.`, { label: "Undo", onClick: undo });
    } catch {
      say("That picture couldn’t be loaded. Please try again.");
    }
  };
  const anywhereTap = ({ raw, side }) => {
    const want = anywhere;
    if (!want || !model) return;
    if (!panelSides.includes(side)) return say("Tap the front, the back or a sleeve.");
    const at = pointToCm(model, raw, side, lengthCm);
    setAnywhere(null);
    const box = newPrintAt({ side, across: at.across, down: at.down }, want.pic);
    if (!box) return;
    // laptops: the panel, with the Add tabs under it; phones: the normal sheet, the tee zoomed in on the new print
    // (a full-height panel would hide the tee they just tapped)
    if (narrow) setCamRequest({ area: box.key, side: box.side, sleeve: box.side === "left" || box.side === "right", narrow, overlayPx: 0, fill: 0.74, lift: 0.03, keep: true, n: nextReq() });
    else openPanel(box.side);
  };
  const panelNewHere = ({ across, y }) => {
    if (!panel) return;
    const box = newPrintAt({ side: panel.side, across, down: y });
    // (laptops: the 3D tee beside the panel turns to that side, off a print it was zoomed in on)
    if (box && !narrow) setCamRequest({ view: box.side, ms: 700, n: nextReq() });
  };
  // laptops: a new print on the panel has nothing in it yet — its Add tabs (the only next step) are brought into view
  // under the panel
  useEffect(() => {
    if (!pending || !panelOpen || narrow) return undefined;
    const t = requestAnimationFrame(() => appRef.current?.querySelector(".dr-editor .dr-addtabs")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => cancelAnimationFrame(t);
  }, [pending, panelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // a thing added while the panel is open: zoomed to when it is too small there to see under its handles (laptops: a
  // new text is about 40 px wide on the whole front)
  const zoomNew = useRef(null);
  useEffect(() => {
    if (!zoomNew.current || zoomNew.current !== selectedId) return;
    zoomNew.current = null;
    panelRef.current?.zoomIfSmall(selectedId);
  }, [selectedId, elements]);
  const addElement = (pos, el) => {
    const full = { id: makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: elements.length + 1, ...el };
    commit((prev) => [...prev, full]);
    setSelectedId(full.id);
    if (panel) zoomNew.current = full.id;
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
    // the letters start at a size that suits the area's shape (a wide strip like Chest Line gets letters to match its
    // width, not 8 mm words); a vertical line keeps the plain start, it is fitted to the strip below
    const n = elements.filter((e) => e.position === pos.key).length;
    const plainPct = opts.small ? 7 : 12;
    const box = areaPx(pos);
    const fontSizePct = opts.vertical ? plainPct : startFontPct(box.W, box.H, opts.small);
    const base = { type: "text", text, fontFamily: "Anton", fontSizePct, color: inkDefault, align: "center", effect: opts.effect || "straight", x: 50, y: 18 + (n % 4) * 18, width: 0, height: 0 };
    let el = textBox(base, pos);
    if (opts.vertical) {
      // turned 90°: its length runs down the area, so fit it to 90% of the area's height
      const { W, H } = areaPx(pos);
      const lengthPctOfHeight = ((el.width / 100) * W / H) * 100;
      if (lengthPctOfHeight > 90) el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / lengthPctOfHeight }, pos);
      // "up": reads from bottom to top (turned left); otherwise from top to bottom (turned right)
      el = { ...el, rotation: opts.vertical === "up" ? -90 : 90, x: 50 - el.width / 2, y: 50 - el.height / 2 };
    } else {
      if (el.width > 90) {
        // long text: shrink so it fits inside the print area (90% wide)
        el = textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
      }
      // the first words in a wide strip sit in its middle; more words stack down without hanging off the bottom
      el = { ...el, y: startTextY({ n, heightPct: el.height, grown: fontSizePct > plainPct }) };
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
  // a picture sized to sit well in the print area (turned along a tall strip)
  const imageEl = (pos, src, natW, natH, extra = {}) => {
    const turned = turnedFit(pos, natW, natH, 80);
    if (turned) return { type: "image", src, ...turned, ...extra };
    const { W, H } = areaPx(pos);
    const widthPct = 60;
    const heightPct = ((widthPct / 100) * W * (natH / natW) / H) * 100;
    const h = Math.min(heightPct, 90);
    const w = h < heightPct ? (widthPct * h) / heightPct : widthPct;
    return { type: "image", src, x: 50 - w / 2, y: 50 - h / 2, width: w, height: h, ...extra };
  };
  const addImage = (pos, src, natW, natH, extra = {}) => addElement(pos, imageEl(pos, src, natW, natH, extra));
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
    commit(
      (prev) =>
        syncLinked(
          prev,
          prev.map((e) => {
            if (e.id !== selectedId) return e;
            const next = { ...e, ...patch, ...(patch.fontSizePct !== undefined ? { ownSizePct: patch.fontSizePct } : {}) };
            return measure && next.type === "text" ? textBox(next, positions.find((p) => p.key === e.position)) : next;
          }),
        ),
      // the same settings of the same item changed again straight after = one Undo step
      { soft: `${selectedId}:${Object.keys(patch).sort().join()}` },
    );
  };
  const removeSel = () => {
    commit((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
    say("Deleted.", { label: "Undo", onClick: undo });
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
    const me = startBusy({ label: kind === "recolour" ? "Recolouring your picture…" : "Redrawing your picture sharper…", expect: 25, hint: "Usually 20–40 seconds." });
    try {
      const { W, H } = areaPx(pos);
      const res = await aiService.design({ fixUrl: el.src, fixKind: kind, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: W / H });
      setAi((cur) => ({ ...cur, left: res.left }));
      if (me.stopped) return; // Stop was pressed: the picture stays as it was (the request was still counted)
      const im = res.images[0];
      aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
      // same width and middle as before; the height follows the new picture's shape
      const height = (el.width * W * im.height) / (im.width * H);
      commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: im.url, pxW: im.width, height, y: e.y + (e.height - height) / 2 } : e)));
      say(`${kind === "recolour" ? "Recoloured" : "Redrawn sharper"}. Not right? Press Undo (↶). ${res.left} request${res.left === 1 ? "" : "s"} left today.`);
    } catch (err) {
      if (!me.stopped) say(err.response?.data?.message || "That didn’t work. Please try again.");
    } finally {
      endBusy(me);
    }
  };
  const removeBg = async () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el || el.type !== "image" || busy) return;
    const me = startBusy("Removing the background…");
    const progress = (label) => !me.stopped && setBusy({ label, stoppable: true });
    try {
      const img = await loadImage(el.src, { full: true });
      if (me.stopped) return;
      const { removeBackground } = await import("./removeBackground");
      const out = await removeBackground(img, progress);
      if (me.stopped) return;
      if (out.already) return say("This picture already has a see-through background.");
      if (out.needsServer) {
        // a photo: our server's model cuts it out (free) and stores the cut-out
        if (!isLoggedIn()) return say("Log in to remove a photo's background.");
        const cut = await aiService.removeBg({ url: el.src });
        if (me.stopped) return;
        commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: cut.url, pxW: cut.width } : e)));
        return say("Background removed. Not right? Press Undo (↶) to get the original back.");
      }
      progress("Saving the cut-out…");
      const res = await dispatch(uploadDesignImage(new File([out.blob], "cut-out.png", { type: "image/png" })));
      if (me.stopped) return;
      if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "The cut-out could not be saved. Please try again.");
      commit((prev) => prev.map((e) => (e.id === el.id ? { ...e, src: res.payload.path, pxW: out.width } : e)));
      say(out.method === "ai" ? "Background removed. Not right? Press Undo (↶) to get the original back." : "Background colour removed. Not right? Press Undo (↶).");
    } catch (err) {
      if (!me.stopped) say(err?.response?.data?.message || "The background could not be removed. Check your internet connection and try again.");
    } finally {
      endBusy(me);
    }
  };
  // the quick tool bar by the tee: bigger / smaller around the item's middle, and centre it left-to-right
  const resizeSel = (f) => {
    commit((prev) =>
      prev.map((e) => {
        if (e.id !== selectedId) return e;
        if (e.type === "text") {
          // (words in a free place fill its tight box — 80–87 % of its height — so they may go up to the server's 100 %;
          // the box then grows round them: commit)
          const fontSizePct = Math.min(isSpotKey(e.position) ? 100 : 60, Math.max(2, e.fontSizePct * f));
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
  // A picture the customer picked, opened and made ready to upload (see shrinkPhoto.js). null = it can't be used,
  // and the customer has been told why in plain words.
  const openPhoto = async (file, working, opts) => {
    setBusy(working);
    try {
      return await shrinkPhoto(file, opts);
    } catch (err) {
      say(err instanceof PhotoError ? err.message : "The photo couldn’t be prepared. Try another one.");
      return null;
    } finally {
      setBusy("");
    }
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const pos = positions.find((p) => p.key === active) || ensureArea();
    if (!file || !pos) return;
    // the picture is opened first (12 Nov 2026): a damaged file is refused here — it used to go on the tee as an
    // invisible picture — and a big phone photo is made smaller instead of being turned away (a logo stays see-through)
    const ready = await openPhoto(file, "Getting your image ready…", { keepClear: true });
    if (!ready) return;
    setBusy("Uploading your image…");
    const res = await dispatch(uploadDesignImage(ready.file));
    setBusy("");
    if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "Upload failed. Please try again.");
    addImage(pos, res.payload.path, ready.w, ready.h, { pxW: ready.w });
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
      if (e.key === "Escape") {
        // closes whatever is open, like a × would (even with nothing selected)
        if (saveOpen) return setSaveOpen(false);
        if (pickOpen) return setPickOpen(false);
        if (areasOpen) return setAreasOpen(false);
        if (anywhere) return setAnywhere(null);
        if (panel) return closePanel();
        return;
      }
      if (!selectedId) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        return dupSel();
      }
      if (e.key === "Delete" || e.key === "Backspace") return removeSel();
      // the panel editor: 0.5 cm (Shift: 2 cm) through the drop rule, a run of presses one Undo step
      if (panel) {
        const n = e.shiftKey ? 2 : 0.5;
        const m = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
        if (m) {
          e.preventDefault();
          panelNudge({ dx: m[0], dy: m[1] }, `nudge:${selectedId}`);
        }
        return;
      }
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
  // (a print in a free place is checked on every size the tee comes in: designed on M, it may move on 2XL)
  const designIssues = () => checkDesign(elements, positions, { fabricHex, inkDefault, cmOf: (pos) => areaPx(pos), canEnlarge: ai.available, kept: keptSmall.current, garment, size: sizeNow, sizes, maxPrint });
  // "Keep this size" (15 Nov 2026): the customer keeps a small photo as big as it is; asked again only if made bigger
  const keepIssue = (issue) => {
    if (issue?.elId != null) keptSmall.current.set(issue.elId, issue.keepWidth || 0);
  };
  // a free place in words for the AI ("24 x 6 cm, 40 cm below the collar seam, centred"): "make Front 1 bigger" works
  const whereOf = (p) => spotWhere(p, sizeNow, garment);
  // what the assistant knows about the tee right now
  const assistantCtx = () => ({
    areaLabel: activePos?.label || "the tee",
    teeName: colour?.name || "this",
    hasDesign: elements.length > 0,
    sizes,
    sizeNow,
    chart: (sz) => garment.sizeChart?.find((r) => r.size === sz),
    areas: positions.map((p) => ({ key: p.key, label: p.label, side: p.side, main: !!p.main, free: usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length, ...(p.spot ? { where: whereOf(p) } : {}) })),
    // (17 Nov 2026) the areas a picture already on the tee could be MOVED to (its own areas don't block it)
    moveFree: (url) => {
      const used = usedIfMoved(url);
      return positions.filter((p) => used.includes(p.key) || !blockersOf(p.key, positions, used).length).map((p) => p.key);
    },
    activeKey: active || null,
    issues: designIssues,
    inks: inksFor(fabricHex, INKS),
    ai: { ...ai, loggedIn: isLoggedIn() },
    hasText: elements.some((e) => e.type === "text"),
    hasRoles: roles, // a text is marked as the player's name / number (team orders)
    roles: rolesIn(elements), // { name, number }: which of the two the tee has a place for
    players: players.filter(filled).length, // a pasted list is added to these, never replaces them
    // round 8 (11 Nov 2026): what the chat's cards ask the page (studio/AssistantCards.jsx)
    garmentLabel: garment?.label || "",
    sizeFor, // height and weight -> the best size of this tee
    again: orderAgain, // an ordered tee, opened again as a new design
    groupTeam, // the group link's answers -> one tee per friend, with their name
    groupSizes, // ... or only a count per size
    // an uploaded picture on the tee (not library art, not an AI design) — "photo to art" can use it
    photoOnTee: [...elements].reverse().find((e) => e.type === "image" && !e.artDesignId && !aiCuts.current.has(e.src))?.src || null,
  });
  // Round 8: the size card. The same rule as the size finder (sizeMatch.js), from height and weight alone.
  const sizeFor = (answers) => {
    const ranked = rankSizes(garment, answers);
    const best = ranked?.best;
    if (!best) return null;
    return { size: best.size, score: best.score, word: matchWord(best.score), note: fitNote(garment, ranked, best), chest: best.row?.chest || 0, length: best.row?.length || 0 };
  };
  // Round 8: "the same tee again (in blue)". The tee on screen is saved first; then a copy of the ordered design
  // opens in its place (the design-open effect above swaps the tee and gives it its own chat).
  const orderAgain = async (id, colourName, no) => {
    if (!id) return { ok: false, message: "That order has no design of your own to open again." };
    try {
      if (elements.length && unsaved.current && !(await saveDesign({ quiet: true }))) return { ok: false, message: "Your tee couldn’t be saved, so I left everything as it is. Please try again." };
      const copy = await customizationService.duplicateDesign(id, { colorName: colourName || undefined, again: true });
      openedAgain.current = { id: copy._id, no, colour: colourName };
      // (also in the address state: a tee of another garment opens in a new page, which reads it from there)
      // The same garment opens it in place, like a chat (13 Nov 2026): Back then steps back inside the room and never
      // brings the earlier design's address back.
      const to = `/customize/${copy.garmentType}?design=${copy._id}`;
      if (copy.garmentType === type) navigate(to, { replace: true, state: { again: openedAgain.current } });
      else navigate(to, { state: { again: openedAgain.current } });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.response?.status === 404 ? "That design isn’t in My designs any more, so it can’t be opened again." : err.response?.data?.message || "That didn’t work just now. Please try again." };
    }
  };
  // Round 8: "email me my design". Saved first (the email's link opens the saved tee), then sent to their own address.
  const emailMyDesign = async () => {
    if (!elements.length) return "There is nothing on the tee yet. Design something first, then ask me to email it.";
    const saved = await saveDesign({ quiet: true });
    if (!saved) return "Your tee couldn’t be saved, so nothing was sent. Please try again.";
    try {
      const res = await customizationService.emailDesign(saved._id);
      return `Sent to ${res.to}. The email has a picture of your tee and a link that opens it again.`;
    } catch (err) {
      return err.response?.data?.message || "The email couldn’t be sent just now. Please try again in a minute.";
    }
  };
  // The smart Assistant (23 Oct 2026): a typed message read by Google's text AI. It answers in words and may use
  // ONE of the Assistant's own tools — the edit planner, slogans, a drawing plan card (nothing drawn until Draw is
  // tapped) or a built-in helper ({ menu }, answered by the fixed script in Assistant.jsx). When it can't answer,
  // { fallback } hands the message to the fixed script, exactly as before.
  const chatSmart = async (a, progress, run) => {
    const c = assistantCtx();
    // the chat so far, in words (pictures and cards as a short note), for the AI to follow the conversation. A long
    // chat also sends its memory note and the older messages not in it yet (chatStore.historyFor).
    const { history, earlier, fold } = historyFor(chat);
    let res;
    try {
      res = await aiService.chat({
        message: a.text,
        history,
        earlier,
        memory: chatMemory,
        design: describeDesign({ elements, positions, active, selectedId, fonts: FONTS, teeName: colour?.name || "", teeColours: colours.map((x) => x.name), areaPx, whereOf }),
        // what the page shows the customer — the AI quotes these, never its own numbers
        facts: {
          garment: garment?.label || "",
          teeColour: colour?.name || "",
          teeColours: colours.map((x) => x.name),
          size: sizeNow,
          sizes,
          price: unitPrice,
          wasPrice: wasPrice || null,
          pictureAddOn: Number(ai.designAddOnInr ?? 100),
          shipping: shopTeeNow ? "Free shipping (a Shop your IDENTEE tee)" : shipRule ? `₹${shipRule.rate} shipping, free from ${shipRule.freeFrom} pieces` : "",
          offer: siteOffer?.code ? `Extra ${siteOffer.offerPercentage}% off at checkout with code ${siteOffer.code}` : "",
          picturesLeft: ai.left,
          canDraw: ai.available && isLoggedIn() && ai.left !== 0,
          pieces,
        },
        areas: c.areas.map(({ key, label, free, where }) => ({ key, label, free, ...(where ? { where } : {}) })),
      });
    } catch (err) {
      // switched off or paused on purpose (503): the fixed replies answer, as before. Only a hiccup (slow internet,
      // Google busy): say so, with "Try again" for the same message — never a general menu instead of an answer
      if (err.response?.status === 503) return [{ fallback: { text: a.text } }];
      return [botSays("I couldn’t answer that just now — the connection was slow. Tap Try again and I’ll answer it."), { failed: true }];
    }
    // the older messages are in the memory note now: they needn't be sent again
    if (res.memory) {
      const noted = new Set(fold);
      setChatMemory(res.memory);
      setChat((m) => m.map((x) => (noted.has(x) ? { ...x, folded: true } : x)));
    }
    if (run?.stopped) return [];
    const d = res.do;
    // a change to the tee: the edit planner does it (its own reply says what changed; one Undo step)
    if (d?.tool === "edit") {
      const done = await chatEdit({ message: d.message }, progress, run);
      return done.length ? done : [botSays(res.reply)];
    }
    const out = res.reply ? [botSays(res.reply)] : [];
    if (res.ideas?.length) out.push({ ideas: res.ideas });
    if (d?.tool === "draw") {
      if (!ai.available) out.push(botSays("Pictures can’t be drawn right now. You can pick from the free designs or upload your own."), chipRow(["Open the art library", "Upload a picture"]));
      else if (!isLoggedIn()) out.push(botSays("Log in and I’ll draw it for you. Your design stays here."), chipRow(["Log in", "Something else"]));
      else if (ai.left === 0) out.push(botSays("You’ve made today’s pictures. They come back tomorrow."));
      else out.push(...smartPlan(c, d.pictures, d.style));
    }
    if (d?.tool === "slogans") {
      // (remembered like the fixed chat's slogans, so "Show more" brings new ones)
      setChatState((st) => ({ ...st, ask: d.about, tone: d.tone || null, said: [] }));
      const lines = await writeSlogans({ ask: d.about, tone: d.tone, avoid: [] });
      if (run?.stopped) return [];
      out.push(...lines.filter((m) => !m.from)); // (the AI already said its own words)
    }
    // (My pictures: the customer's own words find the closest pictures — "the lion from before")
    if (d?.tool === "menu" && d.item === "My pictures") out.push(...(isLoggedIn() ? [{ mypics: true, find: a.text }] : [botSays("Log in and I’ll show the pictures you made or uploaded before."), chipRow(["Log in", "Something else"])]));
    else if (d?.tool === "menu") out.push({ menu: d.item });
    // (slogans and helpers bring their own buttons — Show more, Change tone … — so the AI's follow-ups would be a
    // second row of chips under them)
    if (res.chips?.length && d?.tool !== "slogans" && d?.tool !== "menu") out.push({ chips: res.chips, smart: true });
    return out.length ? out : [{ fallback: { text: a.text } }];
  };
  // Assistant v2 (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md): the brain reads everything and answers with STEPS the page runs
  // in order — ask (a question + suggested answers), concepts (a sheet of three numbered tees), develop (picked concepts →
  // real artwork on the tee), draw (straight away, no plan card), edit, slogans, a helper, undo. A bare pick ("2 and 3")
  // comes with its develop step ready (assistantV2.assistAct) and skips the brain.
  const v2Facts = () => ({
    garment: garment?.label || "",
    teeColour: colour?.name || "",
    teeColours: colours.map((x) => x.name),
    size: sizeNow,
    sizes,
    price: unitPrice,
    wasPrice: wasPrice || null,
    pictureAddOn: Number(ai.designAddOnInr ?? 100),
    shipping: shopTeeNow ? "Free shipping (a Shop your IDENTEE tee)" : shipRule ? `₹${shipRule.rate} shipping, free from ${shipRule.freeFrom} pieces` : "",
    offer: siteOffer?.code ? `Extra ${siteOffer.offerPercentage}% off at checkout with code ${siteOffer.code}` : "",
    picturesLeft: ai.left,
    canDraw: ai.available && isLoggedIn() && ai.left !== 0,
    pieces,
  });
  const chatAssist = async (a, progress, run) => {
    const c = assistantCtx();
    // (17 Nov 2026) the photos of this message (a.photos), or the ones still waiting from the last message
    const photosNow = a.photos?.length > 1 ? a.photos : chatState.photosOpen && chatState.photos?.length > 1 ? chatState.photos : [];
    if (!isLoggedIn()) return [botSays("Sign in and I’ll design with you. Your tee stays here."), chipRow(["Log in"])];
    let res;
    if (a.steps) res = { reply: "", steps: a.steps, chips: [] };
    else {
      const { history, earlier, fold } = historyFor(chat);
      try {
        const got = await aiService.assist({
          message: a.text,
          history,
          earlier,
          memory: chatMemory,
          design: describeDesign({ elements, positions, active, selectedId, fonts: FONTS, teeName: colour?.name || "", teeColours: colours.map((x) => x.name), areaPx, whereOf }),
          facts: v2Facts(),
          areas: c.areas.map(({ key, label, free, where }) => ({ key, label, free, ...(where ? { where } : {}) })),
          sheets: sheetsFromChat(chat).map((sh) => ({ brief: sh.brief, concepts: (sh.concepts || []).map(({ n, title }) => ({ n, title })), developed: sh.developed || [] })),
          // a picture sent with this message, and the logo on file in this chat
          ...(a.photo?.url ? { photo: { url: a.photo.url, about: a.text || "" } } : {}),
          ...(chatState.logo ? { logoUrl: chatState.logo } : {}),
          // (17 Nov 2026) several photos sent with this message — or still waiting from the last one (the brain asked
          // what to do with them, and this is the answer)
          ...(photosNow.length > 1 ? { photos: photosNow.map((p) => ({ url: p.url, about: a.photos ? a.text || "" : "" })), ...(a.photos ? {} : { photosEarlier: true }) } : {}),
        });
        // 💡 Suggest (round 9, 13 Nov 2026): only words and chips come back — a step the brain still sent is dropped, so
        // nothing is drawn or changed until the customer taps a suggestion (a question it asks is kept)
        res = a.suggest ? { ...got, steps: (got.steps || []).filter((st) => st.type === "ask") } : got;
      } catch (err) {
        // (💡 Suggest never falls back to the fixed chat: its words would be taken as a change to the tee — 13 Nov 2026;
        // several photos and the brain resting: the free rules make the plan, so the photos aren't lost — 17 Nov 2026)
        if (err.response?.status === 503) return a.suggest ? [botSays(SUGGEST.off)] : photosNow.length > 1 ? photosByRules(a.text, photosNow) : [{ fallback: { text: a.text } }];
        if (err.response?.status === 401) return [botSays("Sign in and I’ll design with you. Your tee stays here."), chipRow(["Log in"])];
        return [botSays(err.response?.data?.message || "I couldn’t answer that just now — the connection was slow. Tap Try again and I’ll answer it."), { failed: true }];
      }
      if (res.memory) {
        const noted = new Set(fold);
        setChatMemory(res.memory);
        setChat((m) => m.map((x) => (noted.has(x) ? { ...x, folded: true } : x)));
      }
      if (res.left != null) setAi((cur) => ({ ...cur, left: res.left }));
    }
    if (run?.stopped) return [];
    // the reply shows at once; the steps (a sheet, pieces …) follow while the customer reads it
    const slow = (res.steps || []).some((st) => ["concepts", "develop", "draw", "edit", "slogans"].includes(st.type));
    const out = [];
    if (res.reply) {
      if (slow && run?.say) run.say([botSays(res.reply)]);
      else out.push(botSays(res.reply));
    }
    let asked = false;
    for (const step of res.steps || []) {
      if (run?.stopped) return out;
      if (step.type === "ask") {
        // (the reply usually IS the question — it is not repeated under it)
        if (!res.reply || !res.reply.toLowerCase().includes(step.question.toLowerCase().replace(/[?.!]+$/, "").slice(0, 30))) out.push(botSays(step.question));
        if (step.options?.length) out.push({ chips: step.options, smart: true });
        asked = true;
        break;
      }
      // (a sheet may mix several of the customer's photos: step.photos are their numbers, 17 Nov 2026)
      if (step.type === "concepts") out.push(...(await makeSheet(step, progress, a.photo?.url || null, step.photos?.length ? step.photos.map((n) => photosNow[n - 1]?.url).filter(Boolean) : null)));
      // several photos, each made its own way and put on its own place: the plan card first (nothing is made yet)
      else if (step.type === "photos" && photosNow.length > 1) out.push(...photosPlanMsgs(step.items, photosNow, Boolean(res.reply)));
      else if (step.type === "menu" && step.item === "Photo to art" && (a.photo || chatState.photo)) out.push(...(await chatPhotoUnderstand({ text: a.text, photo: a.photo || chatState.photo }, run)));
      else if (step.type === "develop") out.push(...(await developPicks(step, progress, run)));
      else if (step.type === "match") out.push(...(await matchPiece(step, progress, run)));
      else if (step.type === "team") out.push(...setupTeam(step));
      else if (step.type === "draw") out.push(...(await drawPlan({ items: [{ subject: step.subject, areaKey: step.area }], style: step.style }, progress, run)).filter((m) => !m.chips));
      else if (step.type === "edit") out.push(...(await chatEdit({ message: step.message }, progress, run)).filter((m) => !m.chips));
      else if (step.type === "slogans") {
        setChatState((st) => ({ ...st, ask: step.about, tone: step.tone || null, said: [] }));
        out.push(...(await writeSlogans({ ask: step.about, tone: step.tone, avoid: [] })).filter((m) => !m.from));
      } else if (step.type === "menu") out.push(step.item === "My pictures" ? { mypics: true, find: a.text || "" } : { menu: step.item });
      // round 8: size from height and weight, orders, the same tee again, email me my design, the group link
      else if (step.type === "size") out.push({ sizeAsk: { who: step.who || null, heightCm: step.heightCm || null, weightKg: step.weightKg || null } });
      else if (step.type === "orders") out.push({ orders: true });
      else if (step.type === "reorder") out.push({ reorder: { order: step.order || null, colour: step.colour || null } });
      else if (step.type === "group") out.push({ group: {} });
      else if (step.type === "email") {
        progress?.({ label: "Sending the email…", expect: 8 });
        out.push(botSays(await emailMyDesign()));
      } else if (step.type === "undo") {
        undo();
        if (!res.reply) out.push(botSays("Undone."));
      }
    }
    // the waiting photos were used (a plan for them, or a sheet from them): later messages don't carry them any more
    if ((res.steps || []).some((st) => st.type === "photos" || st.photos?.length)) setChatState((st) => ({ ...st, photosOpen: false }));
    // (a sheet card has its own number buttons and More options, so those chips aren't repeated under it)
    const madeSheet = out.some((m) => m.sheet);
    const chips = (res.chips || []).filter((c) => !madeSheet || !(/^(option|concept|number)?\s*\d{1,2}$/i.test(c) || /^more options$/i.test(c)));
    // a concept just landed and the sleeves are bare: offer the little extra (round 4)
    const landed = (res.steps || []).some((st) => st.type === "develop" || st.type === "match") && out.some((m) => m.designs);
    const sleeveTaken = elements.some((e) => /sleeve/.test(e.position)) || out.some((m) => m.placedOn?.some((k) => /sleeve/.test(k)));
    if (landed && !sleeveTaken && c.areas.some((ar) => /sleeve/.test(ar.key) && ar.free) && !chips.some((ch) => /sleeve/i.test(ch))) chips.splice(0, 0, "A small matching logo on the sleeve too");
    // the tee changed: keep this version with a small picture, so the customer can come back to it (round 7)
    // (a develop or match says what it placed; a drawing, an edit, the team list or an undo count as a change)
    if (out.some((m) => m.placedOn) || (res.steps || []).some((st) => ["draw", "edit", "team", "undo"].includes(st.type))) {
      const label = (res.steps || []).map((st) => (st.type === "develop" ? `concept ${st.picks?.join(", ")}` : st.type === "match" ? `matching ${st.piece}` : st.type === "draw" ? "a drawing" : st.type === "edit" ? st.message : st.type === "team" ? "the team list" : "undo")).filter(Boolean).join(" · ");
      out.push(await versionMessage(label));
    }
    if (!asked && chips.length) out.push({ chips, smart: true });
    const shown = out.filter((m) => !m.placedOn);
    return shown.length ? shown : [botSays("How can I help with your tee?")];
  };
  // a concept sheet: one picture, three numbered tees (counts as one picture request)
  // photoUrls (17 Nov 2026): several of the customer's photos mixed into the concepts — all go to the picture AI
  const makeSheet = async (step, progress, photoUrl = null, photoUrls = null) => {
    if (!ai.available) return [botSays("Pictures can’t be made right now. You can pick from the art library or upload your own."), chipRow(["Open the art library", "Upload a picture"])];
    if (ai.left === 0) return [botSays("You’ve made today’s pictures. They come back tomorrow — I can still help with words and layout.")];
    const numberFrom = nextConceptNumber(sheetsFromChat(chat));
    // the names show at once, while the picture is drawn (the wait feels shorter)
    const names = step.concepts.map((c, i) => `${numberFrom + i} ${c.title}`).join(" · ");
    progress?.({ label: "Drawing three concepts…", expect: 25, hint: names });
    const logoUrls = step.logo && photoUrls?.length > 1 ? photoUrls : null;
    const logoUrl = step.logo && !logoUrls ? photoUrls?.[0] || photoUrl || chatState.logo || null : null;
    // colourways / variations of the picture already on the tee (round 5): that picture is the reference
    const basis = step.basis === "tee" && !logoUrl && !logoUrls ? aiPictureOnTee(elements, positions) : null;
    if (step.basis === "tee" && !logoUrl && !logoUrls && !basis) return [botSays("There’s no picture on the tee yet to make versions of. Tell me what you’d like and I’ll show three concepts."), chipRow(["Show me 3 options"])];
    try {
      const res = await aiService.concepts({ concepts: step.concepts, brief: step.brief, garment: garment?.label || "t-shirt", teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, numberFrom, ...(logoUrl ? { logoUrl } : {}), ...(logoUrls ? { logoUrls } : {}), ...(basis ? { basisUrl: basis.url } : {}) });
      if (res.left != null) setAi((cur) => ({ ...cur, left: res.left }));
      // (stopped meanwhile: the sheet was still made and counted, so the chat shows it anyway)
      return [{ sheet: { ...res.sheet, brief: step.brief, developed: [], logoUrl: res.sheet.logoUrl || logoUrl || null, ...(logoUrls ? { logoUrls: res.sheet.logoUrls || logoUrls } : {}) } }];
    } catch (err) {
      return [botSays(err.response?.data?.message || "The concept sheet couldn’t be made just now."), { failed: true }];
    }
  };
  // picked concepts → their artwork pieces from the sheet; the first pick goes on the tee, the others wait with Add to tee
  const developPicks = async (step, progress, run) => {
    if (!ai.available) return [botSays("Pictures can’t be made right now."), chipRow(["Open the art library", "Upload a picture"])];
    const sheets = sheetsFromChat(chat);
    const picks = (step.picks || []).slice(0, 3);
    const out = [];
    let els = elements;
    let focus = null;
    let first = true;
    const placed = {};
    // the pictures left today, kept up to date between concepts (each piece is one picture; 16 Nov 2026)
    let leftNow = ai.left == null ? null : Number(ai.left);
    for (const n of picks) {
      if (run?.stopped) break;
      const found = findConcept(sheets, n);
      if (!found) {
        out.push(botSays(`I don’t have a concept ${n} yet. Tap a number on the sheet, or ask for designs first.`));
        continue;
      }
      if (leftNow === 0) {
        out.push(botSays(`You’ve made today’s pictures, so I couldn’t make concept ${n}. They come back tomorrow.`));
        break;
      }
      const { sheet, concept } = found;
      const pieces = (step.pieces || piecesOf(concept)).filter((pc) => concept[pc]);
      if (!pieces.length) {
        // "the back of 3" when concept 3 has no back print
        const has = piecesOf(concept);
        out.push(botSays(`Concept ${n} “${concept.title}” has no ${andList(step.pieces || [])} print — it has ${has.length ? `only the ${andList(has)}` : "nothing to print"}. Say “the ${has[0] || "front"} of ${n}”, or pick another concept.`));
        continue;
      }
      if (leftNow != null && leftNow < pieces.length) {
        out.push(botSays(`Concept ${n} has ${pieces.length} pieces (${andList(pieces)}) — that’s ${pieces.length} pictures, and you have ${leftNow} left today. Ask for just ${leftNow === 1 ? "one piece" : `${leftNow} of them`}, like “the ${pieces[0]} of ${n}”, or come back tomorrow.`));
        break;
      }
      const areasFor = {};
      const ratios = {};
      const used = [...new Set(els.map((e) => e.position))].filter((k) => !aiPlaced[k]);
      const hints = {};
      for (const pc of pieces) {
        hints[pc] = placementHint(concept[pc], positions); // "small left-chest badge" → the chest area, small; "nape logo" → Back Neck
        const pos = pieceArea(pc, positions, used, hints[pc]);
        if (!pos) continue;
        areasFor[pc] = pos;
        const { W, H } = areaPx(pos);
        ratios[pc] = W / H;
      }
      progress?.({ label: `Making concept ${n} — ${concept.title}${step.change ? ` (${step.change})` : ""}…`, expect: 30, hint: `${pieces.map((pc) => areasFor[pc]?.label || pc).join(" · ")}. Drawn from the sheet, usually 20–40 seconds.` });
      let res;
      try {
        res = await aiService.develop({ sheetUrl: sheet.url, n, concept, pieces, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratios, ...(sheet.logoUrls?.length > 1 ? { logoUrls: sheet.logoUrls } : sheet.logoUrl ? { logoUrl: sheet.logoUrl } : {}), ...(step.change ? { change: step.change } : {}) });
      } catch (err) {
        out.push(botSays(err.response?.data?.message || `Concept ${n} couldn’t be made just now.`));
        continue;
      }
      if (res.left != null) {
        leftNow = res.left;
        setAi((cur) => ({ ...cur, left: res.left }));
      }
      res.pieces.forEach((pc) => {
        aiCuts.current.set(pc.url, { path: pc.url, w: pc.width, h: pc.height });
        loadImage(pc.url).catch(() => {});
      });
      setChat((m) => m.map((x) => (x.sheet?.url === sheet.url ? { ...x, sheet: { ...x.sheet, developed: [...new Set([...(x.sheet.developed || []), n])] } } : x)));
      if (run?.stopped) {
        out.push({ designs: res.pieces.map((pc) => pc.url) });
        break;
      }
      if (first) {
        const replaced = [];
        for (const pc of res.pieces) {
          const pos = areasFor[pc.piece];
          if (!pos) continue;
          const el = shrinkForHint(aiElement(pos, { path: pc.url, w: pc.width, h: pc.height }, els.length + 1), pos, hints[pc.piece]);
          const old = aiPlaced[pos.key]?.elId;
          if (old && els.some((e) => e.id === old)) replaced.push(pos.label);
          els = [...els.filter((e) => e.id !== old), el];
          placed[pos.key] = { url: pc.url, elId: el.id };
          focus = focus || pos.key;
        }
        const redrawn = res.pieces.filter((pc) => pc.redrawn?.length);
        out.push(
          botSays(
            `Concept ${n} “${concept.title}” is on your tee${res.pieces.length > 1 ? ` — ${andList(res.pieces.map((pc) => areasFor[pc.piece]?.label || pc.piece))}` : ""}.` +
              (replaced.length ? ` It took the place of the earlier print on ${andList(replaced)} — press Undo (↶) to bring that back, or say “put the old one on the back”.` : " Tell me what to change, or press Undo (↶).") +
              (redrawn.length ? ` (I checked the spelling and drew the ${andList(redrawn.map((pc) => areasFor[pc.piece]?.label || pc.piece))} again so ${andList(redrawn.flatMap((pc) => pc.redrawn).map((w) => `“${w}”`))} reads right.)` : ""),
          ),
        );
        // the price, said once, when the first picture lands (a picture print adds a set amount per tee)
        const addOn = Number(ai.designAddOnInr ?? 100);
        if (!hasPictureOn && addOn > 0 && garment?.basePrice > 0 && res.pieces.some((pc) => areasFor[pc.piece])) out.push(botSays(`Price: ₹${garment.basePrice} → ₹${garment.basePrice + addOn} — a picture print adds ₹${addOn} once per tee, however many pictures you put on it.`));
        first = false;
      } else out.push(botSays(`Concept ${n} “${concept.title}” — tap Add to tee on a piece to use it.`));
      out.push({ designs: res.pieces.map((pc) => pc.url) });
      if (res.failed?.length) out.push(botSays(`The ${andList(res.failed)} piece${res.failed.length === 1 ? "" : "s"} of concept ${n} couldn’t be drawn.`));
    }
    if (els !== elements) commit((now) => (now === elements ? els : mergeAiChanges(now, elements, els)));
    if (Object.keys(placed).length) setAiPlaced((cur) => ({ ...cur, ...placed }));
    if (focus && focus !== active) openArea(focus, { force: true });
    setSelectedId(null);
    // (which areas got a print just now — the chips after the steps look at it; the chat shows nothing for it)
    if (Object.keys(placed).length) out.push({ placedOn: Object.keys(placed) });
    return out;
  };
  // A companion piece drawn from the picture already on the tee (round 5, 8 Nov 2026): "make a matching back".
  const matchPiece = async (step, progress, run) => {
    if (!ai.available) return [botSays("Pictures can’t be made right now."), chipRow(["Open the art library", "Upload a picture"])];
    if (ai.left === 0) return [botSays("You’ve made today’s pictures. They come back tomorrow — I can still help with words and layout.")];
    const from = aiPictureOnTee(elements, positions);
    if (!from) return [botSays("Put a picture on the tee first — then I can draw a matching piece from it. Or tell me the idea and I’ll show three concepts."), chipRow(["Show me 3 options"])];
    const used = [...new Set(elements.map((e) => e.position))].filter((k) => !aiPlaced[k]);
    const pos = pieceArea(step.piece, positions, used);
    if (!pos) return [botSays(`This tee has no ${step.piece} print area.`)];
    const { W, H } = areaPx(pos);
    progress?.({ label: `Drawing a matching ${pos.label}…`, expect: 30, hint: `From the picture on ${from.label}. Usually 20–40 seconds.` });
    let res;
    try {
      res = await aiService.match({ fromUrl: from.url, fromLabel: from.label, piece: step.piece, brief: step.brief, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: W / H });
    } catch (err) {
      return [botSays(err.response?.data?.message || "The matching piece couldn’t be made just now."), { failed: true }];
    }
    if (res.left != null) setAi((cur) => ({ ...cur, left: res.left }));
    const pc = res.piece;
    aiCuts.current.set(pc.url, { path: pc.url, w: pc.width, h: pc.height });
    loadImage(pc.url).catch(() => {});
    if (run?.stopped) return [{ designs: [pc.url] }];
    const el = aiElement(pos, { path: pc.url, w: pc.width, h: pc.height }, elements.length + 1);
    const old = aiPlaced[pos.key]?.elId;
    const els = [...elements.filter((e) => e.id !== old), el];
    commit((now) => (now === elements ? els : mergeAiChanges(now, elements, els)));
    setAiPlaced((cur) => ({ ...cur, [pos.key]: { url: pc.url, elId: el.id } }));
    if (pos.key !== active) openArea(pos.key, { force: true });
    setSelectedId(null);
    return [
      botSays(`A matching ${pos.label} is on your tee, drawn from the picture on ${from.label}.${old && elements.some((e) => e.id === old) ? " It took the place of the earlier print there — press Undo (↶) to bring that back." : ""} Tell me what to change.`),
      { designs: [pc.url] },
      { placedOn: [pos.key] },
    ];
  };
  // A pasted team list, or the brain's team step: one tee per player. It is ADDED to the players already entered
  // (the same name and number twice is skipped), so a second list can't wipe the first.
  const addPlayers = (list) => {
    setPlayers((cur) => {
      const kept = cur.filter(filled);
      const key = (p) => `${String(p.name || "").trim().toLowerCase()}|${String(p.number || "").trim()}`;
      const seen = new Set(kept.map(key));
      const fresh = list.filter((p) => !seen.has(key(p)) && seen.add(key(p)));
      return [...kept, ...fresh.map((p) => ({ id: makeId(), ...p }))].slice(0, MAX_PLAYERS);
    });
    return setTeam(true);
  };
  // The brain's team step (round 7, 8 Nov 2026): "Arun 7, Priya 10, Karthik" → a name slot (and a number slot) on
  // the tee if there is none yet, and one tee per person.
  const setupTeam = (step) => {
    let els = elementsRef.current;
    const first = step.players[0] || {};
    const ensureRole = (role, piece, sample) => {
      if (els.some((e) => e.type === "text" && e.role === role)) return;
      const pos = pieceArea(piece, positions, []) || positions.find((p) => p.main) || positions[0];
      if (!pos) return;
      const base = { type: "text", text: sample, fontFamily: "Anton", fontSizePct: role === "number" ? 24 : 11, color: inkDefault, align: "center", effect: "straight", x: 50, y: role === "number" ? 28 : 64, width: 0, height: 0, role };
      els = [...els, { id: makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: els.length + 1, ...textBox(base, pos) }];
    };
    ensureRole("name", step.namesOn || "back", String(first.name || "NAME").toUpperCase());
    const numbers = Boolean(step.numbersOn) && step.players.some((p) => p.number);
    if (numbers) ensureRole("number", step.numbersOn, String(first.number || "7"));
    if (els !== elementsRef.current) commit(els);
    addPlayers(step.players.map((p) => ({ name: String(p.name || "").slice(0, NAME_MAX), number: String(p.number || "").slice(0, NUMBER_MAX), size: p.size && sizes.includes(p.size) ? p.size : sizeNow })));
    const who = step.players.slice(0, 4).map((p) => p.name || p.number).filter(Boolean);
    return [
      botSays(`${step.players.length} tee${step.players.length === 1 ? "" : "s"}, one each: ${andList(who)}${step.players.length > 4 ? " and more" : ""}. The name goes on the ${step.namesOn || "back"}${numbers ? ` and the number on the ${step.numbersOn}` : ""} — tell me if you'd like them elsewhere, bigger or in another colour. In Review, tap a player to see their tee.`),
      chipRow(["Continue to review", "Make the names bigger"]),
    ];
  };
  // Round 8, the group link: the friends' answers become tees. With names: one tee each (their own size).
  const groupTeam = (entries) => {
    const list = playersFromEntries(entries, sizes, sizeNow);
    if (!list.length) return [botSays("Nobody has answered yet. Check again when your friends have filled it in.")];
    return setupTeam({ players: list, namesOn: "back", numbersOn: list.some((p) => p.number) ? "back" : null });
  };
  // ... or only how many of each size (no names on the tee)
  const groupSizes = (entries) => {
    if (teamMode) return [botSays("This tee has a name on it, so every friend gets their own tee. Tap “Fill my tees with their names” instead.")];
    const { qtys: counted, skipped } = qtysFromEntries(entries, sizes);
    const order = sizes.filter((sz) => counted[sz]);
    const total = order.reduce((sum, sz) => sum + counted[sz], 0);
    if (!total) return [botSays("There are no sizes to set yet. Check again when your friends have filled it in.")];
    setQtys(counted);
    return [
      botSays(`Set for Review: ${order.map((sz) => `${counted[sz]} × ${sz}`).join(", ")}. That is ${total} tee${total === 1 ? "" : "s"}.${skipped ? ` ${skipped} answer${skipped === 1 ? " has" : "s have"} a size this tee doesn’t come in, so I left ${skipped === 1 ? "it" : "them"} out.` : ""} You can still change the numbers in Review.`),
      chipRow(["Continue to review"]),
    ];
  };
  // Browse ideas (round 7): the concept sheets the admin featured, as a starting point
  const loadIdeas = async () => {
    try {
      const res = await aiService.ideas();
      // none ticked yet (Admin → AI settings → Browse ideas): ways to start instead of a dead end (round 9, 13 Nov 2026)
      if (!res.ideas?.length) return [botSays("Here are a few ways to start. Tap one, or tell me your idea in your own words."), { chips: [STARTER_CHIP, ...suggestionsFor()], smart: true }];
      return [{ browse: res.ideas }];
    } catch {
      return [botSays("The ideas couldn’t be loaded just now. Tell me what you want and I’ll show three concepts.")];
    }
  };
  const startFromIdea = (idea) => {
    const sheet = ideaSheet(idea, nextConceptNumber(sheetsFromChat(chat)));
    setChat((m) => [...m.map((x) => (x.browse ? { ...x, done: true } : x)), { from: "me", text: `Start from “${idea.brief || sheet.concepts.map((c) => c.title).join(", ")}”` }, { sheet }, botSays("Here they are in your chat. Tap a number to make one on your tee, or say what to change — “2 but with my cafe’s name”.")]);
  };
  // Versions (round 7): after an AI change the tee as it is now is kept with a small picture; "Go back to this" restores it
  // (128 px wide, 13 Nov 2026: shown at 64 px; a long chat keeps 40 of them, so half the size counts)
  const shrinkDataUrl = (src, width = 128) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = Math.round((img.height / img.width) * width);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  const versionMessage = async (label) => {
    let thumb = null;
    try {
      const m = await captureMockups();
      thumb = m?.front ? await shrinkDataUrl(m.front) : null;
    } catch {
      /* no picture then */
    }
    const n = chat.filter((x) => x.version).length + 1;
    return { version: { n, label: String(label || "A change").slice(0, 80), elements: elementsRef.current, colour: colour?.slug || null, thumb } };
  };
  const restoreVersion = (v) => {
    if (!Array.isArray(v?.elements)) return;
    commit(v.elements);
    setAiPlaced((cur) => Object.fromEntries(Object.entries(cur).filter(([, p]) => v.elements.some((e) => e.id === p.elId))));
    setSelectedId(null);
    say(`Back to version ${v.n}.`);
  };
  // "Ask the IDENTEE team to finish it" (round 6, 8 Nov 2026): the customer's line, the tee as it is, the last part of
  // the chat and a picture of the front go to the team (Admin → Design Studio → Help requests)
  const askTeam = async (a) => {
    if (!isLoggedIn()) {
      goToLogin();
      return [];
    }
    let mockup = null;
    try {
      mockup = (await captureMockups())?.front || null;
    } catch {
      /* no picture then */
    }
    const chatLines = chat
      .filter((m) => m.from && typeof m.text === "string")
      .slice(-30)
      .map((m) => ({ who: m.from === "me" ? "customer" : "assistant", text: m.text }));
    try {
      await aiService.help({
        note: a.note,
        garment: type,
        colour: colour?.slug || "",
        size: sizeNow,
        design: { elements, positions: positions.map((p) => ({ key: p.key, label: p.label, side: p.side })) },
        chat: chatLines,
        ...(mockup ? { mockup } : {}),
      });
      return [botSays("Sent to the IDENTEE team. One of our designers will look at your tee and this chat and get in touch on WhatsApp, usually within a day. Your tee stays saved here meanwhile.")];
    } catch (err) {
      return [botSays(err.response?.data?.message || "That didn’t send. Please try again in a moment."), { failed: true }];
    }
  };
  // The print, in plain words (round 6): every print's size, how sharp a picture will be, how tall the letters are
  const printLines = () =>
    elements
      .map((el) => {
        const pos = positions.find((p) => p.key === el.position);
        if (!pos) return null;
        const { wCm, hCm } = areaPx(pos);
        if (el.type === "image") {
          const printCm = ((el.width || 0) / 100) * wCm;
          const sharp = el.pxW ? printSharpness(el.pxW, printCm, ai.available) : null;
          const dpi = sharp ? sharp.printed : null;
          // (15 Nov 2026: "soft" follows the same rule as the design check — see designCheck.js)
          const how = dpi == null ? "" : sharp.soft ? " — may look soft" : dpi >= 150 ? " — sharp" : " — prints fine";
          // a soft photo shows its OWN dpi (as the editor's label does): "may look soft (242 dpi)" — the dpi after the
          // 4× enlarging — read as a contradiction (15 Nov 2026 browser check)
          const shown = sharp?.soft ? sharp.now : dpi;
          return `${pos.label}: picture ${printCm.toFixed(0)} cm wide${how}${shown != null ? ` (${Math.round(shown)} dpi)` : ""}`;
        }
        if (el.type === "text") {
          const mm = Math.round((((el.fontSizePct || 0) / 100) * hCm) * 10);
          return `${pos.label}: “${String(el.text || "").replace(/\s+/g, " ").trim().slice(0, 24)}” — letters about ${mm} mm tall`;
        }
        return null;
      })
      .filter(Boolean);
  // Edit the tee by chat: the text AI suggests changes, aiOps checks and applies them (one Undo step).
  // progress(now): tells the assistant's wait card what is happening now (drawing the pictures asked for)
  const chatEdit = async (a, progress, run) => {
    try {
      const res = await aiService.edit({
        message: a.message,
        design: describeDesign({ elements, positions, active, selectedId, fonts: FONTS, teeName: colour?.name || "", teeColours: colours.map((c) => c.name), areaPx, whereOf }),
      });
      if (run?.stopped) return []; // stopped while the AI was thinking: nothing changes
      const all = Array.isArray(res.ops) ? res.ops : [];
      if (!all.length) return [botSays(res.reply || "I’m not sure what to change. Tell me which item, and what to do with it."), chipRow(["What can you do?", "Something else"])];

      // 1. the tee's own colour
      let tee = colour;
      let changed = 0;
      const colourOp = all.find((o) => o?.op === "set_tee_colour");
      const wanted = colourOp && colours.find((c) => c.name.toLowerCase() === String(colourOp.colour || "").toLowerCase());
      // (the colour itself changes at the end, with everything else — so Stop leaves the tee as it was)
      const newTee = wanted && wanted.slug !== colour?.slug ? wanted : null;
      if (newTee) {
        tee = newTee;
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
      else if (pictures.length && !isLoggedIn()) extra.push(botSays("Log in and I’ll draw the pictures for you."), chipRow(["Log in", "Something else"]));
      else if (pictures.length && !a.draw) {
        // Nothing is drawn yet (client, 20 Oct 2026): the pictures go in the plan card, each with the print area
        // the AI chose (changeable there), and one style — drawn only when the customer taps Draw (act "drawPlan").
        const used = [...new Set(els.map((e) => e.position))];
        const items = [];
        for (const pic of pictures) {
          const pos = areaFor(pic.area, positions, [...used, ...items.map((x) => x.areaKey).filter(Boolean)]);
          items.push({ subject: pic.subject.trim().slice(0, PROMPT_MAX), areaKey: pos?.key || null });
        }
        const suggested = pictures.map((p) => p.style).find((x) => ai.styles.includes(x));
        const style = styleIn(a.message, ai.styles) || suggested || ai.styles[0];
        extra.push(
          botSays(`Here’s what I’ll make on your ${(tee?.name || "").toLowerCase()} ${garment?.label || "tee"}. Check where each one goes and pick a style, then tap Draw. Nothing is drawn until then.`),
          { plan: { items, style } },
        );
      } else {
        if (pictures.length) {
          // one after the other, about 20–40 seconds each
          progress?.({ label: pictures.length > 1 ? `Drawing ${pictures.length} pictures…` : "Drawing your picture…", expect: 25 * pictures.length, hint: `Usually 20–40 seconds${pictures.length > 1 ? " for each" : ""}. You can look around the room meanwhile.` });
        }
        for (const pic of pictures) {
          if (run?.stopped) return []; // stopped between pictures: nothing is put on the tee
          const used = [...new Set(els.map((e) => e.position))];
          // that area, or the biggest free one on the same side (e.g. "the back" on a crop top with only Top Back)
          const pos = areaFor(pic.area, positions, used);
          if (!pos) {
            extra.push(botSays(`There’s no free print area for ${pic.subject.slice(0, 80)} on this ${garment?.label || "garment"}. Remove a print, or ask for it somewhere else.`));
            continue;
          }
          const { W, H } = areaPx(pos);
          try {
            const made = await aiService.design({ subject: pic.subject.slice(0, PROMPT_MAX), style: ai.styles.includes(pic.style) ? pic.style : ai.styles[0], teeColour: tee?.name || "white", teeIsDark: lum(tee?.hex || fabricHex) < 0.55, ratio: W / H, count: 2 });
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
              { retry: { type: "generate", subject: pic.subject.slice(0, PROMPT_MAX), style: ai.styles.includes(pic.style) ? pic.style : ai.styles[0], areaKey: pos.key } },
            );
            break;
          }
        }
      }
      if (leftOut.length && ai.available && isLoggedIn()) {
        const names = leftOut.map((o) => `${o.subject.trim()}${positions.find((p) => p.key === o.area) ? ` on ${positions.find((p) => p.key === o.area).label}` : ""}`).join(", ");
        extra.push(botSays(`I can draw up to three pictures from one message, so I left out: ${names}. Ask me for ${leftOut.length === 1 ? "it" : "them"} in your next message and I’ll add ${leftOut.length === 1 ? "it" : "them"}.`));
      }
      if (run?.stopped) return [];
      if (newTee) changeColour(newTee.slug);
      if (!changed && !extra.length) return [botSays("I couldn’t do that one. Tap the item on the print area and tell me again, or use its settings."), chipRow(["What can you do?", "Something else"])];
      // the customer may have edited by hand while the chat worked: their edits stay, the chat's are added on top
      if (els !== elements) commit((now) => (now === elements ? els : mergeAiChanges(now, elements, els)));
      if (Object.keys(placed).length) setAiPlaced((cur) => ({ ...cur, ...placed }));
      if (focus && focus !== active) openArea(focus, { force: true });
      setSelectedId(null);
      // The text AI writes its reply ("I've added a picture of…") before the picture is drawn. When the picture
      // could not be made, that reply would be untrue, so only what really happened is said.
      if (!changed) return extra;
      if (extra.some((x) => x.plan)) return [botSays("I’ve made the other changes. Not right? Press Undo (↶)."), ...extra];
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
    const ready = await openPhoto(file, "Getting your photo ready…"); // a damaged file is refused, a big photo made smaller
    if (!ready) return;
    setBusy("Uploading your photo…");
    const res = await dispatch(uploadDesignImage(ready.file));
    setBusy("");
    if (!uploadDesignImage.fulfilled.match(res)) return say(res.payload || "Upload failed. Please try again.");
    setChatState((st) => ({ ...st, photoUrl: res.payload.path, wait: "photoStyle", backTo: "photo" }));
    setChat((m) => [...m.map((x) => (x.chips ? { ...x, done: true } : x)), botSays("Got it. Which style?"), chipRow([...ai.photoStyles, BACK])]);
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
  // Draw on the chat's plan card: each picture is drawn for its print area, one after the other, and put on the tee
  // (one Undo step for all). The other versions stay in the chat with Add to tee; "Try another" makes one more.
  const drawPlan = async (a, progress, run) => {
    const items = (a.items || []).filter((x) => String(x.subject || "").trim()).slice(0, 3);
    if (!items.length) return [botSays("There’s nothing to draw yet. Tell me what you’d like."), chipRow(["Make a design", "Something else"])];
    if (!ai.available) return [botSays("Pictures can’t be made right now. You can pick from the art library or upload your own."), chipRow(["Open the art library", "Upload a picture"])];
    if (!isLoggedIn()) return [botSays("Log in and I’ll draw it for you. Your design stays here."), chipRow(["Log in", "Something else"])];
    const style = ai.styles.includes(a.style) ? a.style : ai.styles[0];
    let els = elements;
    let focus = null;
    let left = null;
    let failed = false;
    const placed = {};
    const out = [];
    // The print area for each picture first (each a different free one), then all of them are drawn AT THE SAME
    // TIME — one after another, two pictures took twice as long (about 25 s each).
    const used = [...new Set(els.map((e) => e.position))];
    const jobs = [];
    for (const item of items) {
      // the chosen area, or (if something covers it) the biggest free one on the same side; never one an earlier
      // picture of this plan got
      const want = item.areaKey || positions.find((p) => p.side === "front" && p.main)?.key;
      const taken = [...used.filter((k) => !(aiPlaced[k] && k === want)), ...jobs.map((j) => j.pos?.key).filter(Boolean)];
      jobs.push({ item, pos: areaFor(want, positions, taken) });
    }
    for (const j of jobs.filter((x) => !x.pos)) out.push(botSays(`There’s no free print area left for ${j.item.subject.slice(0, 80)}. Remove a print, or pick another area.`));
    // (drawn together, so only as many as the pictures left today — the rest is said, never dropped quietly)
    const drawable = jobs.filter((j) => j.pos);
    const drawNow = ai.left == null ? drawable : drawable.slice(0, Math.max(0, ai.left));
    const later = drawable.slice(drawNow.length);
    if (drawNow.length > 1) progress?.({ label: `Drawing ${drawNow.length} pictures at the same time…`, expect: 30, hint: "Usually 20–40 seconds for all of them. You can look around the room meanwhile." });
    const results = await Promise.allSettled(
      drawNow.map(({ item, pos }) => {
        const { W, H } = areaPx(pos);
        // lettering for a tall, thin area: one long line, turned on its side on the tee
        const banner = style === "Hand lettering" && H / W >= 2.5;
        return aiService.design({ subject: item.subject.slice(0, PROMPT_MAX), style, teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: banner ? H / W : W / H, ...(banner ? { banner: true } : {}) });
      }),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      r.value.images.forEach((im) => {
        aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
        loadImage(im.url).catch(() => {});
      });
      // (the lowest count is the latest: each request was counted)
      if (r.value.left != null) left = left == null ? r.value.left : Math.min(left, r.value.left);
    }
    if (left != null) setAi((cur) => ({ ...cur, left }));
    if (run?.stopped) {
      const urls = results.flatMap((r) => (r.status === "fulfilled" ? r.value.images.map((im) => im.url) : []));
      return urls.length ? [{ designs: urls }] : [];
    }
    const missed = [];
    let why = "";
    results.forEach((r, i) => {
      const { item, pos } = drawNow[i];
      if (r.status !== "fulfilled") {
        missed.push(item);
        why = why || r.reason?.response?.data?.message || "The design maker had a problem.";
        return;
      }
      const made = r.value;
      const first = made.images[0];
      const el = aiElement(pos, { path: first.url, w: first.width, h: first.height }, els.length + 1);
      // it replaces a picture the chat put on that area before
      const old = aiPlaced[pos.key]?.elId;
      els = [...els.filter((e) => e.id !== old), el];
      placed[pos.key] = { url: first.url, elId: el.id };
      focus = focus || pos.key;
      out.push(
        botSays(`${pos.label}: ${(item.label || item.subject).slice(0, 120)}${pos.key !== item.areaKey && item.areaKey ? " (its area was taken, so I used this one)" : ""}.`),
        // again: one more version for this area (shown here, not put on the tee until Add to tee)
        { designs: made.images.map((im) => im.url), again: { type: "generate", subject: item.subject.slice(0, PROMPT_MAX), style, areaKey: pos.key } },
      );
    });
    if (missed.length) {
      failed = true;
      out.push(botSays(missed.length < drawNow.length ? `${why} The other picture${drawNow.length - missed.length === 1 ? " is" : "s are"} on your tee.` : why), { retry: { type: "drawPlan", items: missed, style } });
    }
    if (later.length) out.push(botSays(`You’ve made today’s pictures, so I didn’t draw ${andList(later.map((j) => j.pos.label))}. They come back tomorrow.`));
    if (run?.stopped) return [];
    if (els !== elements) commit((now) => (now === elements ? els : mergeAiChanges(now, elements, els)));
    if (Object.keys(placed).length) setAiPlaced((cur) => ({ ...cur, ...placed }));
    if (focus && focus !== active) openArea(focus, { force: true });
    setSelectedId(null);
    const count = Object.keys(placed).length;
    const leftText = left == null ? "" : ` ${left} request${left === 1 ? "" : "s"} left today.`;
    const head = count ? [botSays(`Done — ${count === 1 ? "it’s" : "they’re"} on your tee.${leftText} Tap Add to tee on another version to swap, Change to adjust one, or press Undo (↶).`)] : [];
    return [...head, ...out, ...(failed ? [] : [chipRow(["Check my design", "Something else"])])];
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
  // (17 Nov 2026, the owner: a picture on Full Back could not be moved to Centre Back — "Move or copy to…" didn't offer
  // it, as Centre Back overlaps Full Back, which only that same picture was using) the areas a picture leaves when it is
  // MOVED: those holding this AI picture and nothing else; the overlap check leaves them out.
  const usedIfMoved = (url) => {
    const leaves = Object.entries(aiPlaced)
      .filter(([key, put]) => put.url === url && elements.some((e) => e.id === put.elId) && elements.every((e) => e.position !== key || e.id === put.elId))
      .map(([key]) => key);
    return usedKeys.filter((k) => !leaves.includes(k));
  };
  const placeAiDesign = async (url, areaKey, { move = false } = {}) => {
    const pos = positions.find((p) => p.key === (areaKey || active)) || ensureArea();
    if (!pos || busy) return;
    const used = move ? usedIfMoved(url) : usedKeys;
    const blockedBy = used.includes(pos.key) ? [] : blockersOf(pos.key, positions, used);
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
      // move: the customer chose to move it (not keep it on both) — it comes off its other areas in the same Undo step
      const from = move ? Object.entries(aiPlaced).filter(([key, put]) => key !== pos.key && put.url === url && elements.some((e) => e.id === put.elId)) : [];
      const gone = [old, ...from.map(([, put]) => put.elId)];
      commit((prev) => [...prev.filter((e) => !gone.includes(e.id)), el]);
      // (the moved-from areas stay in aiPlaced: aiOn skips pictures no longer on the tee, and after Undo they are tracked again)
      setAiPlaced((cur) => ({ ...cur, [pos.key]: { url, elId: el.id } }));
      if (pos.key !== active) openArea(pos.key, { force: true });
      setSelectedId(null);
      const fromLabels = from.map(([key]) => positions.find((p) => p.key === key)?.label || key).join(" and ");
      say(from.length ? `Moved from ${fromLabels} to ${pos.label}.` : old ? `Replaced the design on ${pos.label}.` : `Added to ${pos.label}.`);
      return true; // (the Photo Studio marks the picture as "on the tee")
    } catch {
      say("The design could not be added. Please try again.");
    } finally {
      setBusy("");
    }
  };
  /* ---------- My pictures (23 Oct 2026): a picture made or uploaded before, put on a print area again ---------- */
  // "Where should it go?" (PlaceSheet): every print area of this tee, grouped like "Where to print", each free,
  // with a design (what it has), or covered by another print (which one)
  const placeGroups = () => {
    const areas = positions.filter((p) => spots[p.key]);
    const said = (key) => {
      const on = elements.filter((e) => e.position === key);
      const text = on.find((e) => e.type === "text" && e.text)?.text;
      if (on.length > 1) return `${on.length} items`;
      return text ? `“${text.length > 14 ? `${text.slice(0, 13)}…` : text}”` : "a picture";
    };
    return AREA_GROUPS.map(([group, sides]) => [
      group,
      listOrder(areas.filter((p) => sides.includes(p.side)))
        .map((p) => {
          const { wCm, hCm } = areaPx(p);
          const blockers = usedKeys.includes(p.key) ? [] : blockersOf(p.key, positions, usedKeys).map((b) => b.label);
          const big = wCm * hCm >= 900;
          return {
            key: p.key,
            label: p.label,
            // (a print in a free place says where it is: "40 cm below the collar seam, centred" — its size is in the row)
            where: p.hint || (p.spot ? whereOf(p).replace(/^[^,]*, /, "") : ""),
            cm: [Math.round(wCm), Math.round(hCm)],
            state: usedKeys.includes(p.key) ? "used" : blockers.length ? "blocked" : "free",
            has: usedKeys.includes(p.key) ? said(p.key) : "",
            blockers,
            // (an area with its own words on where it is — "One line of words across the chest" — needs no size hint;
            // "small, for a logo" would contradict a words strip and repeat "Small logo on the left chest")
            hint: p.spot ? "" : big && p.main ? "best for big pictures" : !p.hint && wCm * hCm <= 200 ? "small, for a logo" : "",
          };
        }),
    ]).filter(([, list]) => list.length);
  };
  // replace: what the area has comes off in the same Undo step
  const placeMyPicture = async (key, replace) => {
    const pic = placePic;
    const pos = positions.find((p) => p.key === key);
    if (!pic || !pos) return;
    setPlacePic(null);
    try {
      let { width: w, height: h } = pic;
      if (!w || !h) {
        const img = await loadImage(pic.url);
        w = img.naturalWidth;
        h = img.naturalHeight;
      }
      const el = { id: makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: elements.length + 1, ...imageEl(pos, pic.url, w, h) };
      commit((prev) => [...(replace ? prev.filter((e) => e.position !== pos.key) : prev), el]);
      if (pos.key !== active) openArea(pos.key, { force: true });
      setSelectedId(el.id);
      say(replace ? `Replaced what was on ${pos.label}.` : `Added to ${pos.label}.`, { label: "Undo", onClick: undo });
    } catch {
      say("That picture couldn’t be loaded. Please try again.");
    }
  };
  const forgetMyPicture = async () => {
    const pic = placePic;
    setPlacePic(null);
    try {
      await myPicturesService.remove(pic.id);
      window.dispatchEvent(new Event(PICTURES_CHANGED)); // (the open lists load again)
      say("Taken off My pictures.");
    } catch {
      say("Couldn’t take it off just now. Please try again.");
    }
  };
  // where each AI design is on the tee right now (a removed or replaced one drops out)
  const aiOn = {};
  for (const [key, put] of Object.entries(aiPlaced)) {
    if (!elements.some((e) => e.id === put.elId)) continue;
    (aiOn[put.url] ||= []).push(positions.find((p) => p.key === key)?.label || key);
  }
  // "Adjust on tee" on a picture in the chat: it is opened on its print area and selected, so its settings show
  // (size, position, turn, flip, remove background, sharper, duplicate, delete). The chat stays: Assistant brings it back.
  const adjustAiDesign = (url) => {
    const hit = Object.entries(aiPlaced).find(([, put]) => put.url === url && elements.some((e) => e.id === put.elId));
    if (!hit) return say("That picture isn’t on the tee any more. Tap Add to tee to put it back.");
    const [key, put] = hit;
    setAssist(false);
    openArea(key, { force: true });
    setSelectedId(put.elId);
  };
  // The same picture (already cut out — in aiCuts) on several print areas at once ("full back and left chest"), in one
  // Undo step. An area that overlaps another print (or one chosen just before it) is left out. Returns the areas used.
  const placeOnAreas = (url, keys) => {
    const cut = aiCuts.current.get(url);
    if (!cut) return [];
    const taken = [...usedKeys];
    const done = [];
    const els = [];
    const gone = [];
    for (const key of keys) {
      const pos = positions.find((p) => p.key === key);
      if (!pos || done.some((d) => d.key === key)) continue;
      if (!taken.includes(key) && blockersOf(key, positions, taken).length) continue;
      const el = aiElement(pos, cut, elements.length + els.length + 1);
      if (aiPlaced[key]?.elId) gone.push(aiPlaced[key].elId); // (it replaces the picture the chat put there before)
      els.push(el);
      done.push(pos);
      if (!taken.includes(key)) taken.push(key);
    }
    if (!els.length) return [];
    commit((prev) => [...prev.filter((e) => !gone.includes(e.id)), ...els]);
    setAiPlaced((cur) => ({ ...cur, ...Object.fromEntries(done.map((p, i) => [p.key, { url, elId: els[i].id }])) }));
    if (done[0].key !== active) openArea(done[0].key, { force: true });
    setSelectedId(null);
    return done;
  };
  // "Remove from tee" on a picture in the chat: takes it off every area it is on (one Undo step), the picture stays in the chat
  const removeAiDesign = (url) => {
    const on = Object.entries(aiPlaced).filter(([, put]) => put.url === url && elements.some((e) => e.id === put.elId));
    if (!on.length) return;
    const ids = on.map(([, put]) => put.elId);
    commit((prev) => prev.filter((e) => !ids.includes(e.id)));
    // (aiPlaced keeps the entries: aiOn skips pictures no longer on the tee, and after Undo they are tracked again)
    setSelectedId(null);
    say(`Removed from ${on.map(([key]) => positions.find((p) => p.key === key)?.label || key).join(" and ")}. It’s still in the chat if you want it back.`);
  };

  /* ---------- the Photo Studio ---------- */
  // the print area its results go on: the open one, else the front's main area
  const photoTarget = activePos || positions.find((p) => p.side === "front" && p.main) || positions.find((p) => p.side === "front") || positions[0] || null;
  // The AI panel is the chat. The ways in that used to open the Draw / Photo pages (home "Describe it" and
  // "Your photo", the "Your photo" start card, the Upload tab) open it at the right question instead:
  //   "draw"  → "What should I draw?"        "photo" → "Send me a photo with 📎…" (and 📎 lights up)
  const [photoNudge, setPhotoNudge] = useState(0);
  // My pictures (23 Oct 2026): the picture tapped, waiting for "Where should it go?" (PlaceSheet)
  const [placePic, setPlacePic] = useState(null);
  const openAiTab = (tab) => {
    setAiTab("chat");
    setAssist(true);
    setAreasOpen(false);
    if (tab === "draw") setChatAuto("Make a design");
    if (tab === "photo") {
      setChat((m) => [
        ...m.map((x) => (x.chips ? { ...x, done: true } : x)),
        botSays("Send me a photo with the 📎 button below, and tell me what you want — for example “only the design from this tee”, “my photo on the back” or “my dog as a cartoon”."),
      ]);
      setPhotoNudge((n) => n + 1);
    }
  };
  const toggleAiTab = () => (assist ? setAssist(false) : openAiTab("chat"));
  const openPhotoStudio = () => openAiTab("photo");
  const aiFailed = (err, fallback) => new Error(err?.response?.data?.message || fallback);
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
      if (out.needsServer) {
        // a photo: our server's model cuts it out (free) — the phone does no heavy work
        const done = await aiService.removeBg({ url: cur.url });
        cur = { url: done.url, w: done.width, h: done.height };
        cut = true;
      } else if (!out.already) {
        progress("Saving the cut-out…");
        const res = await dispatch(uploadDesignImage(new File([out.blob], "photo-cut-out.png", { type: "image/png" })));
        if (!uploadDesignImage.fulfilled.match(res)) throw new Error(res.payload || "The cut-out couldn’t be saved. Check the internet connection.");
        cur = { url: res.payload.path, w: out.width, h: out.height };
        cut = true;
      }
    }
    return { ...cur, enhanced, cut };
  };
  // "Improve my idea" (in the chat): the text AI makes the idea clear and says what will be drawn,
  // suggesting a style and one of the free print areas (with its real size now). Free — no picture request.
  const improveIdea = async (idea) => {
    const free = positions.filter((p) => usedKeys.includes(p.key) || !blockersOf(p.key, positions, usedKeys).length);
    try {
      return await aiService.improve({
        idea,
        teeColour: colour?.name || "white",
        teeIsDark: lum(fabricHex) < 0.55,
        areas: free.map((p) => ({ key: p.key, label: p.label, side: p.side, cm: areaCm(p, sizeNow), ...(p.spot ? { where: whereOf(p) } : {}) })),
      });
    } catch (err) {
      throw aiFailed(err, "I couldn’t improve that just now. Try again, or draw it with your own words.");
    }
  };
  // the same in the chat: the preview, then the plan card (and Use my own words / Change my idea — never a dead end)
  const chatImprove = async (a, run) => {
    try {
      const got = await improveIdea(a.idea);
      if (run?.stopped) return [];
      // the print area it will be drawn for, shown in the card and changeable there: the one the customer named,
      // else the AI's suggestion, else the open area, else the main front area (only areas that are free)
      const freeKey = (k) => k && positions.some((p) => p.key === k && (usedKeys.includes(k) || !blockersOf(k, positions, usedKeys).length));
      const area = [a.areaKey, got.area, active].find(freeKey) || positions.find((p) => p.side === "front" && p.main && freeKey(p.key))?.key || positions.find((p) => freeKey(p.key))?.key || null;
      const style = ai.styles.includes(got.style) ? got.style : ai.styles[0];
      // more than one picture ("Naruto on the front and Ben 10 on the back"): each gets its own area — the one the
      // AI read for it if free and not taken by an earlier one, else the next free main area
      if (got.pictures?.length > 1) {
        const taken = [];
        const pics = got.pictures.map((p) => {
          const ok = (k) => freeKey(k) && !taken.includes(k);
          const key = [p.area].find(ok) || positions.find((x) => x.main && ok(x.key))?.key || positions.find((x) => ok(x.key))?.key || null;
          if (key) taken.push(key);
          return { ...p, areaKey: key, areaLabel: positions.find((x) => x.key === key)?.label };
        });
        setChatState((st) => ({ ...st, idea: { ...(st.idea || { subject: a.idea, areaKey: a.areaKey }), improved: { ...got, area: pics[0].areaKey, pictures: pics } } }));
        return [
          botSays(`Here’s your idea, made clear: ${pics.length} pictures, one for each place. Check where each goes and the style in the plan, then tap Draw.`),
          ...pics.map((p) => ({ preview: { prompt: p.prompt, expect: p.expect, areaLabel: p.areaLabel, fixed: true } })),
          { plan: { items: pics.map((p) => ({ subject: p.prompt, areaKey: p.areaKey })), style } },
          chipRow([DRAW_MINE, CHANGE_IDEA, "Something else"]),
        ];
      }
      const res = { ...got, area };
      setChatState((st) => ({ ...st, idea: { ...(st.idea || { subject: a.idea, areaKey: a.areaKey }), improved: res } }));
      // (the card under it is where the print area and the style are chosen, so the preview just says what you'll get)
      return [
        botSays("Here’s your idea, made clear. Check where it goes and the style in the plan, then tap Draw."),
        { preview: { prompt: res.prompt, expect: res.expect } },
        { plan: { items: [{ subject: res.prompt, areaKey: area }], style } },
        chipRow([DRAW_MINE, CHANGE_IDEA, "Something else"]),
      ];
    } catch (err) {
      return [botSays(err.message), chipRow([DRAW_MINE, "Something else"])];
    }
  };
  // 📎 in the chat: the photo is uploaded (the phone already made it small enough), then the customer chooses
  const chatPhoto = async (a) => {
    if (!isLoggedIn()) return [botSays("Log in to send a photo. Your design stays here while you log in."), chipRow(["Log in", "Something else"])];
    const res = await dispatch(uploadDesignImage(a.file));
    if (!uploadDesignImage.fulfilled.match(res)) return [botSays(res.payload || "The photo didn’t send. Check the internet connection, then tap 📎 and try again.")];
    return photoArrived({ url: res.payload.path, w: a.w, h: a.h }, a.text);
  };
  // one photo uploaded: what happens next (17 Nov 2026: also when only one of several photos got through)
  const photoArrived = (photo, text) => {
    const a = { text };
    // Assistant v2 (round 2, 7 Nov 2026): the picture goes to the brain with the words — a logo for the concepts, or a
    // photo to redraw (the brain opens Photo to art). It stays on file in this chat as the customer's logo.
    if (ai?.v2) {
      setChatState((st) => ({ ...st, photosOpen: false, photo, logo: photo.url, photoUrl: null, wait: null, photoAreaKey: null, photoAreaKeys: [] }));
      return [{ photoSent: photo }, { next: { type: "assist", text: a.text || "I attached a picture — use it on my tee.", photo } }];
    }
    if (a.text) {
      setChatState((st) => ({ ...st, photosOpen: false, photo, photoUrl: null, wait: null, photoAreaKey: null, photoAreaKeys: [] }));
      // (the photo goes along with the next step: the chat's memory isn't updated yet when it starts, so reading
      // it from there said "I don't have your photo any more" the first time a photo was sent with words)
      return [{ photoSent: photo }, { next: { type: "photoUnderstand", text: a.text, photo } }];
    }
    setChatState((st) => ({ ...st, photosOpen: false, photo, photoUrl: null, wait: "photoWhat", photoAreaKey: null, photoAreaKeys: [] }));
    return [{ photoSent: photo }, botSays("Got your photo. Tell me what you want in your own words — for example “only the design from this tee” or “my photo on the back”. Or tap one:"), chipRow([...PHOTO_CHOICES, "Something else"])];
  };
  // (17 Nov 2026) several photos in one message: each uploaded (the phone already made each small enough), then the
  // Assistant v2 brain looks at all of them with the words (it plans, mixes them into a sheet, or asks). Without the
  // brain the free rules (multiPhoto.photosFromWords) make the plan. Nothing is made until the customer taps Make.
  const chatPhotos = async (a) => {
    if (!isLoggedIn()) return [botSays("Log in to send photos. Your design stays here while you log in."), chipRow(["Log in", "Something else"])];
    const photos = [];
    let missed = 0;
    let why = "";
    for (const f of a.files || []) {
      const res = await dispatch(uploadDesignImage(f.file));
      if (uploadDesignImage.fulfilled.match(res)) photos.push({ url: res.payload.path, w: f.w, h: f.h });
      else {
        missed += 1;
        why = why || res.payload || "";
      }
    }
    if (!photos.length) return [botSays(why || "The photos didn’t send. Check the internet connection, then tap 📎 and try again.")];
    const note = missed ? [botSays(`${missed} of your photos didn’t send${why ? ` (${String(why).replace(/\.$/, "")})` : ""}, so I’m going on with the other ${photos.length === 1 ? "one" : photos.length}.`)] : [];
    // only one got through: the one-photo way, exactly as before
    if (photos.length === 1) return [{ photosSent: photos }, ...note, ...photoArrived(photos[0], a.text).filter((x) => !x.photoSent)];
    if (ai?.v2) {
      setChatState((st) => ({ ...st, photos, photosOpen: true, photoUrl: null, wait: null, photoAreaKey: null, photoAreaKeys: [] }));
      return [{ photosSent: photos }, ...note, { next: { type: "assist", text: a.text || noWordsLine(photos.length), photos } }];
    }
    setChatState((st) => ({ ...st, photos, photosOpen: false, photoUrl: null, wait: null }));
    return [{ photosSent: photos }, ...note, ...photosByRules(a.text, photos)];
  };
  // the free rules' plan for several photos (the brain off or resting); mixing them needs the brain's concept sheet
  const photosByRules = (text, photos) => {
    const opts = { areas: assistantCtx().areas, photoStyles: ai.photoStyles || [] };
    const got = photosFromWords(text, photos.length, opts);
    if (got.mix) return [botSays("Mixing photos into one design needs the smart Assistant, which is resting just now. Here’s each photo on its own place instead — free:"), ...photosPlanMsgs(photosFromWords("", photos.length, opts).items, photos, true)];
    return photosPlanMsgs(got.items, photos);
  };
  // the plan card for several photos: each its own print area (free, not overlapping one given to an earlier photo),
  // what it uses of today's pictures — said plainly first when it is more than what is left
  const photosPlanMsgs = (items, photos, quiet = false) => {
    const fits = (k, taken) => !taken.includes(k) && freeArea(k) && !blockersOf(k, positions, taken).length;
    const plan = planPhotos({ items, photos, areas: assistantCtx().areas, fits, styles: ai.styles, photoStyles: ai.photoStyles || [] });
    if (!plan.items.length) return [botSays("I couldn’t tell which photos to use. Tell me in a few words, like “the first on the front, the second on the back”.")];
    const tight = plan.need > 0 && ai.left != null && plan.need > ai.left;
    const intro = tight ? limitLine(plan.need, ai.left) : `Here’s my plan for your ${photos.length} photos. Check each one, then tap Make.`;
    return [...(quiet && !tight ? [] : [botSays(intro)]), { photosPlan: { items: plan.items } }];
  };
  // "Make all" on that plan: the pictures (copy, art, a new design) are made at the same time, the free photos one by
  // one (each background removed on our server); each is made and put on its areas as "Make it" does for one photo.
  // Checked first: never more pictures than are left today.
  const chatPhotosMake = async (a, progress, run) => {
    const items = (a.items || []).filter((x) => !x.skip && x.photo?.url);
    if (!items.length) return [botSays("There’s nothing to make — choose at least one photo in the plan.")];
    if (!isLoggedIn()) return [botSays("Log in and I’ll make it. Your design stays here."), chipRow(["Log in", "Something else"])];
    const need = picturesNeeded(items);
    if (need && !ai.available) return [botSays("Pictures can’t be made right now. The photos themselves (free) still work — switch those rows to “The photo” in a new plan."), chipRow(["Something else"])];
    if (need && ai.left != null && need > ai.left) return [botSays(limitLine(need, ai.left)), chipRow(["Something else"])];
    const done = new Map();
    // (a row that didn't work gets its own Try again — never the whole plan again, which would make the others twice)
    const tidy = (it, msgs) => msgs.filter((m) => !m.chips).map((m) => (m.failed ? { retry: makeActFor(it) } : m));
    const paid = items.filter((x) => pictureCost(x));
    if (paid.length) progress?.({ label: `Making ${paid.length} picture${paid.length === 1 ? "" : "s"} at the same time…`, expect: 35, hint: "Usually 20–40 seconds for all of them." });
    const made = await Promise.all(paid.map((it) => chatPhotoMake(makeActFor(it)).catch(() => [{ failed: true }])));
    paid.forEach((it, i) => done.set(it, tidy(it, made[i])));
    const free = items.filter((x) => !pictureCost(x));
    for (const [i, it] of free.entries()) {
      if (run?.stopped) break;
      const of = free.length > 1 ? ` (${i + 1} of ${free.length})` : "";
      done.set(it, tidy(it, await chatPhotoMake(makeActFor(it), (w) => progress?.({ ...w, label: `${String(w.label || "Working").replace(/…$/, "")}${of}…` })).catch(() => [{ failed: true }])));
    }
    setChatState((st) => ({ ...st, photosOpen: false }));
    return [...items.flatMap((it) => done.get(it) || []), chipRow(["Check my design", "Something else"])];
  };
  // the photo's print area: the one named, if free — else the open one, else the main front area, else any free one
  const freeArea = (k) => k && positions.some((p) => p.key === k && (usedKeys.includes(k) || !blockersOf(k, positions, usedKeys).length));
  const photoArea = (k) => [k, active].find(freeArea) || positions.find((p) => p.side === "front" && p.main && freeArea(p.key))?.key || positions.find((p) => freeArea(p.key))?.key || null;
  // What the customer wants made from the photo: their words read with the photo by the text AI (when it can), and
  // by our own rules (free; also when the AI can't). Then the plan card — nothing is made or charged yet.
  const chatPhotoUnderstand = async (a, run) => {
    const photo = a.photo || chatState.photo;
    if (!photo) return [botSays("I don’t have your photo any more. Tap 📎 and send it again.")];
    // (with the other names customers use for each place, so "at the back of the neck" finds the Back Neck, not Full Back)
    const areas = assistantCtx().areas.map((x) => ({ ...x, aka: positions.find((p) => p.key === x.key)?.aka || [] }));
    let plan = a.job ? { job: a.job, areaKey: chatState.photoAreaKey || null, areaKeys: chatState.photoAreaKeys || [] } : photoJobFrom(a.text, { areas, photoStyles: ai.photoStyles || [] });
    // their words make the photo a reference ("a design like this", "in this style"): a new design, even if the photo
    // reading says copy — only clear words ("same design", "copy this") make a copy (23 Oct 2026)
    const wordsSayNew = !a.job && plan?.job === "inspired";
    let seen = "";
    let question = "";
    if (a.text && ai.available && ai.text && isLoggedIn()) {
      try {
        const r = await aiService.photoPlan({ photoUrl: photo.url, message: a.text, areas: areas.filter((x) => x.free).map(({ key, label, where }) => ({ key, label, ...(where ? { where } : {}) })) });
        seen = r.seen || "";
        if (r.job && r.job !== "unclear") {
          const job = wordsSayNew && r.job === "copy" ? "inspired" : r.job;
          plan = { ...(plan || {}), job, style: r.style || plan?.style || null, areaKey: r.area || plan?.areaKey || null, areaKeys: r.areas?.length ? r.areas : plan?.areaKeys || [], change: r.change || plan?.change || null, subject: r.subject || plan?.subject || null, design: r.design || null, words: r.words || [] };
        } else if (!plan) question = r.question || "";
      } catch {
        // the AI couldn't read it (off, out of credit, offline): our own rules decide, or we ask
      }
    }
    if (run?.stopped) return [];
    if (!plan) {
      // (the area they named is kept for the choice they make next)
      const named = areasFromWords(a.text, areas);
      setChatState((st) => ({ ...st, wait: "photoWhat", photoAreaKey: named[0] || st.photoAreaKey || null, photoAreaKeys: named.length ? named : st.photoAreaKeys || [] }));
      return [botSays(question || (seen ? `I see ${seen}. Should I copy just the design from it, or print the whole photo?` : "Should I copy just the design from this photo, or print the whole photo? Tell me, or tap one:")), chipRow([...PHOTO_CHOICES, "Something else"])];
    }
    const aiOk = ai.available && isLoggedIn() && ai.left !== 0;
    const artStyle = plan.style && (ai.photoStyles || []).includes(plan.style) ? plan.style : (ai.photoStyles || [])[0] || null;
    // "add this to my tee": the photo made print-ready (the photo reading turns it into "copy" when it is a printed
    // garment); a photo too small for the area gets "Make it sharper" ticked — shown on the card, with its cost
    const job = plan.job === "add" ? "photo" : plan.job;
    // every area named, each free and not overlapping the ones before it (else the main free area)
    const asked = (plan.areaKeys?.length ? plan.areaKeys : [plan.areaKey || chatState.photoAreaKey]).filter(Boolean);
    const areaKeys = [];
    for (const k of asked) if (freeArea(k) && !areaKeys.includes(k) && !blockersOf(k, positions, [...usedKeys, ...areaKeys]).length) areaKeys.push(k);
    if (!areaKeys.length && photoArea(null)) areaKeys.push(photoArea(asked[0] || null));
    const areaKey = areaKeys[0] || null;
    const pos = positions.find((p) => p.key === areaKey);
    const small = job === "photo" && aiOk && pos && printDpi(pos, photo.w, photo.h) < 150;
    const full = {
      job,
      photo,
      seen,
      areaKey,
      areaKeys,
      ready: plan.job === "add",
      sharpenWhy: small ? "small" : null,
      change: plan.job === "copy" ? plan.change || null : null,
      // (what the photo reading found in the design: given to the picture AI so the copy's words come out right)
      design: plan.design || null,
      words: plan.words || [],
      // (nothing new named: the photo's theme as new artwork, with their own words for anything else they said)
      subject: plan.job === "inspired" ? (plan.subject && plan.subject !== SAME_THEME ? plan.subject : a.text ? `${SAME_THEME} (the customer asked: “${a.text}”)` : SAME_THEME) : null,
      style: plan.job === "art" ? artStyle : plan.job === "inspired" ? (ai.styles.includes(plan.style) ? plan.style : styleIn(plan.subject || a.text, ai.styles) || ai.styles[0]) : null,
      cutOut: plan.cutOut !== false,
      enhance: Boolean(small),
    };
    const where = areaKeys.length ? ` for ${andList(areaKeys.map((k) => positions.find((p) => p.key === k)?.label))}` : "";
    return [botSays(plan.job === "add" ? `Here’s your photo, made print-ready${where}. Check it, then tap Make it.` : "Here’s my plan for your photo. Check it, then tap Make it."), { photoPlan: full }];
  };
  // "Make it" on the photo plan
  const chatPhotoMake = async (a, progress) => {
    // (17 Nov 2026) one of several photos carries its own photo; a single photo is the one on file in this chat
    const photo = a.photo || chatState.photo;
    if (!photo) return [botSays("I don’t have your photo any more. Tap 📎 and send it again.")];
    if (!isLoggedIn()) return [botSays("Log in and I’ll make it. Your design stays here."), chipRow(["Log in", "Something else"])];
    // every chosen area (the picture is made once, then put on each)
    const keys = (a.areaKeys?.length ? a.areaKeys : [a.areaKey || photoTarget?.key]).filter(Boolean);
    const pos = positions.find((p) => p.key === keys[0]) || photoTarget;
    if (!pos) return [botSays("This garment has no free print area. Remove a print first.")];
    const freeChoices = [PHOTO_CUT, PHOTO_AS_IS, "Something else"];
    const putOn = (url) => {
      const on = placeOnAreas(url, keys.length ? keys : [pos.key]);
      const missed = keys.filter((k) => !on.some((p) => p.key === k)).map((k) => positions.find((p) => p.key === k)?.label).filter(Boolean);
      return { on, where: andList(on.map((p) => p.label)), missed: missed.length ? ` (${andList(missed)} ${missed.length === 1 ? "is" : "are"} covered by another print, so I left ${missed.length === 1 ? "it" : "them"} out.)` : "" };
    };
    try {
      if (a.job === "photo") {
        const r = await studioPrintReady(photo, { cutOut: a.cutOut, enhance: a.enhance }, (t) => progress?.({ label: t, expect: 8 }));
        aiCuts.current.set(r.url, { path: r.url, w: r.w, h: r.h }); // (final already: put on as it is)
        const { on, where, missed } = putOn(r.url);
        if (!on.length) return [botSays("Those print areas are covered by another print. Use “Other area” under the photo to pick a free one."), { designs: [r.url], photo: true }];
        const how = a.cutOut ? (r.cut ? ", without its background" : " (it had no background to remove)") : "";
        const dpi = Math.min(...on.map((p) => printDpi(p, r.w, r.h)));
        const blurry = on.some((p) => printsBlurry(p, r.w, r.h));
        return [botSays(`Done — your photo is on ${where}${how}${r.enhanced ? ", made sharper" : ""}.${missed} ${blurry ? BLURRY_LINE : qualityLine(dpi)}`), { designs: [r.url], photo: true }, chipRow(["Check my design", "Something else"])];
      }
      const { W, H } = areaPx(pos);
      const tee = { teeColour: colour?.name || "white", teeIsDark: lum(fabricHex) < 0.55, ratio: W / H };
      const body = a.job === "copy" ? { copyUrl: photo.url, change: a.change || "", design: a.design || "", words: a.words || [] } : a.job === "inspired" ? { refUrl: photo.url, subject: a.subject, style: a.style } : { photoUrl: photo.url, artStyle: a.style };
      const res = await aiService.design({ ...body, ...tee });
      if (res.left != null) setAi((cur) => ({ ...cur, left: res.left }));
      res.images.forEach((im) => {
        aiCuts.current.set(im.url, { path: im.url, w: im.width, h: im.height });
        loadImage(im.url).catch(() => {});
      });
      const first = res.images[0];
      const placed = putOn(first.url);
      const onWhere = placed.where || pos.label;
      const left = res.left == null ? "" : ` ${res.left} request${res.left === 1 ? "" : "s"} left today.`;
      const said =
        a.job === "copy"
          ? `Here’s the design from your photo, on ${onWhere}.${placed.missed}${left} Not quite the same? Tap Try another, or Change to fix a part.`
          : a.job === "inspired"
            ? `Here’s your new design, on ${onWhere}.${placed.missed}${left}`
            : `Here’s your photo as ${String(a.style || "art").toLowerCase()}, on ${onWhere}.${placed.missed}${left}`;
      // (remembered for "Use my photo instead": the photo itself goes back on these same areas)
      setChatState((st) => ({ ...st, photoLastKeys: placed.on.map((p) => p.key) }));
      const after = a.job === "art" ? [PHOTO_REVERT, "Check my design", "Something else"] : ["Check my design", "Something else"];
      return [botSays(said), { designs: res.images.map((im) => im.url), again: { type: "photoMake", ...a } }, chipRow(after)];
    } catch (err) {
      const status = err?.response?.status;
      const why = err?.response?.data?.message;
      // never a dead end: what didn't work, in plain words, and what still works (the free choices)
      // (the photo itself, cut out: a 503 means the background remover can't run — say that, and offer it as it is)
      if (status === 503 && a.job === "photo" && why) return [botSays(why), chipRow([PHOTO_AS_IS, "Something else"])];
      if (status === 503) return [botSays("The design assistant is resting right now. You can still put your photo on as it is or without its background (free), add text, or pick from the art library."), chipRow(freeChoices)];
      if (status === 429) return [botSays(why || "You’ve made today’s pictures. They come back tomorrow."), chipRow(freeChoices)];
      if (status === 422) return [botSays(why || "The picture service refused this one."), chipRow(freeChoices)];
      return [botSays(why || err?.message || "That didn’t work just now."), { failed: true }];
    }
  };
  // how sharp a picture will print on an area: dots per inch at the size it is put on the tee (aiElement: 92% of the
  // area's width or height, whichever it meets first)
  const printDpi = (pos, w, h) => {
    const { wCm, hCm } = areaPx(pos);
    const widthCm = w / h > wCm / hCm ? 0.92 * wCm : 0.92 * hCm * (w / h);
    return widthCm > 0 ? w / (widthCm / 2.54) : 300;
  };
  // …and as it will be printed (the shop can enlarge a small picture before printing): what Review goes by. When
  // even that is too low, the Assistant says so at once — it used to say "a bit soft" about a photo that Review
  // then called blurry (12 Nov 2026).
  const printsBlurry = (pos, w, h) => {
    const { wCm, hCm } = areaPx(pos);
    const widthCm = w / h > wCm / hCm ? 0.92 * wCm : 0.92 * hCm * (w / h);
    return widthCm > 0 && printSharpness(w, widthCm, ai.available).soft;
  };
  // (15 Nov 2026: the same words and rule as the design check's small-photo note)
  const BLURRY_LINE = `${SMALL_PHOTO} Tap “Check my design” to make it smaller, or send a bigger photo.`;
  const qualityLine = (dpi) =>
    dpi >= 150 ? "It’s sharp, so it will print well." : dpi >= (ai.available ? SOFT_OWN_DPI : MIN_DPI) ? "It will print fine; a bigger photo would be even sharper." : "It’s a small photo, so it may print a bit soft. A bigger one will look sharper.";
  // "Put it on my tee as it is" / "Remove the background first" (both free; a photo is cut out on our server)
  const chatPhotoPlace = async (a, progress) => {
    const photo = chatState.photo;
    if (!photo) return [botSays("I don’t have your photo any more. Tap 📎 and send it again.")];
    const pos = positions.find((p) => p.key === photoArea(chatState.photoAreaKey)) || photoTarget;
    if (!pos) return [botSays("This garment has no free print area. Remove a print first.")];
    let r = { url: photo.url, w: photo.w, h: photo.h, cut: false };
    if (a.cutOut) {
      try {
        r = await studioPrintReady(photo, { cutOut: true }, (t) => progress?.({ label: t, expect: 8, hint: "Free. Usually a few seconds." }));
      } catch (err) {
        // the server's own words (not "Request failed with status code …"); when the remover can't run there at all
        // (503), trying again won't help — offer the photo as it is instead
        const why = err?.response?.data?.message || err.message || "The background couldn’t be removed. Try again, or put it on as it is.";
        if (err?.response?.status === 503) return [botSays(why), chipRow([PHOTO_AS_IS, "Something else"])];
        return [botSays(why), { failed: true }];
      }
    }
    aiCuts.current.set(r.url, { path: r.url, w: r.w, h: r.h });
    const want = (chatState.photoAreaKeys || []).filter(freeArea);
    const on = placeOnAreas(r.url, want.length ? want : [pos.key]);
    if (!on.length) return [botSays(`I couldn’t put it on ${pos.label}. Use “Other area” under the photo to pick a free one.`), { designs: [r.url], photo: true }];
    const how = a.cutOut ? (r.cut ? ", without its background" : " (it had no background to remove)") : "";
    return [
      botSays(`Done — your photo is on ${andList(on.map((p) => p.label))}${how}. ${on.some((p) => printsBlurry(p, r.w, r.h)) ? BLURRY_LINE : qualityLine(Math.min(...on.map((p) => printDpi(p, r.w, r.h))))}`),
      { designs: [r.url], photo: true },
      chipRow(a.cutOut ? ["Check my design", "Something else"] : [PHOTO_CUT, "Check my design", "Something else"]),
    ];
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
  // the home page's ways in, on entering the room: the idea to the assistant, or straight to a tool
  const startWith = () => {
    if (ideaLink) {
      openAiTab("chat");
      return setChatAuto(ideaLink);
    }
    if (startLink === "draw") return openAiTab("draw");
    if (["text", "upload", "art"].includes(startLink)) {
      startAdding();
      setAddTab(startLink);
    }
  };
  // the team page's way in: the Team jersey layout, then the assistant asks for the players
  // withAssistant: "Design with the Assistant" opens it; "Design it myself" doesn't (the editor opens on the layout,
  // and the assistant's note about the list is there if they open it later — or they fill the list in Review)
  const startTeam = (withAssistant = false) => {
    const tpl = TEMPLATES.find((t) => t.key === teamLink && t.team);
    if (tpl) applyTemplate(tpl.key, true);
    // what the list needs: a number only when the layout has one
    const numbers = !tpl || tpl.items.some((i) => i.role === "number");
    const list = numbers
      ? "send me your people as name, number and size, one per line or separated by commas, like this: Arun 7 L, Karthik 10 XL"
      : "send me your people as name and size, one per line, like this: Arun L";
    if (withAssistant) openAiTab("chat");
    setChat((m) => [
      ...m.map((x) => (x.chips ? { ...x, done: true } : x)),
      botSays(
        tpl
          ? `Your “${tpl.label}” layout is on the tee: ${tpl.says.split(". Ordering")[0].replace(/\.$/, "")}. Tap any text to change the words, font or colour, or add your logo. Then ${list}. Everyone gets their own tee. You can also fill the list in Review.`
          : `Your tee is blank: add your own words, logo or picture (Edit by hand → Add text or Upload), or tell me what you want. To give each person their own name or number, tap that text and use “Ordering for a team?” at the bottom of its settings. Then ${list}, or fill the list in Review.`,
      ),
      chipRow(tpl ? ["Continue to review", "Something else"] : ["Something else"]),
    ]);
  };
  const applyFix = (issue) => {
    // a fix for a whole print in a free place: its box, made again round its things, or two prints joined (panelModel.js)
    if (issue.spotFix) {
      // (an old card in the chat: the print may be gone — nothing to fix, and the card isn't marked fixed)
      const keys = issue.spotFix.keys || [issue.spotFix.key];
      if (!keys.every((k) => positions.some((p) => p.key === k) && elements.some((e) => e.position === k))) {
        setToast("That print isn’t on the tee any more.");
        return false;
      }
      commit((prev) => applySpotFix(prev, issue.spotFix, { positions, garment, size: sizeNow, maxPrint }));
      return true;
    }
    const pos = positions.find((p) => p.key === issue.position);
    commit((prev) => prev.map((e) => (e.id !== issue.elId ? e : issue.measure && pos ? textBox({ ...e, ...issue.patch }, pos) : { ...e, ...issue.patch })));
  };
  // run: { stopped } — the customer pressed Stop in the chat; nothing may change the tee after that
  const assistantAct = (a, progress, run) => {
    if (a.type === "generate") return generateDesigns(a);
    if (a.type === "slogans") return writeSlogans(a);
    if (a.type === "improve") return chatImprove(a, run);
    if (a.type === "drawPlan") return drawPlan(a, progress, run);
    if (a.type === "photo") return chatPhoto(a);
    if (a.type === "photos") return chatPhotos(a);
    if (a.type === "photosMake") return chatPhotosMake(a, progress, run);
    if (a.type === "photoUnderstand") return chatPhotoUnderstand(a, run);
    if (a.type === "photoMake") return chatPhotoMake(a, progress);
    if (a.type === "photoPlace") return chatPhotoPlace(a, progress);
    if (a.type === "edit") return chatEdit(a, progress, run);
    if (a.type === "smart") return chatSmart(a, progress, run);
    if (a.type === "assist") return chatAssist(a, progress, run);
    if (a.type === "help") return askTeam(a);
    if (a.type === "ideas") return loadIdeas();
    if (a.type === "useIdea") return startFromIdea(a.idea);
    if (a.type === "restore") return restoreVersion(a.version);
    if (a.type === "photoPick") return openPhotoStudio();
    if (a.type === "aiTab") {
      // (from chats saved before the Draw / Photo pages went: a drawing with words becomes its plan card)
      if (a.tab === "draw" && a.subject) return setChatAuto(`Draw ${a.subject}`);
      return openAiTab(a.tab);
    }
    if (a.type === "place") return placeAiDesign(a.url, a.areaKey, { move: !!a.move });
    if (a.type === "unplace") return removeAiDesign(a.url);
    if (a.type === "adjustPlaced") return adjustAiDesign(a.url);
    if (a.type === "login") return goToLogin();
    if (a.type === "mypic") return setPlacePic(a.picture);
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
    if (a.type === "players") return addPlayers(a.players);
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
    captureMockups().then((m) => {
      if (!m) return;
      setShots(SIDES.map(([v, label]) => ({ label, url: m[v] })));
      setLabelShot(m.label || null);
    });
  };

  // Pictures of each side (data URLs), taken from the 3D room without the editing outline.
  const captureMockups = async () => {
    await wait(450);
    for (let tries = 0; tries < 12 && !roomApi.current; tries++) await wait(300);
    const api = roomApi.current;
    if (!api) return null;
    // the tee itself may still be on its way (a reload straight into Review): wait for it, up to 20 s, so the
    // pictures are not of an empty stand (17 Nov 2026)
    for (let tries = 0; tries < 66 && api.ready && !api.ready(); tries++) await wait(300);
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
    // the neck label close up (13 Nov 2026) — for the cart and order pages; the print files never use it
    const label = api.snapshot("label"); // none when the tee has no label (the 3D view then has nothing to shoot)
    if (label) out.label = await cropMockup(label);
    return out;
  };

  // Back where they were after a reload or "Continue it" (13 Nov 2026): Review, or the print area that was open —
  // once the room is ready. Anything the customer does first wins: they stay where they are.
  const toReviewNow = useRef(null);
  const resuming = useRef(false); // Review is being put back (the Back steps wait for it)
  useEffect(() => {
    toReviewNow.current = toReview;
  });
  useEffect(() => {
    const r = resumeAt.current;
    // (the print areas first: a design with prints in free places has positions before they come)
    if (!r || !catalog.length || !positions.length || step !== "design") return undefined;
    // a saved design opened by its address is loaded again first (that load puts the room in Design)
    if (openId && isLoggedIn() && onScreenId.current !== openId) return undefined;
    resumeAt.current = null;
    if (r.step !== "review") {
      if (r.active && positions.some((p) => p.key === r.active)) openArea(r.active, { force: true });
      return undefined;
    }
    let alive = true;
    resuming.current = true;
    (async () => {
      try {
        for (let i = 0; i < 50 && !roomApi.current; i++) await wait(300); // (up to 15 s on a slow phone)
        // the pictures and letters drawn first, so Review's side pictures show the art
        await Promise.allSettled(imageSrcs(elementsRef.current).map((s) => loadImage(s)));
        await document.fonts?.ready;
        if (!alive || !elementsRef.current.length) return;
        if (roomApi.current) toReviewNow.current(true);
        else say("You were in Review.", { label: "Back to Review", onClick: () => toReviewNow.current(true) });
      } finally {
        resuming.current = false;
      }
    })();
    return () => {
      alive = false; // the customer changed something meanwhile: they stay where they are
    };
  }, [catalog.length, positions.length, step, active, elements]); // eslint-disable-line react-hooks/exhaustive-deps

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
      captureMockups().then((m) => {
        if (!alive || !m) return;
        setShots(SIDES.map(([v, label]) => ({ label, url: m[v] })));
        setLabelShot(m.label || null);
      });
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
        ? { ...Object.fromEntries(shots.map((sh, i) => [SIDES[i][0], sh.url])), ...(labelShot ? { label: labelShot } : {}) }
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
      chatDesign.current = saved._id;
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
  // Review: the neck label close up — the tee turns to the front and the camera looks down into the neck
  const showLabel = () => {
    setSpin(false);
    setSideShown("label");
    setCamRequest({ label: true, ms: 1100, n: nextReq() });
  };
  const turn360 = () => {
    setSpin(true);
    setSideShown(null);
    setCamRequest({ ...SHOWROOM, n: nextReq() });
  };
  const backToDesign = () => {
    setStep("design");
    setShots(null);
    setLabelShot(null);
    setCamRequest({ view: "front", n: nextReq() });
  };
  // a team order is one tee per player; otherwise the sizes × quantities picked
  // The top-left arrow: one step back, never straight out of the room (the design stays as it is).
  // out of the room: back to the page they came from (team page, home, a collection…). Opened straight from a
  // link (nothing to go back to): the team page for a team design, else Create your IDENTEE.
  const leaveRoom = () => {
    if (!sureToLeave()) return; // (a picture still being made: asked first, 13 Nov 2026)
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
  // Photo of it worn / Try it on me on every printed side (17 Nov 2026, the owner: "it must show all sides where the
  // prints are available"): the first side is made first and shown at once; the other sides are then asked for
  // together, each with the first photo as the person to keep (same person, place and light). Each photo is one of
  // today's pictures; with fewer left than sides, the first sides are made and the window says which were not.
  const wornSides = printedSides(elements);
  const wornBusy = worn === "making" || Boolean(worn?.photos?.some((p) => p.making));
  const wornSwipe = useRef(null);
  const wornShown = worn?.photos ? worn.photos[worn.at] || worn.photos[0] : null; // the side shown in the window
  const wornReady = worn?.photos ? worn.photos.filter((p) => p.url) : [];
  const wornGo = (i) => setWorn((cur) => (cur?.photos ? { ...cur, at: (i + cur.photos.length) % cur.photos.length } : cur));
  const closeWorn = () => {
    wornRun.current++;
    setWorn(null);
  };
  async function makeWornPhotos({ me = false, photo = null, backPhoto = null } = {}) {
    if (!shots?.[0]?.url) return;
    const { make, skipped } = planSides(wornSides, ai.left);
    if (!make.length) return say(costLine({ sides: wornSides, left: 0, daily: ai.dailyPerUser }));
    const run = ++wornRun.current;
    const shotOf = (side) => shots[SIDES.findIndex(([v]) => v === side)]?.url || shots[0].url;
    const base = { garment: garment?.label || "t-shirt", teeColour: colour?.name || "white" };
    const ask = (side, ref) =>
      me
        ? aiService.tryOn({ ...base, side, image: shotOf(side), ...(ref ? { ref } : { photo }), ...(side === "back" && backPhoto ? { backPhoto } : {}) })
        : aiService.worn({ ...base, side, image: shotOf(side), ...(ref ? { ref } : {}) });
    const why = (err) => err?.response?.data?.message || err?.message || "The photo couldn’t be made just now.";
    const keepLeft = (res) => res?.left != null && setAi((cur) => ({ ...cur, left: res.left }));
    const done = (res) => ({ url: res.url, from: res.from || "photo", making: false });
    setWorn("making");
    let first;
    try {
      first = await ask(make[0]);
    } catch (err) {
      if (run === wornRun.current) {
        setWorn(null);
        say(why(err));
      }
      return;
    }
    keepLeft(first);
    if (run !== wornRun.current) return;
    setWorn({ run, me, at: 0, note: skippedNote(skipped), photos: make.map((side, i) => ({ side, label: sideLabel(side), ...(i === 0 ? done(first) : { making: true }) })) });
    if (make.length < 2) return;
    const put = (side, patch) => setWorn((cur) => (cur?.run === run ? { ...cur, photos: cur.photos.map((p) => (p.side === side ? { ...p, ...patch } : p)) } : cur));
    await Promise.all(
      make.slice(1).map(async (side) => {
        try {
          put(side, done(await ask(side, first.url)));
        } catch (err) {
          put(side, { making: false, failed: why(err) });
        }
      }),
    );
    // (the sides were asked for together, so each answer's "left" may be one out: read it once more)
    aiService
      .status()
      .then((st) => st?.left != null && setAi((cur) => ({ ...cur, left: st.left })))
      .catch(() => {});
  }
  async function shareAllWorn() {
    const ready = (worn?.photos || []).filter((p) => p.url);
    try {
      const blob = await makeSideBySide(
        ready.map((p) => ({ src: imageUrl(p.url, 1200), label: p.label })),
        { title: `${garment?.label || "My tee"} · ${colour?.name || ""}`.trim() },
      );
      const how = await shareTee(blob, { text: `My ${garment?.label || "tee"} design on IDENTEE`, fileName: "my-identee-tee-worn-all.png" });
      if (how === "saved") say("The photos are saved as one picture — send it to whoever needs to say yes.");
    } catch (err) {
      say(err?.message || "The picture couldn’t be made just now.");
    }
  }
  // the browser's Back walks the room's own steps, like its ← button (17 Nov 2026: Back in the room went straight
  // to the garment list): Review → the design → colour & size. (Before the windows below: a window opened inside a
  // step sits on top of it, so Back closes the window first.)
  useBackClose(step !== "fit", () => stepBack());
  useBackClose(step === "review", () => backToDesign());
  // the browser's Back closes what is open on top of the room, like its × (16 Nov 2026): the colour & size menu,
  // the save box, the earlier chats, the photo of it worn — and on a phone the sheets that cover the tee
  // (where to print, the editor, the Assistant); on a laptop those are side panels and Back leaves them alone
  useBackClose(pickOpen, () => setPickOpen(false));
  useBackClose(saveOpen, () => setSaveOpen(false));
  useBackClose(chatsOpen, () => setChatsOpen(false));
  useBackClose(Boolean(worn?.photos), () => closeWorn());
  useBackClose(Boolean(tryOnAsk), () => setTryOnAsk(null));
  useBackClose(narrow && step === "design" && areasOpen, () => setAreasOpen(false));
  useBackClose(narrow && step === "design" && Boolean(activePos) && !assist, () => activePos && goView(activePos.side));
  useBackClose(narrow && step === "design" && assist, () => setAssist(false));

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
      const added = await customizationService.addDesignToCart(saved._id, chosen);
      dispatch(fetchCart(readJSON("userInfo")?.token));
      // how many pieces of this design the cart holds now: a second "Add to cart" ADDS to the first (12 Nov 2026:
      // the note said "1 piece" while the cart had 2)
      const inCart = (added?.cartItems || []).filter((c) => String(c.customization?._id || c.customization || "") === String(saved._id)).reduce((n, c) => n + (c.qty || 0), 0);
      setCartNote({ pieces, name: saved.name, inCart: Math.max(inCart, pieces) });
    } catch (err) {
      say(err.response?.data?.message || "Couldn't add to your cart. Please try again.");
    } finally {
      setBusy("");
    }
  };

  /* ---------- render ---------- */
  // Phones: the room must never slide out of place.
  // · The page behind the room can't scroll (a phone browser could otherwise scroll it a little, and the room's
  //   top bar — Back, size, price, Review — slid under the browser's address bar; seen on the live site, 21 Oct).
  // · The phone's keyboard covers the bottom of the screen without the page getting shorter, and slides the page
  //   up to show the box being typed in: while it is open the room is fitted into the part it leaves free (the
  //   chat box / the words stay in sight), and when it closes the page is put back at the top, so the top bar is
  //   where it belongs again (some phone browsers left the page slid up).
  // · 17 Nov 2026 (the owner's iPhone: the first tap on the Assistant's box was covered): measured again a few times
  //   while the keyboard slides up, after every tap on a box.
  const appRef = useRef(null);
  const ready = Boolean(garment);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dr-open");
    return () => root.classList.remove("dr-open");
  }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = appRef.current;
    if (!vv || !el) return undefined;
    const phone = window.matchMedia("(max-width: 760px)");
    let wasKeyboard = false;
    const backToTop = () => {
      if (window.scrollX || window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
    };
    const fit = () => {
      const keyboard = phone.matches && window.innerHeight - vv.height > 120;
      if (keyboard) {
        // (the room's own element, fitted again once the room is on screen: [ready] below)
        // eslint-disable-next-line react-hooks/immutability
        el.dataset.kb = "1";
        el.style.setProperty("--vv-top", `${vv.offsetTop}px`);
        el.style.setProperty("--vv-h", `${vv.height}px`);
      } else {
        delete el.dataset.kb;
        if (wasKeyboard) backToTop();
      }
      wasKeyboard = keyboard;
    };
    // a box was tapped (the keyboard is opening): measure again a few times while it slides up.
    // (17 Nov 2026, the owner's iPhone: the FIRST time the Assistant's box was tapped the keyboard covered it,
    // later taps were fine — the first keyboard of a visit comes up slower and the phone's screen size settles
    // after the one size change the page was told about, so the room was fitted to a stale size)
    let refits = [];
    const onFocusIn = (e) => {
      if (!phone.matches || !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || "")) return;
      refits.forEach(clearTimeout);
      refits = [0, 100, 250, 450, 700, 1000, 1500].map((ms) => setTimeout(fit, ms));
    };
    // a box lost the focus (the keyboard is closing): once it has gone, the page goes back to the top
    const onFocusOut = () => setTimeout(() => {
      const t = document.activeElement;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) backToTop();
    }, 120);
    fit();
    backToTop();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    window.addEventListener("resize", fit); // (the browser's own bars folding away when the keyboard comes up)
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("orientationchange", backToTop);
    return () => {
      refits.forEach(clearTimeout);
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("orientationchange", backToTop);
      delete el.dataset.kb;
    };
  }, [ready]); // (ready: the room is on screen — it isn't while the tee is still loading)

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
    // (phones: a little smaller, so the Words box and fonts show under it without scrolling)
    const maxH = narrow
      ? Math.min(tall ? 170 : 110, window.innerHeight * (tall ? 0.22 : 0.14))
      : Math.min(tall ? 230 : 170, window.innerHeight * (tall ? 0.3 : 0.22));
    return Math.round(Math.max(tall ? 40 : 110, Math.min(maxW, (maxH * W) / H)));
  })();

  return (
    <div className="dr-app" ref={appRef} data-step={step} data-lit={lit ? "1" : undefined} data-panel={panel ? "1" : undefined}>
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
                  {garment.sizeChart?.length > 0 && <FindSizeLink onClick={() => { setPickOpen(false); setFinder("pick"); }} />}
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
          <Link to="/my-designs" className="dr-mydesigns" onClick={(e) => !sureToLeave() && e.preventDefault()}>
            My designs
          </Link>
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
          <button type="button" className={`dr-aibtn${assist ? " on" : ""}`} aria-pressed={assist} onClick={() => toggleAiTab("chat")}>
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
                    // the side's main spot first, then the big prints, chest prints and strips, then the small hits
                    const list = listOrder(positions.filter((p) => sides.includes(p.side)));
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
                                className={`dr-area${active === p.key ? " on" : ""}${used ? " used" : ""}${blockedBy.length ? " blocked says-why" : ""}${hoverKey === p.key && active !== p.key ? " hot" : ""}`}
                                onMouseEnter={() => hoverCard(blockedBy.length ? null : p)}
                                onMouseLeave={() => hoverCard(null)}
                                onFocus={() => !blockedBy.length && setHoverKey(p.key)}
                                onBlur={() => setHoverKey(null)}
                                title={blockedBy.length ? `Overlaps ${blockedBy.map((b) => b.label).join(" and ")} — remove that design first` : `${p.label} · ${w} × ${h} cm${p.hint ? ` · ${p.hint}` : ""}`}
                                aria-label={`${p.label}, ${w} by ${h} cm${p.hint ? `, ${p.hint}` : ""}${used ? ", has a design" : ""}${blockedBy.length ? `, blocked by ${blockedBy.map((b) => b.label).join(" and ")}` : ""}`}
                                aria-disabled={blockedBy.length ? "true" : undefined}
                                aria-pressed={active === p.key}
                                onClick={() => pickAreaByHand(p.key)}
                              >
                                {/* one small tee per print area, with just that area's box — or, once it has a design, that design */}
                                <AreaThumb position={p} size={sizeNow} print={used ? thumbs[p.key] : null} fabric={fabricHex} />
                                {used && <span className="tick" aria-hidden="true">✓</span>}
                                <b>{p.label}</b>
                                {/* a covered card says which print it can't share the tee with (phones have no hover title); "+1" when
                                    more than one is in the way, so taking off the named one doesn't look like it failed */}
                                {blockedBy.length ? <span className="why">Not with {blockedBy[0].label}{blockedBy.length > 1 ? ` +${blockedBy.length - 1}` : ""}</span> : <span>{w}×{h} cm</span>}
                              </button>
                            );
                          })}
                          {/* free placement phase 3: a print anywhere on this side — the tee waits for a tap */}
                          {anywhereInfo && sides.some((sd) => panelSides.includes(sd)) && (
                            <button
                              type="button"
                              className={`dr-area dr-anycard${anyFull ? " blocked says-why" : ""}${anywhere ? " on" : ""}`}
                              aria-disabled={anyFull ? "true" : undefined}
                              aria-pressed={!!anywhere}
                              aria-label={anyFull ? `Anywhere on the tee: ${anywhereInfo.used} of ${anywhereInfo.max} free places used` : "Anywhere on the tee: tap where you want it"}
                              title={anyFull ? CAP_MSG : "Put a print anywhere on the tee: tap where you want it"}
                              onClick={() => (anyFull ? say(CAP_MSG) : startAnywhere(sides.find((sd) => panelSides.includes(sd))))}
                            >
                              <svg className="dr-thumb dr-anythumb" viewBox="0 -16 200 170" aria-hidden="true">
                                <path className="tee" d="M62 14 L84 6 Q100 12 116 6 L138 14 L186 46 L166 76 L150 66 L150 132 L50 132 L50 66 L34 76 L14 46 Z" />
                                <circle className="ring" cx="100" cy="70" r="22" />
                                <path className="plus" d="M100 56 V84 M86 70 H114" />
                              </svg>
                              <b>Anywhere on the tee</b>
                              {anyFull ? <span className="why">{anywhereInfo.used} of {anywhereInfo.max} used</span> : <span>Tap where you want it</span>}
                            </button>
                          )}
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
            <div className="dr-room" data-editing={active ? "1" : undefined} data-room={step === "review" ? "boutique" : "studio"} data-hot={hoverPos ? "1" : undefined} data-anywhere={anywhere ? "1" : undefined}>
              <Room3D
                ref={roomApi}
                model={model}
                colour={fabricHex}
                areas={areas3D}
                onPickArea={(k) => step === "design" && pickAreaByHand(k)}
                camRequest={camRequest}
                interactive={step === "design"}
                // (phones, 23 Oct 2026: the Assistant covers the tee when it is full-screen, so the tee stops redrawing every
                // frame behind it — it kept the phone busy and made the chat lag; with "Show the tee" it moves as before)
                still={!!active || (narrow && assist && !assistSmall)}
                hotspots={step === "design" ? hotspots : undefined}
                glowKey={step === "design" && !anywhere ? hoverKey : null}
                activeKey={active}
                tapMode={step === "design" && !!anywhere}
                onTapPoint={anywhereTap}
                onHoverArea={(k) => {
                  if (anywhere) return setHoverKey(null);
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
                neckLabel={neckLabel}
              />
              {step === "design" && anywhere && (
                <div className="dr-anybar" role="status">
                  <span>
                    <b>Tap the tee where you want your {anywhere.pic ? "picture" : "print"}</b> · drag to turn
                  </span>
                  <button type="button" onClick={() => setAnywhere(null)}>Cancel</button>
                </div>
              )}
            </div>
          )}
          {step === "design" && (
            <>
              <div className="dr-undo" role="group" aria-label="Undo and redo">
                <button type="button" onClick={undo} disabled={histSize.past === 0} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
                <button type="button" onClick={redo} disabled={histSize.future === 0} aria-label="Redo" title="Redo (Ctrl+Y)">↷</button>
                {/* phones: Save lives here (the top bar has no room for it); laptops have it in the top bar */}
                <button type="button" className="dr-undosave" onClick={() => (isLoggedIn() ? setSaveOpen((o) => !o) : goToLogin())} aria-expanded={saveOpen}>
                  {savedAt ? "Saved ✓" : "Save"}
                </button>
              </div>
              {hoverPos && !panel && !anywhere ? (
                <div className="dr-hotchip" role="status" key={hoverPos.key}>
                  <b>{hoverPos.label}</b>
                  <span>{areaCm(hoverPos, sizeNow).join(" × ")} cm</span>
                  <i>{usedKeys.includes(hoverPos.key) ? "Tap to edit" : "Tap to design here"}</i>
                </div>
              ) : (
                !active && !anywhere && <div className="dr-hint">Point at the tee and tap a spot to design there · drag to turn · scroll to zoom</div>
              )}
              {active && sel && !assist && !panel && (
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
                  {/* (no "Your photo" card here: photos start from the first screen, Upload a picture, or the Assistant's 📎) */}
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
                  {/* the free art library (cars, bikes…): on the first screen, so people know it's there */}
                  <button type="button" className="art" onClick={() => { startAdding(); setAddTab("art"); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v14H4zM8 13l3-3 5 5M15 9h.01" /></svg>
                    <b>Free designs</b>
                    <small>Cars, bikes and more</small>
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
                {neckLabel && (
                  <button type="button" onClick={goLabel} aria-label="Show the IDENTEE label sewn inside the neck">
                    Label
                  </button>
                )}
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
            <button type="button" className={`dr-toolbtn${assist ? " on" : ""}`} aria-pressed={assist} onClick={() => toggleAiTab("chat")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICON_AI} />
              </svg>
              Assistant
            </button>
          </nav>
        )}

        {step === "design" && assist && (
          // The AI panel: the chat (Assistant.jsx) — drawing, photos and changes all happen there
          <section className={`dr-editor dr-assist dr-ai tab-${aiTab}`} data-wide={assistWide ? "1" : undefined} data-small={assistSmall ? "1" : undefined} data-chats={chatsOpen ? "1" : undefined} aria-label="AI design">
            <header>
              <div>
                <div className="eyebrow">AI design</div>
                <h2>Tell me what you want</h2>
                <div className="sub">
                  {activePos ? `Working on ${activePos.label}. You can still change anything by hand.` : "Describe your tee, send a photo, or pick a starting point."}
                </div>
              </div>
              <div className="dr-assisthead">
                {/* earlier chats and New chat (ChatsPanel) */}
                <button type="button" className="dr-chatsbtn" aria-pressed={chatsOpen} aria-label="Your chats" title="Your chats and New chat" onClick={() => setChatsOpen((o) => !o)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h16v11H9l-5 4V5ZM8 9h8M8 12h5" />
                  </svg>
                  <span>Chats</span>
                </button>
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
                {/* phones: the tee shows above the chat — this turns it round (round 4, 8 Nov 2026) */}
                {assistSmall && (
                  <button type="button" className="dr-flip" title={flipSide === "front" ? "Show the back" : "Show the front"} aria-label={flipSide === "front" ? "Show the back of the tee" : "Show the front of the tee"} onClick={flipTee}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
                    </svg>
                    <span>{flipSide === "front" ? "Back" : "Front"}</span>
                  </button>
                )}
                {/* phones: full screen for the chat, or half so the tee shows above it */}
                <button type="button" className="dr-tall" aria-pressed={!assistSmall} onClick={toggleAssistSmall}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={assistSmall ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
                  </svg>
                  <span>{assistSmall ? "Make it big" : "Show the tee"}</span>
                </button>
                <button type="button" className="dr-x" aria-label="Close" onClick={() => setAssist(false)}>✕</button>
              </div>
            </header>
            <div className="dr-aipane">
              {chatsOpen && (
                <ChatsPanel
                  currentId={chatId}
                  saveNow={saveChatNow}
                  onOpen={openChat}
                  onNew={newChat}
                  onClose={() => setChatsOpen(false)}
                  about={chatAbout}
                  loggedIn={isLoggedIn()}
                  onLogin={goToLogin}
                  locked={aiWorking || Boolean(busy)}
                />
              )}
              <Assistant key={chatId} messages={chat} setMessages={setChat} state={chatState} setState={setChatState} ctx={assistantCtx} onAct={assistantAct} onFix={applyFix} onKeep={keepIssue} placed={aiOn} fabric={fabricHex} autoSay={chatAuto} onAutoSaid={() => setChatAuto("")} onWorking={setAiWorking} photoNudge={photoNudge} chatId={chatId} roomKey={type} working={aiWorking} />
              {elements.length > 0 && (
                <button type="button" className="dr-handoff" onClick={editByHand}>
                  Not quite right? Edit it by hand →
                </button>
              )}
            </div>
          </section>
        )}

        {step === "design" && (activePos || (panel && pView)) && !assist && (
          <section className={`dr-editor ${sel ? "is-editing" : "is-adding"}`} data-panel={panel && pView ? "1" : undefined} aria-label={panel && pView ? `Whole ${wholeWord(panel.side)}` : `Edit ${activePos.label}`}>
            {panel && pView ? (
              narrow ? (
                // phones: a full-height sheet — undo, redo, the side (or "Whole front" while zoomed in), Done
                <header className="dr-panelhead">
                  <button type="button" className="dr-panelicon" onClick={undo} disabled={histSize.past === 0} aria-label="Undo">↶</button>
                  <button type="button" className="dr-panelicon" onClick={redo} disabled={histSize.future === 0} aria-label="Redo">↷</button>
                  {panelZoomed ? (
                    <button type="button" className="dr-panelwhole" onClick={() => panelRef.current?.wholeSide()}>⤢ Whole {wholeWord(panel.side)}</button>
                  ) : (
                    <span className="dr-paneltitle">{PANEL_SIDES[panel.side]} · size {sizeNow}</span>
                  )}
                  <button type="button" className="dr-paneldone" onClick={closePanel}>Done ✓</button>
                </header>
              ) : (
                <header>
                  <div>
                    {/* (short words: "⤡ Just Left Chest" shares the line) */}
                    <div className="eyebrow">Whole {wholeWord(panel.side)}</div>
                    <h2>Drag anywhere</h2>
                    <div className="sub">{activePos?.side === panel.side ? `${activePos.label} · ${areaPx(activePos).wCm} × ${areaPx(activePos).hCm} cm · size ${sizeNow}` : `Size ${sizeNow}`}</div>
                  </div>
                  <div className="dr-headbtns">
                    {activePos && (
                      <button type="button" className="dr-wholebtn" onClick={closePanel} title={`Back to ${activePos.label} on its own (Esc)`}>⤡ Just {activePos.label}</button>
                    )}
                    <button type="button" className="dr-x" aria-label="Close editor" onClick={() => { setPanel(null); goView(panel.side); }}>✕</button>
                  </div>
                </header>
              )
            ) : (
              <header>
                <div>
                  <div className="eyebrow">Step 2 · {activePos.label}</div>
                  <h2>{sel ? (sel.type === "text" ? "Edit text" : "Edit picture") : "What to add"}</h2>
                  <div className="sub">
                    {areaPx(activePos).wCm} × {areaPx(activePos).hCm} cm at size {sizeNow}
                  </div>
                </div>
                <div className="dr-headbtns">
                  {/* free placement phase 3: the whole side, to drag the print anywhere */}
                  {panelSides.includes(activePos.side) && (
                    <button type="button" className="dr-wholebtn" onClick={() => openPanel(activePos.side)} title={`See the whole ${wholeWord(activePos.side)} and drag prints anywhere`}>⤢ Whole {wholeWord(activePos.side)}</button>
                  )}
                  <button type="button" className="dr-x" aria-label="Close editor" onClick={() => goView(activePos.side)}>✕</button>
                </div>
              </header>
            )}
            {panel && pView ? (
              <>
                {!narrow && (
                  <div className="dr-panelsides" role="tablist" aria-label="Side of the tee">
                    {panelSides.map((sd) => (
                      <button key={sd} type="button" role="tab" aria-selected={sd === panel.side} className={sd === panel.side ? "on" : ""} onClick={() => panelTo(sd)}>
                        {PANEL_SIDES[sd]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="dr-panelwrap">
                  <PanelEditor
                    ref={panelRef}
                    view={pView}
                    prints={pPrints}
                    frames={pFrames}
                    lines={pLines}
                    fabric={fabricHex}
                    selectedId={selectedId}
                    activeKey={active}
                    openBox={pOpenBox}
                    onSelect={panelSelect}
                    onDrop={panelDrop}
                    onLive={queueLive}
                    onNewHere={panelNewHere}
                    onHover={setHoverKey}
                    onEdit={(id) => {
                      panelSelect(id);
                      closePanel();
                    }}
                    onZoomed={setPanelZoomed}
                    nudged={nudged}
                    narrow={narrow}
                    cw={panel.cw}
                    ch={panel.ch}
                  >
                    {/* laptops: zoom sits on the canvas, over the hem (phones have it in their bottom bar) */}
                    {!narrow &&
                      (panelZoomed ? (
                        <button type="button" className="dr-panelzoom" onClick={() => panelRef.current?.wholeSide()}>⤢ Whole {wholeWord(panel.side)}</button>
                      ) : (
                        sel?.side === panel.side && (
                          <button type="button" className="dr-panelzoom" onClick={() => panelRef.current?.zoomToSelected()}>
                            Zoom in
                          </button>
                        )
                      ))}
                  </PanelEditor>
                </div>
              </>
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
                      // a print in a free place (phase 3): the moved thing is kept inside the safe zone the panel
                      // uses, then let go through the panel's own drop rule (together: it stays in this print), so
                      // its print — boxed round its things — is checked as on the panel: grown past the sleeve, the
                      // biggest print or into a print nearby, it goes back with the reason (or joins, with an Undo).
                      // A print area works exactly as before.
                      const changed = els.filter((e) => !elements.includes(e));
                      if (activePos.spot && panelSides.includes(activePos.side) && changed.length === 1) {
                        const out = dropThing(elements, keepInside(elements, changed[0], dropCtx()), { ...dropCtx(), together: true });
                        liveQueue.current = null;
                        setLive(null);
                        if (out.refused) {
                          // (it goes back: the editor and the 3D tee are drawn again from the design as it was)
                          lastSig.current.clear();
                          setElements((list) => list.slice());
                          return say(out.refused);
                        }
                        commit(out.elements);
                        if (out.key && out.key !== active) setActive(out.key);
                        return sayDrop(out);
                      }
                      if (activePos.spot && panelSides.includes(activePos.side)) els = els.map((e) => (elements.includes(e) ? e : keepInside(elements, e, dropCtx())));
                      liveQueue.current = null;
                      setLive(null);
                      commit((prev) => [...prev.filter((e) => e.position !== active), ...els]);
                    }}
                    onEdge={() => {
                      // (held against the edge: once a visit, the way out of the print area)
                      if (told.current.edge || !panelSides.includes(activePos.side)) return;
                      told.current.edge = true;
                      say(`Want it outside ${activePos.label}?`, { label: "Move anywhere →", onClick: () => openPanel(activePos.side) });
                    }}
                  />
                </div>
                <div className="dr-ruler" style={{ width: editorW }}>
                  <span>0</span>
                  <span>{areaPx(activePos).wCm} cm</span>
                </div>
              </>
            )}
            {panel && pView && narrow ? (
              // phones: the panel's own bar — the side tabs, the selected thing's tools, or what to put in a new print
              <div className="dr-panelbar" role="toolbar" aria-label={sel ? "The selected item" : "Panel"}>
                {sel ? (
                  <>
                    <button type="button" onClick={() => panelResize(1 / 1.1)}>Smaller</button>
                    <button type="button" onClick={() => panelResize(1.1)}>Bigger</button>
                    <button type="button" onClick={() => panelNudge({ centre: true })}>Centre</button>
                    <button type="button" onClick={() => panelRef.current?.zoomToSelected()}>Zoom in</button>
                    <button type="button" onClick={closePanel}>Edit</button>
                    <button type="button" className="del" onClick={removeSel}>Delete</button>
                  </>
                ) : openEmpty && activePos?.side === panel.side ? (
                  <>
                    <button type="button" onClick={() => addText("YOUR TEXT")}>Add text</button>
                    <button type="button" onClick={pickUpload}>Upload picture</button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddTab("art");
                        closePanel();
                      }}
                    >
                      Free designs
                    </button>
                  </>
                ) : (
                  panelSides.map((sd) => (
                    <button key={sd} type="button" aria-pressed={sd === panel.side} className={sd === panel.side ? "on" : ""} onClick={() => panelTo(sd)}>
                      {PANEL_SIDES[sd]}
                    </button>
                  ))
                )}
              </div>
            ) : panel && pView && (!activePos || activePos.side !== panel.side) ? (
              // laptops, the panel on a side with no print open: nothing to add to yet
              <p className="dr-empty dr-panelempty">Tap an empty part of the {PANEL_SIDES[panel.side].toLowerCase()} to start a new print there, or pick a print to move it.</p>
            ) : sel && activePos ? (
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
                onAddMore={(tab) => {
                  setAddTab(tab);
                  setSelectedId(null);
                }}
                canEnlarge={ai.available}
              />
            ) : (
              <>
                <div className="dr-addtabs" role="tablist" aria-label="What to add">
                  {ADD_TABS.map(([k, label, icon, badge]) => (
                    <button key={k} type="button" role="tab" aria-selected={addTab === k} className={`dr-addtab${addTab === k ? " on" : ""}`} onClick={() => setAddTab(k)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={icon} />
                      </svg>
                      {label}
                      {badge && <small>{badge}</small>}
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
                      <b>Send it to the assistant</b>
                      <span>Copy a design from a photo, remove the background, or turn it into art →</span>
                    </button>
                    <button type="button" className="dr-drop" onClick={pickUpload}>
                      <b>Upload a photo or logo</b>
                      <span>JPG, PNG or WebP · big photos are fine</span>
                    </button>
                    <p className="dr-empty">A print-quality check shows if a picture is too small to print sharp.</p>
                  </>
                )}

                {addTab === "art" && <ArtPanel categories={artCategories} onPick={pickArt} />}

                {addTab === "mine" && <MyPictures loggedIn={isLoggedIn()} onLogin={goToLogin} onPick={setPlacePic} />}

                </div>
              </>
            )}
          </section>
        )}

        {placePic && (
          <PlaceSheet
            picture={placePic}
            groups={placeGroups()}
            suggest={active}
            onPlace={placeMyPicture}
            onForget={forgetMyPicture}
            onClose={() => setPlacePic(null)}
            anywhere={anywhereInfo}
            onAnywhere={() => startAnywhere(activePos?.side || AREA_GROUPS.find(([t]) => t === areaTab)?.[1][0] || "front", placePic)}
          />
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
              {/* The print, in plain words (round 6, 8 Nov 2026): what prints where, how sharp, how big — and anything to fix */}
              {elements.length > 0 && (
                <div className="dr-printcheck" aria-label="Print check">
                  <div className="dr-printcheck-head">{designIssues().length ? "Before you order — worth a look" : "Print check: all good ✓"}</div>
                  <ul>
                    {printLines().map((line, i) => (
                      <li key={`${i}:${line}`}>{line}</li>
                    ))}
                    {lum(fabricHex) < 0.55 && elements.some((e) => e.type === "image") && <li>White parts of a picture print as white ink on this dark tee.</li>}
                  </ul>
                  {designIssues().map((issue) => (
                    <div key={issue.id} className="dr-printcheck-issue">
                      <span>{issue.text}</span>
                      <button type="button" className="dr-mini" onClick={() => applyFix(issue)}>{issue.fixLabel}</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Share my tee (round 3, 7 Nov 2026): front + back on one picture, to WhatsApp or saved — most group tees need someone else's yes first */}
              {shots?.length === 4 && shots[0]?.url && (
                <button
                  type="button"
                  className="dr-share"
                  disabled={sharing}
                  onClick={async () => {
                    // (17 Nov 2026, the owner: "make it share in WhatsApp") WhatsApp opens with a message and a link that
                    // shows the tee picture as its preview (services/shareService.js). The new tab is opened at once and
                    // pointed at WhatsApp when the link is ready: a phone blocks a tab opened after a wait.
                    const tab = window.open("", "_blank");
                    setSharing(true);
                    setWaLink("");
                    try {
                      const title = `${garment?.label || "My tee"} · ${colour?.name || ""}`.trim();
                      const blob = await makeShareCard({ front: shots[0].url, back: shots[1]?.url, title });
                      let link = null;
                      try {
                        link = await makeShareLink(blob, title);
                      } catch {
                        /* no connection to the server: the picture itself is shared instead (below) */
                      }
                      if (!link) {
                        tab?.close();
                        const how = await shareTee(blob, { text: `My ${garment?.label || "tee"} design on IDENTEE` });
                        if (how === "saved") say("The picture of your tee is saved — send it to whoever needs to say yes.");
                        return;
                      }
                      const url = whatsappUrl(shareMessage(garment?.label, link.page));
                      if (tab && !tab.closed) tab.location.href = url;
                      else setWaLink(url); // the browser blocked the new tab: a button to open it by hand
                    } catch (err) {
                      tab?.close();
                      say(err?.message || "The picture couldn’t be made just now.");
                    } finally {
                      setSharing(false);
                    }
                  }}
                >
                  {sharing ? "Making the link…" : "Share my tee on WhatsApp"}
                </button>
              )}
              {waLink && (
                <a className="dr-share alt" href={waLink} target="_blank" rel="noopener noreferrer" onClick={() => setWaLink("")}>
                  Open WhatsApp
                </a>
              )}
              {/* Email me this design (round 8, 11 Nov 2026): saved, then sent to their own address with a link back to it */}
              {shots?.length === 4 && shots[0]?.url && (
                <button
                  type="button"
                  className="dr-share alt"
                  disabled={emailing || !!busy}
                  onClick={async () => {
                    if (!isLoggedIn()) return goToLogin();
                    setEmailing(true);
                    say(await emailMyDesign());
                    setEmailing(false);
                  }}
                >
                  {emailing ? "Sending the email…" : "Email me this design"}
                </button>
              )}
              {/* Photo of it worn (round 5, 8 Nov 2026): an AI photo of the finished tee on a person, for WhatsApp / Instagram.
                  Since 17 Nov 2026 one photo per printed side (front, back, a sleeve side) — makeWornPhotos above */}
              {shots?.length === 4 && shots[0]?.url && ai.available && (
                <button
                  type="button"
                  className="dr-share alt dr-worn-btn"
                  disabled={wornBusy}
                  onClick={() => {
                    if (!isLoggedIn()) return goToLogin();
                    makeWornPhotos();
                  }}
                >
                  {worn === "making" ? (wornSides.length > 1 ? `Taking the ${sideWords(wornSides.slice(0, 1))} photo first… (about 30 s)` : "Taking the photo… (about 30 s)") : "Photo of it worn"}
                </button>
              )}
              {/* Try it on me (round 7, 8 Nov 2026): the customer's own photo, wearing this tee — the other sides are the
                  same person, made by the AI (17 Nov 2026); a photo of their back may be added when the back has a print */}
              {shots?.length === 4 && shots[0]?.url && ai.available && (
                <>
                  <button type="button" className="dr-share alt dr-worn-btn" disabled={wornBusy} onClick={() => (isLoggedIn() ? tryOnRef.current?.click() : goToLogin())}>
                    Try it on me
                  </button>
                  <input
                    ref={tryOnRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      let photo;
                      try {
                        photo = await photoDataUrl(file);
                      } catch (err) {
                        return say(err?.message || "That photo couldn’t be read.");
                      }
                      // the back gets a photo too: their own back, if they like (truer), else the AI makes it from this photo
                      if (planSides(wornSides, ai.left).make.includes("back")) return setTryOnAsk({ photo });
                      makeWornPhotos({ me: true, photo });
                    }}
                  />
                  <input
                    ref={tryOnBackRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      const photo = tryOnAsk?.photo;
                      if (!file || !photo) return;
                      setTryOnAsk(null);
                      try {
                        makeWornPhotos({ me: true, photo, backPhoto: await photoDataUrl(file) });
                      } catch (err) {
                        say(err?.message || "That photo couldn’t be read.");
                      }
                    }}
                  />
                  {/* no surprise cost (17 Nov 2026): how many photos a press makes, of today's pictures */}
                  <p className="dr-review-hint dr-worn-cost">{costLine({ sides: wornSides, left: isLoggedIn() ? ai.left : null, daily: ai.dailyPerUser })}</p>
                </>
              )}
              {tryOnAsk &&
                createPortal(
                <div className="dr-worn" role="dialog" aria-label="A photo of your back?">
                  <div className="dr-worn-card dr-worn-ask">
                    <b>Your photo shows your front.</b>
                    <p className="dr-review-hint">
                      Your design has a print on the back, so there will be a back photo too. The AI can make it from this photo — or add a photo of your back (standing, facing away), so the back looks truer.
                    </p>
                    <p className="dr-review-hint">{costLine({ sides: wornSides, left: isLoggedIn() ? ai.left : null, daily: ai.dailyPerUser })}</p>
                    <div className="dr-worn-acts">
                      <button type="button" onClick={() => tryOnBackRef.current?.click()}>Add a photo of my back</button>
                      <button
                        type="button"
                        onClick={() => {
                          const photo = tryOnAsk.photo;
                          setTryOnAsk(null);
                          makeWornPhotos({ me: true, photo });
                        }}
                      >
                        Go on without it
                      </button>
                      <button type="button" onClick={() => setTryOnAsk(null)}>Cancel</button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
              {worn?.photos &&
                createPortal(
                <div className="dr-worn" role="dialog" aria-label="Your tee, worn">
                  <div className="dr-worn-card">
                    {worn.photos.length > 1 && (
                      <div className="dr-worn-tabs" role="tablist" aria-label="Sides">
                        {worn.photos.map((p, i) => (
                          <button key={p.side} type="button" role="tab" aria-selected={i === worn.at} className={i === worn.at ? "on" : ""} onClick={() => wornGo(i)}>
                            {p.label}
                            {p.making ? " …" : p.failed ? " ✕" : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* swipe left / right on a phone for the next side */}
                    <div
                      className="dr-worn-pic"
                      onTouchStart={(e) => (wornSwipe.current = e.touches[0]?.clientX ?? null)}
                      onTouchEnd={(e) => {
                        const x0 = wornSwipe.current;
                        wornSwipe.current = null;
                        const dx = x0 == null ? 0 : (e.changedTouches[0]?.clientX ?? x0) - x0;
                        if (worn.photos.length > 1 && Math.abs(dx) > 48) wornGo(worn.at + (dx < 0 ? 1 : -1));
                      }}
                    >
                      {wornShown.url ? (
                        <img src={imageUrl(wornShown.url, 1200)} alt={`Your tee, worn — ${wornShown.label.toLowerCase()}`} />
                      ) : (
                        <div className="dr-worn-wait" role="status">
                          {wornShown.making ? `Making the ${wornShown.label.toLowerCase()} photo… (about 30 s)` : wornShown.failed || "This photo couldn’t be made."}
                        </div>
                      )}
                    </div>
                    <div className="dr-worn-acts">
                      <button
                        type="button"
                        disabled={!wornShown.url}
                        onClick={async () => {
                          try {
                            const blob = await (await fetch(imageUrl(wornShown.url))).blob();
                            const how = await shareTee(blob, { text: `My ${garment?.label || "tee"} design on IDENTEE`, fileName: `my-identee-tee-worn-${wornShown.side}.jpg` });
                            if (how === "saved") say("The photo is saved — send it to whoever needs to say yes.");
                          } catch {
                            window.open(imageUrl(wornShown.url), "_blank", "noopener");
                          }
                        }}
                      >
                        {worn.photos.length > 1 ? "Share this photo" : "Share the photo"}
                      </button>
                      {worn.photos.length > 1 && (
                        <button type="button" disabled={wornReady.length < 2} onClick={shareAllWorn}>
                          Share all{wornReady.length < worn.photos.length ? ` (${wornReady.length} ready)` : ""}
                        </button>
                      )}
                      <button type="button" onClick={closeWorn}>Close</button>
                    </div>
                    {worn.note && <p className="dr-review-hint dr-worn-note">{worn.note}</p>}
                    <p className="dr-review-hint">{wornCaption({ me: worn.me, side: wornShown.side, from: wornShown.from })}</p>
                  </div>
                </div>,
                document.body,
              )}
              <div className="dr-shots">
                {(shots || SIDES.map(([, label]) => ({ label, url: null }))).map((sh, i) => (
                  <button key={sh.label} type="button" className={`dr-shot${sideShown === SIDES[i][0] ? " on" : ""}`} aria-pressed={sideShown === SIDES[i][0]} onClick={() => showSide(SIDES[i][0])} aria-label={`Show the ${sh.label.toLowerCase()} on the 3D tee`}>
                    {sh.url ? <img src={sh.url} alt="" /> : <div className="ph" />}
                    <span>{sh.label}</span>
                  </button>
                ))}
              </div>
              {/* the IDENTEE woven label sewn inside the back neck, close up (13–14 Nov 2026) */}
              {neckLabel && (
                <button type="button" className={`dr-labelshot${sideShown === "label" ? " on" : ""}`} aria-pressed={sideShown === "label"} onClick={showLabel} aria-label="Show the neck label on the 3D tee">
                  <span className="pic">{labelShot ? <img src={labelShot} alt="" /> : <span className="ph" />}</span>
                  <span className="words">
                    <b>Neck label</b>
                    IDENTEE woven label with your size, sewn inside the back neck
                  </span>
                </button>
              )}
              {roles && (
                <TeamModeChoice
                  teamMode={teamMode}
                  onChange={setTeamOn}
                  roles={rolesIn(elements)}
                  sample={{ name: elements.find((e) => e.type === "text" && e.role === "name")?.text, number: elements.find((e) => e.type === "text" && e.role === "number")?.text }}
                  fabric={fabricHex}
                  ink={inkDefault}
                />
              )}
              {teamMode && (
                <TeamList players={players} setPlayers={setPlayers} sizes={sizes} sizeNow={sizeNow} roles={rolesIn(elements)} shownId={previewId} onShow={showPlayer} notify={say} />
              )}
              <div className="dr-qty" aria-label="Sizes and quantity" hidden={teamMode}>
                <div className="dr-qhead">
                  <div className="eyebrow">Sizes &amp; quantity</div>
                  {garment.sizeChart?.length > 0 && <FindSizeLink onClick={() => setFinder("review")} />}
                </div>
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
                  {(shopTeeNow ? "Free shipping" : shippingNote(shipRule, pieces)) && <small className="dr-shipnote">{shopTeeNow ? "Free shipping" : shippingNote(shipRule, pieces)}</small>}
                  {siteOffer && <small className="dr-offernote">+ Extra {siteOffer.offerPercentage}% off at checkout with code <b>{siteOffer.code}</b></small>}
                </div>
              </div>
            </section>
          </>
        )}

        {finder && (
          <SizeFinder
            garment={garment}
            collection={fromLink}
            resume={finderSeen}
            onResult={() => setFinderSeen(true)}
            teeHex={fabricHex}
            pickLabel="Choose"
            onClose={() => setFinder(null)}
            onPick={(sz) => {
              setSize(sz);
              writeJSON(SIZE_KEY, sz);
              // in Review: the one tee picked by default becomes this size; with more picked, this size is added
              if (finder === "review")
                setQtys((q) => {
                  const total = Object.values(q).reduce((n, v) => n + (v || 0), 0);
                  return total <= 1 ? { [sz]: 1 } : q[sz] ? q : { ...q, [sz]: 1 };
                });
            }}
          />
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
            onFindSize={garment.sizeChart?.length ? () => setFinder("fit") : null}
            onEnter={() => {
              setEarlier(null);
              enterRoom();
              if (photoLink) openPhotoStudio();
              if (teamLink) startTeam();
              startWith();
            }}
            onAssistant={() => {
              if (ai?.v2 && !isLoggedIn()) return goToLogin(); // (v2: guests get nothing until they sign in)
              setEarlier(null);
              enterRoom();
              if (teamLink) startTeam(true);
              else if (!ideaLink) openAiTab("chat");
              startWith();
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
                  {cartNote.pieces} {cartNote.inCart > cartNote.pieces ? "more " : ""}piece{cartNote.pieces === 1 ? "" : "s"} of “{cartNote.name}”
                </h1>
                {cartNote.inCart > cartNote.pieces && (
                  <p className="dr-added-more">
                    This design was already in your cart, so it now has <b>{cartNote.inCart} pieces</b>. Wanted fewer? Change the number in the cart.
                  </p>
                )}
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

        {toast && (
          <div className="dr-toast" role="status">
            {typeof toast === "string" ? toast : toast.text}
            {typeof toast === "string" && /log in/i.test(toast) && <button type="button" onClick={goToLogin}>Log in</button>}
            {typeof toast !== "string" && toast.action && (
              <button type="button" onClick={() => { setToast(""); toast.action.onClick(); }}>{toast.action.label}</button>
            )}
          </div>
        )}
        {/* busy: a line of text, or { label, expect, hint } for the AI (a card with a live seconds count) */}
        {busy && (
          <div className="dr-busy">
            <WaitCard key={typeof busy === "string" ? busy : busy.label} {...(typeof busy === "string" ? { label: busy } : busy)} onStop={busy.stoppable ? stopBusy : undefined} />
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
// notify(text, { label, onClick }): the room's message line, used for "Player removed · Undo"
function TeamList({ players, setPlayers, sizes, sizeNow, roles, shownId, onShow, notify }) {
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
            <button type="button" className="dr-x" aria-label={`Remove player ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                setPlayers((list) => list.filter((x) => x.id !== p.id));
                // put them back where they were
                notify?.(`${playerLabel(p) || `Player ${i + 1}`} removed.`, { label: "Undo", onClick: () => setPlayers((list) => (list.some((x) => x.id === p.id) ? list : [...list.slice(0, i), p, ...list.slice(i)])) });
              }}>✕</button>
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

// opens "Find my size"
function FindSizeLink({ onClick }) {
  return (
    <button type="button" className="dr-findsize" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 8h18v8H3z M7 8v3 M11 8v4 M15 8v3 M19 8v4" />
      </svg>
      Not sure? <b>Find my size</b>
    </button>
  );
}

// the unfinished design's words on the first screen: its items, or (13 Nov 2026) a chat with nothing on the tee yet
const unfinishedWords = (e) => (e.elements.length ? `${e.elements.length} item${e.elements.length === 1 ? "" : "s"}${e.name ? ` · ${e.name}` : ""}` : "your chat with the Assistant");

function Fitting({ garment, colours, colour, onColour, sizes, size, onSize, onFindSize, onEnter: enter, onAssistant: assistant, onPhoto: photo, credit, earlier, onContinue }) {
  // with an unfinished design waiting, starting a new one replaces it — so ask first
  const [asking, setAsking] = useState(null); // the way in that was pressed
  const guard = (go) => () => (earlier ? setAsking(() => go) : go());
  const onEnter = guard(enter);
  const onAssistant = guard(assistant);
  const onPhoto = guard(photo);
  useBackClose(Boolean(earlier && asking), () => setAsking(null)); // Back = "Keep it" (16 Nov 2026)
  return (
    <div className="dr-overlay fit">
      <div className="dr-fit">
        {earlier && (
          <div className="dr-resume">
            <span>
              You have an unfinished design ({unfinishedWords(earlier)}).
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
          {onFindSize && <FindSizeLink onClick={onFindSize} />}
        </div>
        {/* the highlighted way in: the customer's own photo, as art or print-ready */}
        <button type="button" className="dr-photoenter" onClick={onPhoto}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PHOTO} />
          </svg>
          <span>
            <b>Start with my photo</b>
            <small>Copy a design from it, put it on as it is, or turn it into art</small>
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
      {/* asked in front of everything when a way in is pressed (at the top of the panel it was scrolled out of
          sight by the time the customer reached the buttons) — centred on a laptop, from the bottom on a phone */}
      {earlier && asking && (
        <div className="dr-askback" onClick={(e) => e.target === e.currentTarget && setAsking(null)}>
          <div className="dr-ask" role="alertdialog" aria-modal="true" aria-labelledby="dr-ask-h">
            <h2 id="dr-ask-h">Start a new design?</h2>
            <p>
              You have an unfinished design ({unfinishedWords(earlier)}). Starting a new one replaces it.
            </p>
            <div className="dr-ask-btns">
              <button type="button" onClick={onContinue}>Continue my design</button>
              <button type="button" className="alt" onClick={() => { const go = asking; setAsking(null); go(); }}>Start new</button>
              <button type="button" className="link" onClick={() => setAsking(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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
    // (15 Nov 2026: "low" is the design check's rule — with the enlarger, the photo's own pixels under 75 DPI)
    const cls = sharp.soft ? "low" : dpi >= 150 ? "good" : "ok";
    const word = { good: "Good", ok: "OK", low: "Low — may look soft" }[cls];
    return (
      <div className="dr-quality">
        Print quality: <b className={cls}>{word}</b> · {printCm.toFixed(1)} cm wide
        {enlarged && cls !== "low" ? " · we sharpen it before printing" : ` · ${cls === "low" ? Math.round(sharp.now) : dpi} DPI`}
      </div>
    );
  };
  return (
    <div className="dr-controls">
      <div className="dr-addhead">
        <span>Tap another item on the print area to edit it, or add more:</span>
        <small className="dr-addmore-label">Add more</small>
        {/* (one "+ Add more" didn't say what it opens: each one goes straight to its tab, and looks like it) */}
        <div className="dr-addmore" role="group" aria-label="Add more to this print area">
          {ADD_TABS.map(([k, label, icon]) => (
            <button key={k} type="button" className="dr-addmore-btn" onClick={() => onAddMore(k)} aria-label={`Add ${label.toLowerCase()}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={icon} />
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </div>
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
                {fontChoices(sel.text, sel.fontFamily).map((f) => <option key={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </label>
            <label className="dr-field">
              Size
              <input type="range" min="2" max={isSpotKey(sel.position) ? 100 : 60} step="0.5" value={sel.fontSizePct} onChange={(e) => onPatch({ fontSizePct: +e.target.value }, { measure: true })} />
            </label>
          </div>
          {hasTamil(sel.text) && <small className="dr-tamilnote">Tamil words: pick a Tamil font from the top of the list. They stay straight, with normal letter spacing, so the letters join the right way.</small>}
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
                const now = vertical ? "vertical" : hasTamil(sel.text) ? "straight" : sel.effect || "straight";
                return (
                  <button
                    key={k}
                    type="button"
                    className={now === k ? "on" : ""}
                    aria-pressed={now === k}
                    disabled={k.startsWith("arc") && hasTamil(sel.text)}
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
              <input type="range" min="-5" max="40" step="1" value={sel.letterSpacingPct || 0} disabled={hasTamil(sel.text)} onChange={(e) => onPatch({ letterSpacingPct: +e.target.value }, { measure: true })} />
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

// The free art library (Admin → Design library). Every design is loaded once (one small list), so a group's tile can
// show 4 of its designs and how many there are, and the search box looks through all of them at once (a name or a
// group: "ferrari", "bike"). A group opens 24 at a time ("Show more"), so a phone isn't handed 286 pictures at once.
// Groups with nothing to show are left out (they used to open on "Loading designs…" for ever).
const ART_PAGE = 24;
function ArtPanel({ categories, onPick }) {
  const [all, setAll] = useState(null); // every design shown to customers (null while loading)
  const [failed, setFailed] = useState(false);
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(ART_PAGE);
  useEffect(() => {
    let off = false;
    artDesignService
      .getArtDesigns()
      .then((list) => !off && setAll(Array.isArray(list) ? list : []))
      .catch(() => !off && (setAll([]), setFailed(true)));
    return () => {
      off = true;
    };
  }, []);
  const byCat = useMemo(() => {
    const m = new Map();
    for (const d of all || []) {
      const k = String(d.category?._id || d.category || "");
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    return m;
  }, [all]);
  const groups = categories.map((c) => ({ ...c, items: byCat.get(String(c._id)) || [] })).filter((g) => all === null || g.items.length);
  const total = (all || []).length;
  const term = q.trim().toLowerCase();
  const found = term ? (all || []).filter((d) => `${d.name} ${d.category?.name || ""}`.toLowerCase().includes(term)) : null;
  const list = found || (cat ? byCat.get(String(cat._id)) || [] : null);
  const open = (c) => {
    setCat(c);
    setShown(ART_PAGE);
  };
  const search = (
    <div className="dr-artsearch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setShown(ART_PAGE);
        }}
        placeholder={total ? `Search ${total} free designs…` : "Search the designs…"}
        aria-label="Search the free designs"
        enterKeyHint="search"
      />
      {q && <button type="button" className="dr-artclear" onClick={() => setQ("")} aria-label="Clear the search">✕</button>}
    </div>
  );
  if (!list) {
    return (
      <div className="dr-artpanel">
        {search}
        {all === null && <p className="dr-empty">Opening the designs…</p>}
        {all !== null && !groups.length && <p className="dr-empty">{failed ? "The designs didn’t load. Check your connection and try again." : "No designs yet."}</p>}
        <div className="dr-artcats">
          {groups.map((g) => (
            <button key={g._id} type="button" className="dr-artcat" onClick={() => open(g)}>
              <span className={`dr-artquad n${Math.min(4, Math.max(1, g.items.length))}`} aria-hidden="true">
                {(g.items.length ? g.items.slice(0, 4) : [{ _id: "t", imageUrl: g.thumbnail }]).map((d) => (
                  <img key={d._id} src={imageUrl(d.imageUrl, 140)} alt="" loading="lazy" decoding="async" />
                ))}
              </span>
              <b>{g.name}</b>
              {g.items.length > 0 && <small>{g.items.length} design{g.items.length === 1 ? "" : "s"}</small>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="dr-artpanel">
      {search}
      <div className="dr-arthead">
        {!found && (
          <button type="button" className="dr-chip" onClick={() => setCat(null)}>
            ← All groups
          </button>
        )}
        <span>{found ? `${found.length} found for “${q.trim()}”` : `${cat.name} · ${list.length} free`}</span>
      </div>
      <div className="dr-artgrid">
        {list.slice(0, shown).map((d) => (
          <button key={d._id} type="button" className="dr-artitem" onClick={() => onPick(d)}>
            <img src={imageUrl(d.imageUrl, 240)} alt={d.name} loading="lazy" decoding="async" />
            <span>{d.name}</span>
            <b>Free</b>
          </button>
        ))}
      </div>
      {found && !found.length && <p className="dr-empty">Nothing called “{q.trim()}”. Try a shorter word, like “car” or “bike”.</p>}
      {list.length > shown && (
        <button type="button" className="dr-artmore" onClick={() => setShown((n) => n + ART_PAGE)}>
          Show more · {list.length - shown} left
        </button>
      )}
    </div>
  );
}
