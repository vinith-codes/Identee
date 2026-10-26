// Admin → Studio: the editor's panels (25 Oct 2026). Text, picture and layer controls for the selected item, and the
// "What to add" tabs (text, upload, the art library). Copied from the customer design room's editor (studio/
// DesignRoomPage.jsx) without the customer-only parts (team names, linked texts, daily limits).
import { useEffect, useMemo, useState } from "react";
import WaitCard from "../../../studio/WaitCard";
import artDesignService from "../../../services/artDesignService";
import { imageUrl } from "../../../utils/imageUrl";
import { FONTS } from "../../../studio/fonts";
import { printSharpness } from "../../../studio/designCheck";
import MyPictures from "../../../studio/MyPictures";
import { ADD_TABS, ICON_AI, INKS, quarterTurn } from "./studioBits";

export function AddTabs({ tab, onTab }) {
  return (
    <div className="dr-addtabs" role="tablist" aria-label="What to add">
      {ADD_TABS.map(([k, label, icon]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dr-addtab${tab === k ? " on" : ""}`} onClick={() => onTab(k)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icon} />
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}

export function TextTab({ onAdd }) {
  return (
    <>
      <button type="button" className="dr-add big" onClick={() => onAdd("YOUR TEXT")}>Add a heading</button>
      <button type="button" className="dr-add" onClick={() => onAdd("your text here", { small: true })}>Add a small line</button>
      <div className="dr-two">
        <button type="button" className="dr-add" onClick={() => onAdd("YOUR TEXT", { effect: "arc-up" })}>Curved up</button>
        <button type="button" className="dr-add" onClick={() => onAdd("YOUR TEXT", { effect: "arc-down" })}>Curved down</button>
        <button type="button" className="dr-add" onClick={() => onAdd("YOUR TEXT", { vertical: "up" })}>Vertical (reads up)</button>
        <button type="button" className="dr-add" onClick={() => onAdd("YOUR TEXT", { vertical: true })}>Vertical (reads down)</button>
      </div>
      <p className="dr-empty">Change the words, font, colour and size after adding.</p>
    </>
  );
}

export function UploadTab({ onPick, onAssistant }) {
  return (
    <>
      <button type="button" className="dr-drop" onClick={onPick}>
        <b>Upload a picture or logo</b>
        <span>JPG, PNG or WebP · up to 10 MB</span>
      </button>
      <button type="button" className="dr-add idea" onClick={onAssistant}>
        Or ask the picture assistant to draw one →
      </button>
      <p className="dr-empty">The print check tells you if a picture is too small to print sharp.</p>
    </>
  );
}

// The AI pictures tab (26 Oct 2026): what the assistant made in this room (newest first), then every picture made
// before (My pictures). Tapping one asks where it goes (PlacePicker) — nothing lands on the tee by itself.
export function AiPicturesTab({ results, onPick, onAssistant }) {
  return (
    <div className="st-aitab">
      <button type="button" className="dr-add idea" onClick={onAssistant}>
        ✦ Make a new picture with the assistant →
      </button>
      {results.length > 0 && (
        <>
          <div className="eyebrow">Made in this room</div>
          <div className="st-aigrid">
            {results.map((r) => (
              <button key={r.id} type="button" className={`dr-artitem${r.used ? " used" : ""}`} title={r.prompt} onClick={() => onPick(r)}>
                <img src={imageUrl(r.url, 240)} alt={r.prompt} loading="lazy" decoding="async" />
                <span>{String(r.prompt || "").slice(0, 28)}</span>
                <b>{r.kind}{r.used ? " · on the tee" : ""}</b>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="eyebrow">Made before, on any tee</div>
      <MyPictures loggedIn onPick={(p) => onPick({ id: p.id, url: p.url, width: p.width || 1024, height: p.height || 1024, kind: ["whole", "title", "hero", "background", "logo"].includes(p.style) ? p.style : "whole", cost: 0, service: "google", cut: true, prompt: p.about || "", look: "" })} />
    </div>
  );
}

// The free art library: a search box and the groups; a group opens 24 at a time.
const ART_PAGE = 24;
export function ArtPicker({ onPick }) {
  const [all, setAll] = useState(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState(null);
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
  const groups = useMemo(() => {
    const m = new Map();
    for (const d of all || []) {
      const name = d.category?.name || "Other";
      if (!m.has(name)) m.set(name, []);
      m.get(name).push(d);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const term = q.trim().toLowerCase();
  const found = term ? (all || []).filter((d) => `${d.name} ${d.category?.name || ""}`.toLowerCase().includes(term)) : null;
  const list = found || (group ? groups.find(([g]) => g === group)?.[1] || [] : null);
  return (
    <div className="dr-artpanel">
      <div className="dr-artsearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(ART_PAGE);
          }}
          placeholder={all?.length ? `Search ${all.length} free designs…` : "Search the designs…"}
          aria-label="Search the free designs"
        />
        {q && <button type="button" className="dr-artclear" onClick={() => setQ("")} aria-label="Clear the search">✕</button>}
      </div>
      {all === null && <p className="dr-empty">Opening the designs…</p>}
      {all !== null && !all.length && <p className="dr-empty">{failed ? "The designs didn’t load. Check the connection and try again." : "No designs in the library yet."}</p>}
      {!list && (
        <div className="dr-artcats">
          {groups.map(([name, items]) => (
            <button key={name} type="button" className="dr-artcat" onClick={() => { setGroup(name); setShown(ART_PAGE); }}>
              <span className={`dr-artquad n${Math.min(4, items.length)}`} aria-hidden="true">
                {items.slice(0, 4).map((d) => <img key={d._id} src={imageUrl(d.imageUrl, 140)} alt="" loading="lazy" decoding="async" />)}
              </span>
              <b>{name}</b>
              <small>{items.length} design{items.length === 1 ? "" : "s"}</small>
            </button>
          ))}
        </div>
      )}
      {list && (
        <>
          <div className="dr-arthead">
            {!found && <button type="button" className="dr-chip" onClick={() => setGroup(null)}>← All groups</button>}
            <span>{found ? `${found.length} found for “${q.trim()}”` : `${group} · ${list.length} free`}</span>
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
          {found && !found.length && <p className="dr-empty">Nothing called “{q.trim()}”. Try a shorter word.</p>}
          {list.length > shown && (
            <button type="button" className="dr-artmore" onClick={() => setShown((n) => n + ART_PAGE)}>
              Show more · {list.length - shown} left
            </button>
          )}
        </>
      )}
    </div>
  );
}

// The selected item's settings. onPatch(patch, { measure }) — measure: a text's box must be measured again.
// The items on the open print area, top first (Step 2, 25 Oct 2026): tap one to select it, ↑ ↓ to reorder, ✕ to delete.
export function LayersPanel({ items, selectedId, onSelect, onMove, onDelete }) {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
  return (
    <div className="st-layers" aria-label="Layers">
      <div className="dr-addhead">
        <span>Layers · top first</span>
      </div>
      {sorted.map((e, i) => (
        <div key={e.id || `i${i}`} className={`st-layer${e.id === selectedId ? " on" : ""}`}>
          <button type="button" className="st-layer-main" onClick={() => onSelect(e.id)} aria-pressed={e.id === selectedId}>
            {e.type === "image" ? <img src={imageUrl(e.src, 80)} alt="" /> : <span className="st-layer-t">T</span>}
            <span>{e.type === "text" ? String(e.text || "Text").replace(/\s+/g, " ").slice(0, 26) : "Picture"}</span>
          </button>
          <button type="button" aria-label="Bring forward" title="Bring forward" disabled={i === 0} onClick={() => onMove(e.id, 1)}>↑</button>
          <button type="button" aria-label="Send back" title="Send back" disabled={i === sorted.length - 1} onClick={() => onMove(e.id, -1)}>↓</button>
          <button type="button" aria-label="Delete" title="Delete" className="st-layer-x" onClick={() => onDelete(e.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

// "Change this picture": the AI redraws the selected picture with one instruction (Step 2). grok: Grok is set up.
function ChangeBox({ prices, grok, busy, onChange }) {
  const [text, setText] = useState("");
  const [real, setReal] = useState(false);
  const price = real ? prices.grok : prices.google;
  return (
    <div className="st-change">
      <b>Change this picture</b>
      <small>The AI redraws it with your instruction; the rest stays the same. Not right? Undo (↶) brings the old one back.</small>
      <textarea rows={2} value={text} maxLength={500} placeholder="e.g. make the lighting warmer · add rain · turn him to face left" onChange={(e) => setText(e.target.value)} disabled={busy} />
      {grok && (
        <label className="st-switch small">
          <input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} disabled={busy} />
          <span>
            <b>Real person</b>
            <small>Grok changes it (₹{prices.grok})</small>
          </span>
        </label>
      )}
      {busy ? (
        <WaitCard label="Changing the picture…" expect={25} hint="Usually 20–40 seconds." />
      ) : (
        <button type="button" className="dr-chip on" disabled={text.trim().length < 3 || (!grok && real)} onClick={() => onChange(text.trim(), real, () => setText(""))}>
          Change it · ₹{price}
        </button>
      )}
    </div>
  );
}

export function Controls({ sel, areaCmW, areaRatio, positions = [], prices = { google: 0, grok: 0 }, grok = false, changing = false, onPatch, onDelete, onDuplicate, onLayer, onRemoveBg, onAddMore, onAlign, onCopyTo, onChangePicture }) {
  const quality = () => {
    if (!sel?.pxW && !sel?.printW) return null;
    const printCm = ((sel.width || 0) / 100) * areaCmW;
    const sharp = printSharpness(Math.max(sel.pxW || 0, sel.printW || 0), printCm, false);
    const dpi = Math.round(sharp.now);
    const cls = dpi >= 150 ? "good" : dpi >= 100 ? "ok" : "low";
    const word = { good: "Good", ok: "OK", low: "Low — may print blurry" }[cls];
    return (
      <div className="dr-quality">
        Print quality: <b className={cls}>{word}</b> · {printCm.toFixed(1)} cm wide · {dpi} DPI{sel.printW ? " · 4K print copy ✓" : ""}
      </div>
    );
  };
  return (
    <div className="dr-controls">
      <div className="dr-addhead">
        <span>Tap another item on the print area to edit it, or add more:</span>
        <div className="dr-addmore" role="group" aria-label="Add more to this print area">
          {ADD_TABS.map(([k, label, icon]) => (
            <button key={k} type="button" className="dr-addmore-btn" onClick={() => onAddMore(k)} aria-label={`Add ${label.toLowerCase()}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={icon} />
              </svg>
              <span>{label}</span>
            </button>
          ))}
          <button type="button" className="dr-addmore-btn" onClick={() => onAddMore("ai")} aria-label="Ask the picture assistant">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON_AI} />
            </svg>
            <span>AI picture</span>
          </button>
        </div>
      </div>
      {sel?.type === "text" && (
        <>
          <label className="dr-field">
            Words
            <textarea rows={Math.min(4, Math.max(1, (sel.text || "").split("\n").length))} value={sel.text} maxLength={200} placeholder="Your text" onChange={(e) => onPatch({ text: e.target.value || " " }, { measure: true })} />
            <small>Press Enter for a new line.</small>
          </label>
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
              <button type="button" className="dr-tgl" title="Switch between CAPITALS and small letters" onClick={() => onPatch({ text: sel.text === sel.text.toUpperCase() ? sel.text.toLowerCase() : sel.text.toUpperCase() }, { measure: true })}>Aa</button>
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
                <button key={k} type="button" className={`dr-ink${sel.strokeWidthPct > 0 && sel.strokeColor === k ? " on" : ""}`} style={{ background: k }} aria-label={`Outline ${k}`} onClick={() => onPatch({ strokeColor: k, strokeWidthPct: sel.strokeWidthPct > 0 ? sel.strokeWidthPct : 4 })} />
              ))}
              <input type="color" className="dr-inkpick" value={sel.strokeColor || "#141110"} aria-label="Pick any outline colour" onChange={(e) => onPatch({ strokeColor: e.target.value.toUpperCase(), strokeWidthPct: sel.strokeWidthPct > 0 ? sel.strokeWidthPct : 4 })} />
            </div>
            {sel.strokeWidthPct > 0 && <input type="range" min="1" max="12" step="0.5" value={sel.strokeWidthPct} aria-label="Outline thickness" onChange={(e) => onPatch({ strokeWidthPct: +e.target.value })} />}
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
                <small>Free. Works in this browser; the first time takes a little longer.</small>
              </span>
            </button>
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
          {!sel.artDesignId && onChangePicture && <ChangeBox key={sel.id} prices={prices} grok={grok} busy={changing} onChange={onChangePicture} />}
        </>
      )}
      {sel && (
        <>
          <label className="dr-field">
            Rotate
            <input type="range" min="-180" max="180" value={sel.rotation || 0} onChange={(e) => onPatch({ rotation: +e.target.value })} />
          </label>
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
                  const shape = ((sel.width || 50) / (sel.height || 50)) * areaRatio;
                  if (Math.abs((sel.rotation || 0) % 180) === 90) {
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
          <div className="dr-field">
            Line it up in the area
            <div className="dr-row st-align" role="group" aria-label="Align">
              {[
                ["left", "Left"],
                ["centreX", "Centre"],
                ["right", "Right"],
                ["top", "Top"],
                ["centreY", "Middle"],
                ["bottom", "Bottom"],
              ].map(([k, label]) => (
                <button key={k} type="button" className="dr-chip" onClick={() => onAlign(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="dr-row">
            <label className="dr-field">
              See-through · {Math.round((sel.opacity ?? 1) * 100)}%
              <input type="range" min="10" max="100" value={Math.round((sel.opacity ?? 1) * 100)} onChange={(e) => onPatch({ opacity: +e.target.value / 100 })} />
            </label>
            <div className="dr-field">
              Mirror
              <div className="dr-row">
                <button type="button" className={`dr-chip${sel.flipH ? " on" : ""}`} aria-pressed={!!sel.flipH} onClick={() => onPatch({ flipH: !sel.flipH })}>⇋ Left–right</button>
                <button type="button" className={`dr-chip${sel.flipV ? " on" : ""}`} aria-pressed={!!sel.flipV} onClick={() => onPatch({ flipV: !sel.flipV })}>⇅ Up–down</button>
              </div>
            </div>
          </div>
          {positions.length > 1 && (
            <label className="dr-field">
              Copy it to another area <small style={{ fontWeight: 400 }}>(the same size in cm)</small>
              <select value="" onChange={(e) => e.target.value && onCopyTo(e.target.value)}>
                <option value="">Choose an area…</option>
                {positions.filter((p) => p.key !== sel.position).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
}
