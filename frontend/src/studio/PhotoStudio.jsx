// studio/PhotoStudio.jsx
//
// "Your photo → your tee": the Design Room's highlighted photo feature. The customer uploads a photo, then
// either turns it into ART (the image AI's photo styles, or our free instant filters) or keeps it a PHOTO made
// print-ready (background removed — free, in the browser — and, if they like, enhanced by the image AI).
// The results go on the tee with one tap, with a print-quality check for photos.
//
// Never stuck: every step has a way back, a slow step shows the wait card, and a failed step says why and
// offers Try again. What the panel needs from the page comes in as functions (upload, art, printReady, place).
import { useRef, useState } from "react";
import { imageUrl } from "../utils/imageUrl";
import WaitCard from "./WaitCard";

// What each photo style looks like, in a few words, and a little colour swatch for its card.
const STYLE_INFO = {
  Cartoon: ["Bold outlines, flat colours", "linear-gradient(135deg,#FFB547,#FF6B6B)"],
  Sketch: ["A hand-drawn pencil sketch", "linear-gradient(135deg,#E9E4D8,#8A8172)"],
  Sticker: ["Die-cut, with a white border", "linear-gradient(135deg,#7FD1FF,#B57BFF)"],
  Watercolour: ["Soft, painted look", "linear-gradient(135deg,#9FE3C7,#F7B2C4)"],
  "Pop art": ["Halftone dots, strong colours", "linear-gradient(135deg,#FFE14D,#FF3EA5)"],
};
const FREE_INFO = ["4 instant looks: sketch, stencil, poster, pop art", "linear-gradient(135deg,#2A2622,#C9A24B)"];
const isFree = (s) => /free/i.test(s);

/**
 * @param ai        { available, loggedIn, left, photoStyles }
 * @param target    { label, cm: [w, h] } — the print area the result goes on
 * @param session   the studio's state, kept by the page (so it is still there after closing and opening again)
 * @param onUpload  (file) => Promise<{ url, w, h }>
 * @param onArt     (url, style) => Promise<{ images: [{ url, width, height, label }], left?, filtered?, refused? }>
 * @param onPrintReady (photo, { cutOut, enhance }, progress) => Promise<{ url, w, h, enhanced, cut }>
 * @param onPlace   (result) => Promise<boolean>  put a result on the tee
 */
