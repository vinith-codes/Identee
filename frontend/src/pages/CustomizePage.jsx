import { useState, useEffect, useRef, useCallback } from "react";
import {
  useParams,
  useSearchParams,
  useNavigate,
  Link,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { getShowcase } from "../redux/slices/categoryBannerSlice";
import {
  uploadDesignImage,
  saveCustomization,
  reset,
} from "../redux/slices/customizationSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import { fetchArtCategories } from "../redux/slices/artCategorySlice";
import { fetchArtDesigns } from "../redux/slices/artDesignSlice";
import GarmentVisual from "../components/GarmentVisual";
import ColorPickerPanel from "../components/ColorPickerPanel";
import Garment3DViewer from "../components/Garment3DViewer";
import tshirtModel from "../assets/models/tshirt.glb";
import { imageUrl } from "../utils/imageUrl";
const C = {
  bg: "#FFFCF7",
  panel: "#F7F2E7",
  ink: "#1C1A14",
  muted: "#7A7160",
  border: "#E6DCC4",
  gold: "#C9A24B",
  goldDeep: "#A9822E",
  goldSoft: "#C9A24B1A",
  navy: "#20304F",
  danger: "#B3432B",
  shadow: "0 4px 16px rgba(28,26,20,0.06)",
  shadowLift: "0 8px 24px rgba(28,26,20,0.10)",
};
const FONT_OPTIONS = [
  "Yeseva One",
  "UnifrakturCook",
  "Trocchi",
  "Trirong",
  "Varela Round",
  "Walter Turncoat",
  "Voltaire",
  "Vampiro One",
  "Ubuntu Condensed",
  "Yantramanav",
  "Rosarivo",
  "Underdog",
  "Yatra One",
  "Varela",
  "Uncial Antiqua",
  "Ubuntu",
  "Vollkorn",
  "Vibur",
  "Trochut",
  "Yrsa",
  "Tinos",
  "Arial",
  "Georgia",
  "Poppins",
  "Bebas Neue",
  "Courier New",
];

const FONTS_PER_PAGE = 8;

const TEXT_ALIGN_OPTIONS = ["left", "center", "right", "justify"];
const TEXT_EFFECT_OPTIONS = [
  { key: "straight", label: "Straight" },
  { key: "arc-up", label: "Arc Up" },
  { key: "arc-down", label: "Arc Down" },
];

// fontSizePct is "% of canvas height" internally (so text scales with
// the print area at any screen size) — these are the values shown in
// the FONT SIZE dropdown, from small to poster-sized.
const FONT_SIZE_OPTIONS = [
  2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 24, 28, 30,
];

function makeTextDraft() {
  return {
    fontFamily: "",
    text: "",
    fontSizePct: 8,
    color: "#15130F",
    bold: false,
    underline: false,
    italic: false,
    align: "left",
    effect: "straight",
    note: "",
  };
}

// Index-aligned: VIEW_KEYS[i] is stored on each element's `side` field.
const VIEW_KEYS = ["front", "back", "right", "left"];
const VIEW_LABELS = ["FRONT", "BACK", "RIGHT", "LEFT"];
// Physical spin order for the 360 drag (front -> right -> back -> left),
// as opposed to VIEW_KEYS' front/back/right/left tab order.
const SPIN_ORDER = ["front", "right", "back", "left"];

// Named print zones. Each maps to a specific side (front/back/right/left)
// plus a smaller/larger box on that side. "right"/"left" sleeve reuse the
// right/left silhouette views; chest positions are small boxes on the
// front view's upper-left/upper-right.
const PRINT_POSITIONS = {
  "front-full": {
    side: "front",
    area: { left: 22, top: 27, width: 56, height: 58 },
  },
  "back-full": {
    side: "back",
    area: { left: 22, top: 27, width: 56, height: 58 },
  },
  "left-chest": {
    side: "front",
    area: { left: 24, top: 22, width: 18, height: 18 },
  },
  "right-chest": {
    side: "front",
    area: { left: 58, top: 22, width: 18, height: 18 },
  },
  "left-sleeve": {
    side: "left",
    area: { left: 30, top: 30, width: 30, height: 20 },
  },
  "right-sleeve": {
    side: "right",
    area: { left: 30, top: 30, width: 30, height: 20 },
  },
};
const PRINT_AREA = PRINT_POSITIONS["front-full"].area; // fallback for existing canvas dashed-box render

// Default canvas box the print-canvas measures before ResizeObserver has
// reported a real size. Without this, fontSizePct * canvasSize.height
// evaluates to 0 for a frame and freshly-added text is briefly invisible.
const DEFAULT_CANVAS_SIZE = { width: 480, height: 560 };

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
function makeId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function imgUrl(path) {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return imageUrl(path);
}


export default function CustomizePage() {
  const { type } = useParams();
  const [searchParams] = useSearchParams();
  const colorSlug = searchParams.get("color");
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { isUploading, isSaving, isSuccess, isError, message } = useSelector(
    (s) => s.customization,
  );
  const { items: garmentTypes } = useSelector((s) => s.garmentType);
  const { items: garmentImages } = useSelector((s) => s.garmentImage);
  const { items: artCategories } = useSelector((s) => s.artCategory);
  const { items: artDesigns } = useSelector((s) => s.artDesign);

  const garment = garmentTypes.find((g) => g.key === type); // from GarmentType (admin "Garment Types" page)
  const colorDoc = garmentImages.find(
    (d) => d.garmentType === type && d.colorSlug === colorSlug,
  );
  const color = colorDoc
    ? { slug: colorSlug, name: colorDoc.colorName, hex: colorDoc.colorHex }
    : null;

  const [elements, setElements] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS_SIZE);

  const [viewMode, setViewMode] = useState("flat"); // "flat" | "3d"
  const [activeView, setActiveView] = useState(0);
  const [spinFloat, setSpinFloat] = useState(0); // continuous position along SPIN_ORDER, for smooth blending
  const spinDrag = useRef(null);

  // "products" | "tutorials" | "text-font" | "text-edit" | "image" | "art" | null
  const [activePanel, setActivePanel] = useState(null);

  // Holds the in-progress text element while the Text tool's two-step
  // "CHOOSE FONT" -> edit-fields flow is open. Nothing is added to the
  // canvas until "Add Text" is pressed — matches the reference site,
  // where picking a font doesn't commit anything by itself.
  const [textDraft, setTextDraft] = useState(null);
  const [fontSearch, setFontSearch] = useState("");
  const [fontPage, setFontPage] = useState(1);
  const [customColors, setCustomColors] = useState([]);

  // Tracks whether the *current* drag/resize gesture has actually moved
  // anything yet. History should only be pushed once, the first time a
  // gesture changes something — not on every mousedown.
  const historyCommittedRef = useRef(true);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const artInputRef = useRef(null);

  useEffect(() => {
    return () => dispatch(reset());
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchGarmentTypes());
    dispatch(fetchAllGarmentImages());
    dispatch(getShowcase()); // 🔄 changed
    dispatch(fetchArtCategories());
  }, [dispatch]);

  const currentSide = VIEW_KEYS[Math.min(activeView, VIEW_KEYS.length - 1)];
  const visibleElements = elements.filter((el) => el.side === currentSide);
  const selectedEl = visibleElements.find((el) => el.id === selectedId);

  // Sum of every Art design price currently placed anywhere on the
  // garment (front/back/left/right combined) — this is what the
  // customer pays on top of the base garment price.
  const artAddOnTotal = elements.reduce(
    (sum, el) => sum + (el.artPrice || 0),
    0,
  );

  // Which two sides are currently blending in 3D spin mode, and how far
  // between them we are (0 = fully on lowerSide, 1 = fully on upperSide).
  const spinLowerIdx = Math.floor(spinFloat) % SPIN_ORDER.length;
  const spinUpperIdx = (spinLowerIdx + 1) % SPIN_ORDER.length;
  const spinFrac = spinFloat - Math.floor(spinFloat);
  const spinLowerSide = SPIN_ORDER[spinLowerIdx];
  const spinUpperSide = SPIN_ORDER[spinUpperIdx];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setCanvasSize({ width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const pushHistory = () => {
    setHistory((h) => [...h, elements]);
    setFuture([]);
  };

  // Call this right before a *direct, single-shot* mutation (add, delete,
  // rotate, duplicate, layer order, panel edits). Drag/resize commit their
  // own history lazily — see commitDragHistoryOnce below.
  const pushHistoryNow = () => pushHistory();

  // Called from inside the drag/resize mousemove handler. Only actually
  // pushes history the first time a given gesture moves something, so a
  // plain click-to-select doesn't create a no-op undo step.
  const commitDragHistoryOnce = () => {
    if (historyCommittedRef.current) return;
    historyCommittedRef.current = true;
    pushHistory();
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [elements, ...f]);
    setHistory((h) => h.slice(0, -1));
    setElements(prev);
    setSelectedId(null);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h, elements]);
    setFuture((f) => f.slice(1));
    setElements(next);
    setSelectedId(null);
  };

  const switchView = (i) => {
    setViewMode("flat");
    setActiveView(i);
    setSelectedId(null); // a selection from another side shouldn't linger
  };

  useEffect(() => {
    if (!dragState && !resizeState) return;

    const handleMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      let moved = false;

      if (dragState) {
        const dxPct = ((e.clientX - dragState.startX) / rect.width) * 100;
        const dyPct = ((e.clientY - dragState.startY) / rect.height) * 100;
        if (Math.abs(dxPct) > 0.15 || Math.abs(dyPct) > 0.15) moved = true;
        setElements((prev) =>
          prev.map((el) =>
            el.id === dragState.id
              ? {
                  ...el,
                  x: clamp(dragState.startElX + dxPct, 0, 100 - el.width),
                  y: clamp(
                    dragState.startElY + dyPct,
                    0,
                    100 - (el.height || 10),
                  ),
                }
              : el,
          ),
        );
      }

      if (resizeState) {
        const dxPct = ((e.clientX - resizeState.startX) / rect.width) * 100;
        const dyPct = ((e.clientY - resizeState.startY) / rect.height) * 100;
        if (Math.abs(dxPct) > 0.15 || Math.abs(dyPct) > 0.15) moved = true;
        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== resizeState.id) return el;
            if (el.type === "text") {
              return {
                ...el,
                fontSizePct: clamp(resizeState.startFontSizePct + dyPct, 2, 30),
              };
            }
            return {
              ...el,
              width: clamp(resizeState.startW + dxPct, 8, 90),
              height: clamp(resizeState.startH + dyPct, 8, 90),
            };
          }),
        );
      }

      if (moved) commitDragHistoryOnce();
    };

    const handleUp = () => {
      setDragState(null);
      setResizeState(null);
      historyCommittedRef.current = true;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, resizeState]);

  // 360 spin: drag left/right cycles through front -> right -> back ->
  // left (physical rotation order), reusing the same 4 photo/silhouette
  // views.
  const handleSpinMouseDown = (e) => {
    if (viewMode !== "3d") return;
    spinDrag.current = { startX: e.clientX, startSpinFloat: spinFloat };
  };

  const handleSpinMouseMove = useCallback(
    (e) => {
      if (viewMode !== "3d" || !spinDrag.current) return;
      const dx = e.clientX - spinDrag.current.startX;
      const PIXELS_PER_STEP = 90; // drag this far (px) to cross fully from one photo to the next
      let next = spinDrag.current.startSpinFloat + dx / PIXELS_PER_STEP;
      next =
        ((next % SPIN_ORDER.length) + SPIN_ORDER.length) % SPIN_ORDER.length;
      setSpinFloat(next);
      const nearestIdx = Math.round(next) % SPIN_ORDER.length;
      const side = SPIN_ORDER[nearestIdx];
      setActiveView((prev) => {
        const idx = VIEW_KEYS.indexOf(side);
        return idx === prev ? prev : idx;
      });
    },
    [viewMode],
  );

  useEffect(() => {
    const handleUp = () => {
      spinDrag.current = null;
    };
    window.addEventListener("mousemove", handleSpinMouseMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleSpinMouseMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [handleSpinMouseMove]);
  // Auto-rotate while in 3D mode — pauses whenever the user is dragging
  // (spinDrag.current is set), resumes automatically on mouse-up.
  useEffect(() => {
    if (viewMode !== "3d") return;
    const interval = setInterval(() => {
      if (spinDrag.current) return; // user is actively dragging — don't fight them
      setSpinFloat((prev) => {
        const next = (prev + 0.012) % SPIN_ORDER.length;
        const nearestIdx = Math.round(next) % SPIN_ORDER.length;
        const side = SPIN_ORDER[nearestIdx];
        setActiveView((p) => {
          const idx = VIEW_KEYS.indexOf(side);
          return idx === p ? p : idx;
        });
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [viewMode]);

  if (!garment || !color) {
    return (
      <StudioShell>
        <CenterMessage color={C.danger}>
          We couldn't find that pattern/color.{" "}
          <Link to="/customize/choose-product" style={{ color: C.gold }}>
            Choose a pattern
          </Link>
        </CenterMessage>
      </StudioShell>
    );
  }

  // ── Text tool ────────────────────────────────────────────────────

  const openTextTool = () => {
    setTextDraft(makeTextDraft());
    setFontSearch("");
    setFontPage(1);
    setActivePanel("text-font");
  };

  const pickFont = (fontName) => {
    setTextDraft((d) => ({ ...(d || makeTextDraft()), fontFamily: fontName }));
    setActivePanel("text-edit");
  };

  const reopenFontChooser = () => {
    setFontSearch("");
    setFontPage(1);
    setActivePanel("text-font");
  };

  const closeTextTool = () => {
    setTextDraft(null);
    setActivePanel(null);
  };

  const confirmAddText = () => {
    if (!textDraft) return;
    pushHistoryNow();
    const newEl = {
      id: makeId(),
      type: "text",
      side: currentSide,
      text: textDraft.text.trim() || "Your Text",
      fontFamily: textDraft.fontFamily || FONT_OPTIONS[0],
      fontSizePct: textDraft.fontSizePct,
      color: textDraft.color,
      bold: textDraft.bold,
      italic: textDraft.italic,
      underline: textDraft.underline,
      align: textDraft.align,
      effect: textDraft.effect,
      note: textDraft.note,
      x: 30,
      y: 40,
      width: 40,
      height: 10,
      rotation: 0,
      zIndex: elements.length,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newEl.id);
    closeTextTool();
  };

  const addNameElement = () => {
    pushHistoryNow();
    const newEl = {
      id: makeId(),
      type: "text",
      side: currentSide,
      text: "NAME",
      fontFamily: "Bebas Neue",
      fontSizePct: 8,
      color: C.ink,
      x: 32,
      y: 55,
      width: 36,
      height: 12,
      rotation: 0,
      zIndex: elements.length,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newEl.id);
  };

  const handleDesignUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const result = await dispatch(uploadDesignImage(file));
    if (uploadDesignImage.fulfilled.match(result)) {
      pushHistoryNow();
      const newEl = {
        id: makeId(),
        type: "image",
        side: currentSide,
        src: result.payload.path,
        x: 30,
        y: 30,
        width: 35,
        height: 35,
        rotation: 0,
        zIndex: elements.length,
      };
      setElements((prev) => [...prev, newEl]);
      setSelectedId(newEl.id);
      setActivePanel(null);
    }
  };

  const handleSelectArtDesign = (design) => {
    pushHistoryNow();
    const newEl = {
      id: makeId(),
      type: "image",
      side: currentSide,
      src: design.imageUrl, // already a full backend-hosted path
      artDesignId: design._id, // kept for price lookup at checkout time
      artPrice: design.price,
      x: 30,
      y: 30,
      width: 35,
      height: 35,
      rotation: 0,
      zIndex: elements.length,
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newEl.id);
    setActivePanel(null);
  };

  const handleElementMouseDown = (el, e) => {
    e.stopPropagation();
    setSelectedId(el.id);
    historyCommittedRef.current = false; // history commits lazily on first move
    setDragState({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startElX: el.x,
      startElY: el.y,
    });
  };

  const handleResizeMouseDown = (el, e) => {
    e.stopPropagation();
    historyCommittedRef.current = false;
    setResizeState({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: el.width,
      startH: el.height,
      startFontSizePct: el.fontSizePct,
    });
  };

  // Renders one side's design elements (text/image) at a given opacity.
  // In flat/edit mode (interactive=true) they're draggable/selectable; in
  // 3D spin mode (interactive=false) they're just visual, crossfading
  // along with the garment photo underneath — so text/art placed on
  // front and back both fade in/out smoothly as the garment "rotates".
  const renderSideElements = (sideElements, opacity, interactive) =>
    sideElements
      .slice()
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((el) => (
        <div
          key={el.id}
          onMouseDown={
            interactive ? (e) => handleElementMouseDown(el, e) : undefined
          }
          style={{
            position: "absolute",
            left: `${el.x}%`,
            top: `${el.y}%`,
            width: `${el.width}%`,
            height: el.type === "image" ? `${el.height}%` : "auto",
            transform: `rotate(${el.rotation}deg)`,
            transformOrigin: "center",
            cursor: interactive ? "move" : "default",
            outline:
              interactive && selectedId === el.id
                ? `2px dashed ${C.gold}`
                : "none",
            outlineOffset: 2,
            userSelect: "none",
            opacity,
            pointerEvents: interactive ? "auto" : "none",
          }}
        >
          {el.type === "image" ? (
            <img
              src={imgUrl(el.src)}
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                pointerEvents: "none",
              }}
            />
          ) : (
            <span
              style={{
                display: "block",
                fontFamily: `"${el.fontFamily}", serif`,
                fontSize: `${(el.fontSizePct / 100) * canvasSize.height}px`,
                color: el.color,
                fontWeight: el.bold ? 700 : 400,
                fontStyle: el.italic ? "italic" : "normal",
                textDecoration: el.underline ? "underline" : "none",
                textAlign: el.align || "left",
                whiteSpace: "pre-wrap",
                pointerEvents: "none",
                transform:
                  el.effect === "arc-up"
                    ? "skewY(-6deg) scaleY(1.05)"
                    : el.effect === "arc-down"
                      ? "skewY(6deg) scaleY(1.05)"
                      : "none",
              }}
            >
              {el.text}
            </span>
          )}

          {interactive && selectedId === el.id && (
            <div
              onMouseDown={(e) => handleResizeMouseDown(el, e)}
              style={{
                position: "absolute",
                right: -7,
                bottom: -7,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: C.gold,
                border: "2px solid #fff",
                cursor: "nwse-resize",
              }}
            />
          )}
        </div>
      ));
  const updateSelected = (patch) => {
    setElements((prev) =>
      prev.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)),
    );
  };

  const rotateSelected = (deg) => {
    pushHistoryNow();
    setElements((prev) =>
      prev.map((el) =>
        el.id === selectedId
          ? { ...el, rotation: (el.rotation + deg) % 360 }
          : el,
      ),
    );
  };

  const bringToFront = () => {
    pushHistoryNow();
    setElements((prev) => {
      const maxZ = Math.max(
        0,
        ...prev.filter((e) => e.side === currentSide).map((e) => e.zIndex),
      );
      return prev.map((el) =>
        el.id === selectedId ? { ...el, zIndex: maxZ + 1 } : el,
      );
    });
  };

  const sendToBack = () => {
    pushHistoryNow();
    setElements((prev) => {
      const minZ = Math.min(
        0,
        ...prev.filter((e) => e.side === currentSide).map((e) => e.zIndex),
      );
      return prev.map((el) =>
        el.id === selectedId ? { ...el, zIndex: minZ - 1 } : el,
      );
    });
  };

  const duplicateSelected = () => {
    if (!selectedEl) return;
    pushHistoryNow();
    const copy = {
      ...selectedEl,
      id: makeId(),
      x: clamp(selectedEl.x + 4, 0, 100 - selectedEl.width),
      y: clamp(selectedEl.y + 4, 0, 100 - (selectedEl.height || 10)),
      zIndex: elements.length,
    };
    setElements((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    pushHistoryNow();
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // clipboard permission denied — silently ignore, non-critical
    }
  };

  const handleSave = async () => {
    if (elements.length === 0) return;
    const result = await dispatch(
      saveCustomization({ garmentType: type, color: color.slug, elements }),
    );
    if (saveCustomization.fulfilled.match(result)) {
      const customizationId = result.payload._id;
      const totalPrice = (garment.basePrice || 0) + artAddOnTotal;
      setTimeout(() => {
        navigate(`/buy-now/${customizationId}`, {
          state: {
            product: {
              _id: customizationId,
              brandname: `${garment.label} — Custom Design`,
              images: [],
              price: totalPrice,
            },
            size: "Custom",
            qty: 1,
          },
        });
      }, 800);
    }
  };

  const togglePanel = (name) =>
    setActivePanel((prev) => (prev === name ? null : name));

  return (
    <StudioShell>
      {/* ── Top bar: logo · pill toolbar · Tutorials · Order ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Logo />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: C.panel,
              borderRadius: 999,
              padding: "4px 10px",
              border: `1px solid ${C.border}`,
              boxShadow: C.shadow,
            }}
          >
            <ToolbarButton
              label="Undo"
              icon="↩"
              onClick={handleUndo}
              disabled={history.length === 0}
            />
            <ToolbarButton
              label="Redo"
              icon="↪"
              onClick={handleRedo}
              disabled={future.length === 0}
            />
            <ToolbarButton
              label="Save"
              icon="💾"
              onClick={handleSave}
              disabled={isSaving}
            />
            <ToolbarButton label="Share" icon="🔗" onClick={handleShare} />
            <ToolbarButton
              label="Contact"
              icon="📞"
              onClick={() => (window.location.href = "tel:+916366526449")}
            />
          </div>

          <button
            onClick={() => togglePanel("tutorials")}
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              background: C.ink,
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Tutorials
          </button>

          {artAddOnTotal > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.ink,
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                padding: "8px 14px",
                whiteSpace: "nowrap",
              }}
            >
              Add-ons: +₹{artAddOnTotal}
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: "12px 30px",
              borderRadius: 999,
              background: C.gold,
              color: C.ink,
              border: "none",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.02em",
              cursor: isSaving ? "wait" : "pointer",
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? "SAVING…" : "Order"}
          </button>
        </div>
      </div>

      {isUploading && (
        <StatusLine color={C.muted}>Uploading design…</StatusLine>
      )}
      {isSuccess && (
        <StatusLine color="#3E7C4A">Design saved! Redirecting…</StatusLine>
      )}
      {isError && <StatusLine color={C.danger}>{message}</StatusLine>}

      {/* ── Main workspace ── */}
      <div
        style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}
        className="cust-workspace"
      >
        {/* Left icon rail — colored badge icons */}
        <div
          style={{
            width: 108,
            flexShrink: 0,
            background: C.panel,
            borderRight: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            paddingTop: 20,
          }}
          className="cust-sidebar"
        >
          <SidebarIcon
            icon="👕"
            label="Products"
            badgeBg="linear-gradient(135deg,#FDE9C8,#F5A623)"
            active={activePanel === "products"}
            onClick={() => togglePanel("products")}
          />
          <SidebarIcon
            icon="🅰️"
            label="Text"
            badgeBg="linear-gradient(135deg,#FFE1A8,#FF7A59)"
            active={activePanel === "text-font" || activePanel === "text-edit"}
            onClick={openTextTool}
          />
          <SidebarIcon
            icon="🖼️"
            label="Image"
            badgeBg="linear-gradient(135deg,#CFE8FF,#5B8DEF)"
            active={activePanel === "image"}
            onClick={() => togglePanel("image")}
          />
          <SidebarIcon
            icon="🎨"
            label="Art"
            badgeBg="linear-gradient(135deg,#E3D4FF,#8C6FE8)"
            active={activePanel === "art"}
            onClick={() => togglePanel("art")}
          />
          <SidebarIcon
            icon="🔤"
            label="Name"
            badgeBg="linear-gradient(135deg,#D6F3D8,#4FAE5C)"
            onClick={addNameElement}
          />
          <SidebarIcon
            icon="🛒"
            label="Order"
            badgeBg="linear-gradient(135deg,#FFE0DA,#E0574A)"
            onClick={handleSave}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleDesignUpload}
            style={{ display: "none" }}
          />
          <input
            ref={artInputRef}
            type="file"
            accept="image/*"
            onChange={handleDesignUpload}
            style={{ display: "none" }}
          />
        </div>

        {/* Products slide-over panel — two-step: All Products -> Choose Color */}
        {activePanel === "products" && (
          <ProductsPanel
            currentGarmentKey={garment.key}
            currentColorSlug={color.slug}
            garmentTypes={garmentTypes}
            garmentImages={garmentImages}
            onClose={() => setActivePanel(null)}
            onSelectColor={(garmentKey, colorSlug) => {
              navigate(`/customize/${garmentKey}?color=${colorSlug}`);
              setActivePanel(null);
            }}
          />
        )}
        {activePanel === "tutorials" && (
          <TutorialsPanel onClose={() => setActivePanel(null)} />
        )}
        {activePanel === "text-font" && (
          <FontChooserPanel
            search={fontSearch}
            onSearchChange={(v) => {
              setFontSearch(v);
              setFontPage(1);
            }}
            page={fontPage}
            onLoadMore={() => setFontPage((p) => p + 1)}
            selectedFont={textDraft?.fontFamily}
            onPick={pickFont}
            onBack={closeTextTool}
          />
        )}
        {activePanel === "text-edit" && textDraft && (
          <TextEditPanel
            draft={textDraft}
            onChange={(patch) => setTextDraft((d) => ({ ...d, ...patch }))}
            onReopenFont={reopenFontChooser}
            onOpenColorPicker={() => setActivePanel("text-color")}
            onBack={closeTextTool}
            onAdd={confirmAddText}
          />
        )}
        {activePanel === "text-color" && textDraft && (
          <ColorPickerPanel
            value={textDraft.color}
            onChange={(hex) => setTextDraft((d) => ({ ...d, color: hex }))}
            onBack={() => setActivePanel("text-edit")}
            customColors={customColors}
            onAddCustomColor={(hex) =>
              setCustomColors((prev) =>
                prev.includes(hex) ? prev : [...prev, hex],
              )
            }
            onRemoveCustomColors={() => setCustomColors([])}
          />
        )}
        {activePanel === "image" && (
          <ImagePanel
            isUploading={isUploading}
            onBrowse={() => fileInputRef.current?.click()}
            onClose={() => setActivePanel(null)}
          />
        )}
        {activePanel === "art" && (
          <ArtPanel
            categories={artCategories}
            designs={artDesigns}
            onOpenCategory={(categoryId) =>
              dispatch(fetchArtDesigns(categoryId))
            }
            onSelectDesign={handleSelectArtDesign}
            onBrowseUpload={() => artInputRef.current?.click()}
            onClose={() => setActivePanel(null)}
          />
        )}

        {/* Canvas */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <ModeButton
              active={viewMode === "flat"}
              onClick={() => setViewMode("flat")}
            >
              Flat Views
            </ModeButton>
          </div>

          <div
            ref={canvasRef}
            onMouseDown={(e) => {
              setSelectedId(null);
              handleSpinMouseDown(e);
            }}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 560,
              aspectRatio: "4/5",
              background: "#F3F1EC",
              borderRadius: 20,
              overflow: "hidden",
              border: `1px solid ${C.border}`,
              boxShadow: C.shadowLift,
              cursor: viewMode === "3d" ? "grab" : "default",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "4% 8%",
                pointerEvents: "none",
              }}
            >
              {viewMode === "3d" ? (
                <Garment3DViewer
                  color={color.hex}
                  frontElements={elements.filter((el) => el.side === "front")}
                  backElements={elements.filter((el) => el.side === "back")}
                  modelPath={tshirtModel}
                />
              ) : (
                <CrossfadeGarment
                  garmentKey={garment.key}
                  colorSlug={color.slug}
                  view={currentSide}
                />
              )}
            </div>

            {viewMode === "flat" && (
              <div
                style={{
                  position: "absolute",
                  left: `${PRINT_AREA.left}%`,
                  top: `${PRINT_AREA.top}%`,
                  width: `${PRINT_AREA.width}%`,
                  height: `${PRINT_AREA.height}%`,
                  border: `1.5px dashed ${C.gold}`,
                  borderRadius: 6,
                  pointerEvents: "none",
                }}
              />
            )}
            {viewMode === "flat" &&
              renderSideElements(visibleElements, 1, true)}
          </div>
          {viewMode === "3d" && (
            <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
              Click and drag left/right to spin the garment
            </p>
          )}
        </div>

        {/* Right rail — circular view switcher + 360 pill + edit card */}
        <div
          style={{
            width: 160,
            flexShrink: 0,
            borderLeft: `1px solid ${C.border}`,
            background: C.bg,
            padding: "24px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
            overflowY: "auto",
          }}
          className="cust-rightpanel"
        >
          {VIEW_LABELS.map((label, i) => {
            const count = elements.filter(
              (el) => el.side === VIEW_KEYS[i],
            ).length;
            const isActive = viewMode === "flat" && activeView === i;
            return (
              <button
                key={label}
                type="button"
                onClick={() => switchView(i)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  position: "relative",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "#F3F1EC",
                    border: isActive
                      ? `2px solid ${C.gold}`
                      : `1px solid ${C.border}`,
                    boxShadow: isActive ? C.shadow : "none",
                    padding: 6,
                    boxSizing: "border-box",
                    pointerEvents: "none",
                    transition:
                      "box-shadow 0.15s ease, border-color 0.15s ease",
                  }}
                >
                  <GarmentVisual
                    garmentKey={garment.key}
                    colorSlug={color.slug}
                    view={VIEW_KEYS[i]}
                  />
                </div>
                {count > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -2,
                      right: 24,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 999,
                      background: C.gold,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 3px",
                      pointerEvents: "none",
                    }}
                  >
                    {count}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? C.ink : C.muted,
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => {
              setSpinFloat(SPIN_ORDER.indexOf(currentSide));
              setViewMode("3d");
            }}
            style={{
              marginTop: 4,
              padding: "10px 18px",
              borderRadius: 999,
              border: "none",
              background: viewMode === "3d" ? C.goldDeep : C.gold,
              color: C.ink,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            TRY 360°
          </button>

          {selectedEl && (
            <div
              style={{
                width: "100%",
                marginTop: 8,
                paddingTop: 16,
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <p style={sectionLabelStyle}>EDIT</p>

              {selectedEl.type === "text" && (
                <>
                  <input
                    value={selectedEl.text}
                    onChange={(e) => updateSelected({ text: e.target.value })}
                    style={inputStyle}
                  />
                  <select
                    value={selectedEl.fontFamily}
                    onChange={(e) =>
                      updateSelected({ fontFamily: e.target.value })
                    }
                    style={{ ...inputStyle, marginTop: 8 }}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <input
                    type="color"
                    value={selectedEl.color}
                    onChange={(e) => updateSelected({ color: e.target.value })}
                    style={{
                      width: "100%",
                      height: 36,
                      marginTop: 8,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: 2,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <ToggleMiniBtn
                      active={!!selectedEl.bold}
                      onClick={() => updateSelected({ bold: !selectedEl.bold })}
                    >
                      <b>B</b>
                    </ToggleMiniBtn>
                    <ToggleMiniBtn
                      active={!!selectedEl.underline}
                      onClick={() =>
                        updateSelected({ underline: !selectedEl.underline })
                      }
                    >
                      <u>U</u>
                    </ToggleMiniBtn>
                    <ToggleMiniBtn
                      active={!!selectedEl.italic}
                      onClick={() =>
                        updateSelected({ italic: !selectedEl.italic })
                      }
                    >
                      <i>I</i>
                    </ToggleMiniBtn>
                  </div>
                </>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => rotateSelected(-15)}
                  style={miniBtnStyle}
                >
                  ⟲
                </button>
                <button onClick={() => rotateSelected(15)} style={miniBtnStyle}>
                  ⟳
                </button>
                <button onClick={duplicateSelected} style={miniBtnStyle}>
                  Copy
                </button>
                <button onClick={bringToFront} style={miniBtnStyle}>
                  Front
                </button>
                <button onClick={sendToBack} style={miniBtnStyle}>
                  Back
                </button>
                <button
                  onClick={deleteSelected}
                  style={{
                    ...miniBtnStyle,
                    color: C.danger,
                    borderColor: C.danger,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {visibleElements.length > 0 && (
            <div style={{ width: "100%", marginTop: 8 }}>
              <p style={sectionLabelStyle}>LAYERS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {visibleElements
                  .slice()
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((el) => (
                    <div
                      key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: `1px solid ${
                          selectedId === el.id ? C.gold : C.border
                        }`,
                        background: selectedId === el.id ? C.goldSoft : "#fff",
                        cursor: "pointer",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {el.type === "text"
                        ? `"${el.text.slice(0, 14)}"`
                        : "Uploaded design"}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .cust-workspace { flex-direction: column; }
          .cust-sidebar { width: 100% !important; flex-direction: row !important; justify-content: space-around; padding: 12px 0 !important; }
          .cust-rightpanel { width: 100% !important; border-left: none !important; border-top: 1px solid ${C.border}; flex-direction: row !important; flex-wrap: wrap; justify-content: center; }
        }
        @media (max-width: 700px) {
          .cust-productspanel, .cust-toolpanel { width: 100% !important; position: absolute; inset: 0; z-index: 30; }
        }
      `}</style>
    </StudioShell>
  );
}
// Smoothly fades between garment view photos instead of an abrupt swap —
// used in 3D spin mode so switching front/right/back/left doesn't jump.
function CrossfadeGarment({ garmentKey, colorSlug, view }) {
  const [current, setCurrent] = useState(view);
  const [incoming, setIncoming] = useState(null);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (view === current) return;
    setIncoming(view);
    setFadeIn(false);
    const raf = requestAnimationFrame(() => setFadeIn(true));
    const timer = setTimeout(() => {
      setCurrent(view);
      setIncoming(null);
      setFadeIn(false);
    }, 220);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <GarmentVisual
          garmentKey={garmentKey}
          colorSlug={colorSlug}
          view={current}
        />
      </div>
      {incoming && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: fadeIn ? 1 : 0,
            transition: "opacity 0.22s ease",
          }}
        >
          <GarmentVisual
            garmentKey={garmentKey}
            colorSlug={colorSlug}
            view={incoming}
          />
        </div>
      )}
    </div>
  );
}

// Continuous crossfade between the two nearest of the 4 view photos,
// driven by a fractional "spinFloat" position — this is what makes the
// drag feel like a smooth scrub instead of 4 discrete jumps.
function Spin360Blend({ garmentKey, colorSlug, spinFloat }) {
  const lowerIdx = Math.floor(spinFloat) % SPIN_ORDER.length;
  const upperIdx = (lowerIdx + 1) % SPIN_ORDER.length;
  const frac = spinFloat - Math.floor(spinFloat);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - frac }}>
        <GarmentVisual
          garmentKey={garmentKey}
          colorSlug={colorSlug}
          view={SPIN_ORDER[lowerIdx]}
        />
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: frac }}>
        <GarmentVisual
          garmentKey={garmentKey}
          colorSlug={colorSlug}
          view={SPIN_ORDER[upperIdx]}
        />
      </div>
    </div>
  );
}
function Logo() {
  return (
    <Link
      to="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        color: C.ink,
        padding: "8px 14px 8px 10px",
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.panel)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Back to Shop</span>
    </Link>
  );
}

function StatusLine({ children, color }) {
  return (
    <p
      style={{
        textAlign: "center",
        fontSize: 13,
        fontWeight: 600,
        color,
        margin: "12px 0 0",
      }}
    >
      {children}
    </p>
  );
}

// Shared shell for the left slide-over tool panels (Text/Image/Art), so
// they look and behave consistently with ProductsPanel/TutorialsPanel.
function ToolPanelShell({ title, onClose, children }) {
  return (
    <div
      className="cust-toolpanel"
      style={{
        width: 320,
        maxWidth: "100%",
        flexShrink: 0,
        background: "#fff",
        borderRight: `1px solid ${C.border}`,
        padding: "20px 24px 28px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: C.ink,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          {title}
        </p>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            border: "none",
            background: "none",
            fontSize: 16,
            cursor: "pointer",
            color: C.muted,
          }}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

// Step 1 of the Text tool — "CHOOSE FONT": searchable, paginated grid of
// font previews. Matches the reference site's panel: back arrow closes
// the whole tool, each card shows the family rendered in itself plus its
// name underneath, and a "Load More" button reveals more.
function FontChooserPanel({
  search,
  onSearchChange,
  page,
  onLoadMore,
  selectedFont,
  onPick,
  onBack,
}) {
  const filtered = FONT_OPTIONS.filter((f) =>
    f.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const visible = filtered.slice(0, page * FONTS_PER_PAGE);
  const hasMore = visible.length < filtered.length;

  return (
    <div
      className="cust-toolpanel"
      style={{
        width: 340,
        maxWidth: "100%",
        flexShrink: 0,
        background: "#fff",
        borderRight: `1px solid ${C.border}`,
        padding: "20px 24px 28px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          marginBottom: 18,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            position: "absolute",
            left: 0,
            border: "none",
            background: "none",
            fontSize: 20,
            color: C.ink,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ←
        </button>
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: C.ink,
            margin: 0,
          }}
        >
          CHOOSE FONT
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search Font"
        style={{ ...inputStyle, marginBottom: 16 }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {visible.map((font) => (
          <button
            key={font}
            onClick={() => onPick(font)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "14px 6px",
              borderRadius: 8,
              border: `1px solid ${font === selectedFont ? C.gold : C.border}`,
              background: "#fff",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontFamily: `"${font}", serif`,
                fontSize: 20,
                fontWeight: 700,
                color: C.ink,
                whiteSpace: "nowrap",
              }}
            >
              EXAMPLE
            </span>
            <span
              style={{
                fontSize: 11,
                color: C.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {font}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p style={{ fontSize: 12, color: C.muted, marginTop: 16 }}>
          No fonts match "{search}".
        </p>
      )}

      {hasMore && (
        <button
          onClick={onLoadMore}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "12px 0",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.ink,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Load More
        </button>
      )}
    </div>
  );
}

// Step 2 of the Text tool — the edit-fields panel that appears once a
// font has been picked: text box, font size + color, bold/underline/
// italic toggles, a way back into the font chooser, alignment, a text
// effect selector with a live preview, an internal add-note field, and
// the "Add Text" button that actually commits the element.
function TextEditPanel({
  draft,
  onChange,
  onReopenFont,
  onOpenColorPicker,
  onBack,
  onAdd,
}) {
  return (
    <div
      className="cust-toolpanel"
      style={{
        width: 340,
        maxWidth: "100%",
        flexShrink: 0,
        background: "#fff",
        borderRight: `1px solid ${C.border}`,
        padding: "20px 24px 28px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            border: "none",
            background: "none",
            fontSize: 18,
            color: C.ink,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ←
        </button>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, margin: 0 }}>
          Add Text
        </p>
      </div>

      <textarea
        autoFocus
        value={draft.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Your text here"
        rows={2}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={fieldLabelStyle}>Font Size</label>
          <select
            value={draft.fontSizePct}
            onChange={(e) => onChange({ fontSizePct: Number(e.target.value) })}
            style={inputStyle}
          >
            {FONT_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={fieldLabelStyle}>Color</label>
          <button
            type="button"
            onClick={onOpenColorPicker}
            title="Choose color"
            style={{
              width: 44,
              height: 40,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 2,
              background: draft.color,
              cursor: "pointer",
            }}
          />
        </div>
      </div>

      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>Font Style</label>
      <div style={{ display: "flex", gap: 6 }}>
        <ToggleMiniBtn
          active={draft.bold}
          onClick={() => onChange({ bold: !draft.bold })}
        >
          <b>B</b>
        </ToggleMiniBtn>
        <ToggleMiniBtn
          active={draft.underline}
          onClick={() => onChange({ underline: !draft.underline })}
        >
          <u>U</u>
        </ToggleMiniBtn>
        <ToggleMiniBtn
          active={draft.italic}
          onClick={() => onChange({ italic: !draft.italic })}
        >
          <i>I</i>
        </ToggleMiniBtn>
      </div>

      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>Font</label>
      <button
        onClick={onReopenFont}
        style={{
          ...inputStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontFamily: `"${draft.fontFamily}", serif`,
        }}
      >
        <span>{draft.fontFamily || "Choose a font"}</span>
        <span style={{ color: C.muted }}>▾</span>
      </button>

      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>
        Text Alignment
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        {TEXT_ALIGN_OPTIONS.map((a) => (
          <ToggleMiniBtn
            key={a}
            active={draft.align === a}
            onClick={() => onChange({ align: a })}
          >
            <AlignIcon type={a} />
          </ToggleMiniBtn>
        ))}
      </div>

      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>
        Text Effect{" "}
        <span style={{ textTransform: "none", fontWeight: 400 }}>
          ({TEXT_EFFECT_OPTIONS.find((e) => e.key === draft.effect)?.label})
        </span>
      </label>
      <select
        value={draft.effect}
        onChange={(e) => onChange({ effect: e.target.value })}
        style={{ ...inputStyle, marginBottom: 8 }}
      >
        {TEXT_EFFECT_OPTIONS.map((e) => (
          <option key={e.key} value={e.key}>
            {e.label}
          </option>
        ))}
      </select>
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "16px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 56,
          background: C.panel,
        }}
      >
        <TextEffectPreview
          text={draft.text.trim() || "YOUR DESIGN"}
          draft={draft}
          fontSizePx={22}
        />
      </div>

      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>Add Note</label>
      <input
        value={draft.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Note for our design team (optional)"
        style={inputStyle}
      />

      <button
        onClick={onAdd}
        style={{
          marginTop: 20,
          width: "100%",
          padding: "13px 0",
          borderRadius: 999,
          border: "none",
          background: C.ink,
          color: "#fff",
          fontWeight: 800,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Add Text
      </button>
    </div>
  );
}

function ToggleMiniBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: `1px solid ${active ? C.gold : C.border}`,
        background: active ? C.goldSoft : "#fff",
        color: C.ink,
        fontSize: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function AlignIcon({ type }) {
  const widths =
    type === "left"
      ? [16, 11, 14]
      : type === "center"
        ? [12, 16, 9]
        : type === "right"
          ? [14, 11, 16]
          : [16, 16, 16];
  const justify =
    type === "left"
      ? "flex-start"
      : type === "center"
        ? "center"
        : type === "right"
          ? "flex-end"
          : "flex-start";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: justify,
      }}
    >
      {widths.map((w, i) => (
        <span
          key={i}
          style={{ width: w, height: 2, background: C.ink, display: "block" }}
        />
      ))}
    </div>
  );
}

// Renders text with the chosen style + effect. "Straight" is the true
// render used on the actual canvas element too. The arc effects are a
// lightweight CSS approximation (skew) rather than true per-letter
// curved-baseline text — a nice-to-have upgrade for later if you want
// pixel-accurate curved text (would need an SVG <textPath>).
function TextEffectPreview({ text, draft, fontSizePx }) {
  const baseStyle = {
    fontFamily: `"${draft.fontFamily}", serif`,
    color: draft.color,
    fontWeight: draft.bold ? 700 : 400,
    fontStyle: draft.italic ? "italic" : "normal",
    textDecoration: draft.underline ? "underline" : "none",
    fontSize: fontSizePx,
    textAlign: draft.align,
    whiteSpace: "pre-wrap",
  };
  if (draft.effect === "arc-up") {
    return (
      <span
        style={{
          ...baseStyle,
          display: "inline-block",
          transform: "skewY(-6deg) scaleY(1.05)",
        }}
      >
        {text}
      </span>
    );
  }
  if (draft.effect === "arc-down") {
    return (
      <span
        style={{
          ...baseStyle,
          display: "inline-block",
          transform: "skewY(6deg) scaleY(1.05)",
        }}
      >
        {text}
      </span>
    );
  }
  return <span style={{ ...baseStyle, display: "block" }}>{text}</span>;
}

// "Add Image" panel — shows the recommended-format hint and a Browse
// button that opens the existing hidden file input, matching how the
// reference site's Add Image panel works.
function ImagePanel({ isUploading, onBrowse, onClose }) {
  return (
    <ToolPanelShell title="Add Image" onClose={onClose}>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
        Recommended format PNG, up to 20MB, 2000×2000px for best print quality.
      </p>
      <button
        onClick={onBrowse}
        disabled={isUploading}
        style={{
          width: "100%",
          padding: "34px 12px",
          borderRadius: 12,
          border: `1.5px dashed ${C.border}`,
          background: C.panel,
          color: C.ink,
          fontSize: 13,
          fontWeight: 700,
          cursor: isUploading ? "wait" : "pointer",
        }}
      >
        {isUploading ? "Uploading…" : "Browse Image"}
      </button>
    </ToolPanelShell>
  );
}

// "Add Art" panel — the reference site has a full clipart-category
// library here; that catalog isn't wired up on this build yet, so this
// is an honest placeholder that still lets you upload your own artwork
// via the same pipeline as Image.
// "Add Art" panel — two steps: browse categories (Marvel, Anime, etc.),
// then browse designs inside the picked category. Each design shows its
// price; clicking one adds it to the canvas via onSelectDesign. A
// "Upload your own artwork" fallback stays available at the bottom of
// the categories step, same pipeline as the Image tool.
function ArtPanel({
  categories,
  designs,
  onOpenCategory,
  onSelectDesign,
  onBrowseUpload,
  onClose,
}) {
  const [step, setStep] = useState("categories"); // "categories" | "designs"
  const [activeCategory, setActiveCategory] = useState(null);

  const handleBack = () => {
    if (step === "designs") {
      setStep("categories");
      setActiveCategory(null);
    } else {
      onClose();
    }
  };

  const handlePickCategory = (cat) => {
    setActiveCategory(cat);
    setStep("designs");
    onOpenCategory(cat._id);
  };

  return (
    <div
      className="cust-toolpanel"
      style={{
        width: 340,
        maxWidth: "100%",
        flexShrink: 0,
        background: "#fff",
        borderRight: `1px solid ${C.border}`,
        padding: "20px 24px 28px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          marginBottom: 18,
        }}
      >
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            position: "absolute",
            left: 0,
            border: "none",
            background: "none",
            fontSize: 18,
            color: C.ink,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ←
        </button>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: C.ink,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          {step === "categories" ? "Add Art" : activeCategory?.name}
        </p>
      </div>

      {step === "categories" && (
        <>
          {categories.length === 0 && (
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
              No art categories available yet.
            </p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat._id}
                onClick={() => handlePickCategory(cat)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <img
                  src={imgUrl(cat.thumbnail)}
                  alt={cat.name}
                  style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>
                  {cat.name}
                </span>
              </button>
            ))}
          </div>

          <p
            style={{
              fontSize: 11,
              color: C.muted,
              textAlign: "center",
              margin: "8px 0",
            }}
          >
            — or —
          </p>
          <button
            onClick={onBrowseUpload}
            style={{
              width: "100%",
              padding: "16px 12px",
              borderRadius: 12,
              border: `1.5px dashed ${C.border}`,
              background: C.panel,
              color: C.ink,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Upload Your Own Artwork
          </button>
        </>
      )}

      {step === "designs" && (
        <>
          {designs.length === 0 && (
            <p style={{ fontSize: 12, color: C.muted }}>
              No designs in this category yet.
            </p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {designs.map((d) => (
              <button
                key={d._id}
                onClick={() => onSelectDesign(d)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <img
                  src={imgUrl(d.imageUrl)}
                  alt={d.name}
                  style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    objectFit: "contain",
                    background: "#F7F5F0",
                    borderRadius: 8,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.ink,
                    textAlign: "center",
                  }}
                >
                  {d.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>
                  +₹{d.price}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Products slide-over: two steps, matching yourdesignstore.in ──
//
// Step "products": grid of every garment type (ALL PRODUCTS header,
// back arrow closes the whole panel).
// Step "colors": grid of colors for whichever garment was just
// clicked (CHOOSE COLOR header, back arrow returns to "products").
// Picking a color calls onSelectColor(garmentKey, colorSlug), which
// the parent uses to navigate — this component doesn't know about
// routing itself.
function ProductsPanel({
  currentGarmentKey,
  currentColorSlug,
  garmentTypes,
  garmentImages,
  onClose,
  onSelectColor,
}) {
  const [step, setStep] = useState("products"); // "products" | "colors"
  const [pickedGarmentKey, setPickedGarmentKey] = useState(currentGarmentKey);

  const pickedGarment = garmentTypes.find((g) => g.key === pickedGarmentKey);
  const pickedGarmentColors = garmentImages
    .filter((d) => d.garmentType === pickedGarmentKey)
    .map((d) => ({ slug: d.colorSlug, name: d.colorName, hex: d.colorHex }));

  const handleBack = () => {
    if (step === "colors") {
      setStep("products");
    } else {
      onClose();
    }
  };

  const handlePickGarment = (g) => {
    setPickedGarmentKey(g.key);
    setStep("colors");
  };

  return (
    <div
      className="cust-productspanel"
      style={{
        width: 460,
        maxWidth: "100%",
        flexShrink: 0,
        background: "#fff",
        borderRight: `1px solid ${C.border}`,
        padding: "20px 28px 28px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          marginBottom: 24,
        }}
      >
        <button
          onClick={handleBack}
          aria-label="Back"
          style={{
            position: "absolute",
            left: 0,
            border: "none",
            background: "none",
            fontSize: 20,
            color: C.ink,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ←
        </button>
        <p
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: C.ink,
            margin: 0,
          }}
        >
          {step === "products" ? "ALL PRODUCTS" : "CHOOSE COLOR"}
        </p>
      </div>

      {step === "products" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {garmentTypes.map((g) => {
            const firstColor = garmentImages.find(
              (d) => d.garmentType === g.key,
            );
            return (
              <button
                key={g.key}
                onClick={() => handlePickGarment(g)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 10px",
                  borderRadius: 14,
                  border: `1px solid ${
                    g.key === currentGarmentKey ? C.gold : C.border
                  }`,
                  background: "#fff",
                  cursor: "pointer",
                  boxShadow:
                    g.key === currentGarmentKey
                      ? "0 4px 14px rgba(201,162,75,0.18)"
                      : "0 1px 4px rgba(28,26,20,0.05)",
                  transition:
                    "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.gold;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 16px rgba(201,162,75,0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    g.key === currentGarmentKey ? C.gold : C.border;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    g.key === currentGarmentKey
                      ? "0 4px 14px rgba(201,162,75,0.18)"
                      : "0 1px 4px rgba(28,26,20,0.05)";
                }}
              >
                <div style={{ width: 70, height: 70 }}>
                  {firstColor ? (
                    <GarmentVisual
                      garmentKey={g.key}
                      colorSlug={firstColor.colorSlug}
                      view="front"
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#F3F1EC",
                        borderRadius: 8,
                        fontSize: 9,
                        color: C.muted,
                        textAlign: "center",
                      }}
                    >
                      No photo
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.ink,
                    textAlign: "center",
                    lineHeight: 1.3,
                  }}
                >
                  {g.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === "colors" && pickedGarment && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {pickedGarmentColors.length === 0 && (
            <p style={{ fontSize: 13, color: C.muted, gridColumn: "1 / -1" }}>
              No colors uploaded for this product yet.
            </p>
          )}
          {pickedGarmentColors.map((c) => {
            const isSelected =
              pickedGarment.key === currentGarmentKey &&
              c.slug === currentColorSlug;
            return (
              <button
                key={c.slug}
                onClick={() => onSelectColor(pickedGarment.key, c.slug)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 10px",
                  borderRadius: 12,
                  border: `1px solid ${isSelected ? C.gold : C.border}`,
                  background: "#fff",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.gold;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isSelected
                    ? C.gold
                    : C.border;
                }}
              >
                <div style={{ width: 78, height: 90 }}>
                  <GarmentVisual
                    garmentKey={pickedGarment.key}
                    colorSlug={c.slug}
                    view="front"
                  />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TutorialsPanel({ onClose }) {
  const steps = [
    "How to add Text",
    "How to upload Image",
    "How to add Art",
    "How to resize Art",
    "How to save your design",
  ];
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: C.bg,
        borderRight: `1px solid ${C.border}`,
        padding: 24,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <p style={{ ...sectionLabelStyle, marginBottom: 0 }}>Tutorials</p>
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "none",
            fontSize: 16,
            cursor: "pointer",
            color: C.muted,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((s) => (
          <div
            key={s}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              fontSize: 13,
              color: C.ink,
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function StudioShell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}

function CenterMessage({ children, color }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p style={{ color }}>{children}</p>
    </div>
  );
}

function ToolbarButton({ label, icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "6px 10px",
        borderRadius: 8,
        border: "none",
        background: "none",
        fontSize: 15,
        color: disabled ? "#C9C4B6" : C.ink,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: 9, color: disabled ? "#C9C4B6" : C.muted }}>
        {label}
      </span>
    </button>
  );
}

function SidebarIcon({ icon, label, onClick, badgeBg, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        padding: "12px 8px",
        width: "100%",
        border: "none",
        background: "none",
        cursor: "pointer",
        borderRadius: 12,
        transition: "background 0.15s ease, transform 0.1s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = C.panel;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: badgeBg || C.goldSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          boxShadow: active
            ? `0 0 0 2px ${C.gold}, ${C.shadow}`
            : "0 2px 6px rgba(28,26,20,0.08)",
          transition: "box-shadow 0.15s ease",
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: active ? C.ink : C.muted,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 999,
        border: `1px solid ${active ? C.gold : C.border}`,
        background: active ? C.goldSoft : "#fff",
        color: active ? C.ink : C.muted,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const sectionLabelStyle = {
  fontSize: 12,
  letterSpacing: "0.12em",
  color: "#15130F",
  textTransform: "uppercase",
  fontWeight: 700,
  marginBottom: 12,
};

const fieldLabelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.muted,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontSize: 13,
  color: C.ink,
  boxSizing: "border-box",
};

const miniBtnStyle = {
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: "#fff",
  color: C.ink,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const linkBtnStyle = {
  border: "none",
  background: "none",
  color: C.gold,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
};