export default function PhotoStudio({ ai, target, fabric, session, setSession, onLogin, onUpload, onArt, onPrintReady, onPlace, onClose }) {
  const { photo = null, view = "pick", results = [], resultKind = null, placed = {}, error = null, wait = null, last = null } = session;
  const set = (patch) => setSession((s) => ({ ...s, ...patch }));
  const fileRef = useRef(null);
  const steps = useRef(0); // numbers each step, so its wait card keeps one count
  const [cutOut, setCutOut] = useState(true);
  const [enhance, setEnhance] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const aiOk = ai.available && ai.loggedIn && ai.left !== 0;
  const styles = (ai.photoStyles || []).filter((s) => isFree(s) || ai.available);

  // runs one step; the panel shows the wait card meanwhile, and the step's error (with Try again) if it fails
  const step = async (waitInfo, job, retry) => {
    steps.current += 1;
    const id = steps.current;
    set({ view: "working", wait: { ...waitInfo, id }, error: null, last: retry });
    try {
      await job((label) => set({ wait: { ...waitInfo, id, label } }));
    } catch (err) {
      set({ view: "error", error: err?.message || "That didn’t work." });
    }
  };

  const pickFile = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return set({ view: "error", error: "Please choose a JPG, PNG or WebP photo.", last: null });
    if (file.size > 10 * 1024 * 1024) return set({ view: "error", error: "That photo is over 10 MB. Please choose a smaller one.", last: null });
    step({ label: "Uploading your photo…" }, async () => {
      const up = await onUpload(file);
      set({ photo: { ...up, name: file.name }, view: "choose", results: [], placed: {} });
    }, () => pickFile(file));
  };
  const makeArt = (style) =>
    step(
      isFree(style) ? { label: "Making 4 art looks…", expect: 6 } : { label: `Turning your photo into ${style.toLowerCase()} art…`, expect: 35, hint: "Usually 20–40 seconds. You can look around the room meanwhile." },
      async () => {
        const res = await onArt(photo.url, style);
        set({ view: "results", resultKind: "art", results: res.images.map((im) => ({ url: im.url, w: im.width, h: im.height, label: im.label || style })), note: res.refused ? "The AI wouldn’t redraw this photo (it refuses some photos, well-known faces among them), so here are free art looks made another way." : null });
      },
      () => makeArt(style),
    );
  const makePhoto = () =>
    step(
      enhance ? { label: "Enhancing your photo…", expect: 30, hint: "Usually 20–40 seconds." } : { label: "Removing the background…", expect: 8, hint: "Done here in your browser, free." },
      async (progress) => {
        const r = await onPrintReady(photo, { cutOut, enhance }, progress);
        set({ view: "results", resultKind: "photo", results: [{ ...r, label: [r.enhanced && "Enhanced", r.cut && "Background removed"].filter(Boolean).join(" · ") || "Your photo" }], note: null });
      },
      makePhoto,
    );
  const place = async (r) => {
    if (await onPlace(r)) set({ placed: { ...placed, [r.url]: target.label } });
  };

  // print quality of a photo at this area's size: pixels per inch when it fills the area
  const quality = (r) => {
    if (!r.w || !r.h || !target.cm) return null;
    const [aw, ah] = target.cm;
    const printW = Math.min(aw, (ah * r.w) / r.h); // cm, as large as the area allows
    const dpi = Math.round(r.w / (printW / 2.54));
    return dpi >= 150 ? ["good", `Sharp at full size on ${target.label} (${dpi} DPI)`] : dpi >= 100 ? ["ok", `Good at full size (${dpi} DPI)`] : ["low", `May look soft at full size (${dpi} DPI) — print it smaller${r.enhanced ? "" : ", or enhance it"}`];
  };

  return (
    <div className="ps">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickFile(f); }} />

      {view === "pick" && (
        <div className="ps-body">
          {ai.loggedIn ? (
            <button
              type="button"
              className={`ps-drop${dragOver ? " over" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="4" /></svg>
              <b>Choose a photo</b>
              <span>or drop it here · JPG, PNG or WebP · up to 10 MB</span>
            </button>
          ) : (
            <div className="ps-drop static">
              <b>Log in to upload your photo</b>
              <span>Your design stays here while you log in.</span>
              <button type="button" className="ps-btn gold" onClick={onLogin}>Log in</button>
            </div>
          )}
          <div className="ps-promise">
            <div><i className="ps-dot art" /><b>Turn it into art</b><span>Cartoon, sketch, sticker, watercolour, pop art — or free instant looks</span></div>
            <div><i className="ps-dot photo" /><b>Or keep it a photo, print-ready</b><span>Background removed, and sharpened if you like</span></div>
          </div>
          <p className="ps-small">Best results: one clear person, pet or thing, in good light.</p>
        </div>
      )}

      {view === "choose" && photo && (
        <div className="ps-body">
          <div className="ps-photo">
            <img src={imageUrl(photo.url, 300)} alt="Your photo" />
            <div>
              <b>Your photo</b>
              <span>{photo.w} × {photo.h} px</span>
              <button type="button" className="ps-link" onClick={() => fileRef.current?.click()}>Use a different photo</button>
            </div>
          </div>

          <h3 className="ps-h">Turn it into art</h3>
          {!aiOk && ai.available && (
            <p className="ps-small">{!ai.loggedIn ? "Log in to use the AI styles." : "You’ve used today’s AI requests — they reset tomorrow. The free looks still work."}</p>
          )}
          <div className="ps-styles">
            {styles.map((s) => {
              const [what, swatch] = isFree(s) ? FREE_INFO : STYLE_INFO[s] || ["", "#ddd"];
              const off = !isFree(s) && !aiOk;
              return (
                <button key={s} type="button" className={`ps-style${isFree(s) ? " free" : ""}`} disabled={off} onClick={() => makeArt(s)}>
                  <i style={{ background: swatch }} aria-hidden="true" />
                  <b>{isFree(s) ? "Free instant looks" : s}</b>
                  <span>{what}</span>
                  {!isFree(s) && <em>AI · 1 request</em>}
                </button>
              );
            })}
          </div>

          <h3 className="ps-h">Or keep it a photo — print-ready</h3>
          <div className="ps-photo-opts">
            <label><input type="checkbox" checked={cutOut} onChange={(e) => setCutOut(e.target.checked)} /> Remove the background <small>free</small></label>
            {ai.available && (
              <label className={aiOk ? "" : "off"}>
                <input type="checkbox" checked={enhance && aiOk} disabled={!aiOk} onChange={(e) => setEnhance(e.target.checked)} /> Enhance with AI — sharper, cleaner light <small>1 request</small>
              </label>
            )}
            <button type="button" className="ps-btn gold" onClick={makePhoto}>Make it print-ready</button>
          </div>
          {ai.left != null && ai.available && <p className="ps-small">{ai.left} AI request{ai.left === 1 ? "" : "s"} left today.</p>}
        </div>
      )}

      {view === "working" && wait && (
        <div className="ps-body">
          {photo && <img className="ps-ghost" src={imageUrl(photo.url, 300)} alt="" />}
          <WaitCard key={wait.id} label={wait.label} expect={wait.expect} hint={wait.hint} />
        </div>
      )}

      {view === "error" && (
        <div className="ps-body">
          <div className="ps-error" role="alert">
            <b>That didn’t work</b>
            <span>{error}</span>
          </div>
          <div className="ps-actions">
            {last && <button type="button" className="ps-btn gold" onClick={() => last()}>↻ Try again</button>}
            <button type="button" className="ps-btn" onClick={() => set({ view: photo ? "choose" : "pick", error: null })}>{photo ? "Back to the choices" : "Choose a photo"}</button>
          </div>
        </div>
      )}

      {view === "results" && (
        <div className="ps-body">
          {session.note && <p className="ps-note">{session.note}</p>}
          <div className={`ps-results${results.length === 1 ? " one" : ""}`}>
            {results.map((r) => {
              const q = resultKind === "photo" ? quality(r) : null;
              return (
                <div key={r.url} className="ps-result">
                  <img src={imageUrl(r.url, 500)} alt={r.label} style={{ background: fabric }} />
                  <b>{r.label}</b>
                  {q && <span className={`ps-q ${q[0]}`}>{q[1]}</span>}
                  {placed[r.url] ? (
                    <span className="ps-on">On {placed[r.url]} ✓</span>
                  ) : (
                    <button type="button" className="ps-btn gold" onClick={() => place(r)}>Add to tee</button>
                  )}
                  {q?.[0] === "low" && !r.enhanced && aiOk && (
                    <button type="button" className="ps-link" onClick={() => { setEnhance(true); set({ view: "choose" }); }}>Enhance it with AI</button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="ps-actions">
            <button type="button" className="ps-btn" onClick={() => set({ view: "choose" })}>{resultKind === "art" ? "Try another style" : "Other options"}</button>
            <button type="button" className="ps-btn" onClick={() => fileRef.current?.click()}>A different photo</button>
            <button type="button" className="ps-btn dark" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
