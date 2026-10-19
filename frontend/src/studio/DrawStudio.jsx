// studio/DrawStudio.jsx
//
// The AI panel's "Draw" tab: describe a design, pick a style card, and the image AI draws it for a print
// area. Then Add to tee, Try another (the same request again), or Change it ("make it angrier").
// Same look and rules as the Photo Studio (PhotoStudio.jsx): every step has a way back, a slow step shows
// the wait card with a Stop button, a failed one says why and offers Try again, and nothing that was made
// is thrown away — earlier designs stay under "Earlier designs". What it needs from the page comes in as functions.
import { useRef, useState } from "react";
import { imageUrl } from "../utils/imageUrl";
import WaitCard from "./WaitCard";
import IdeaPreview from "./IdeaPreview";
import EarlierResults from "./EarlierResults";
import { keepEarlier } from "./keepEarlier";

// What each design style looks like, in a few words, and a colour swatch for its card.
const STYLE_INFO = {
  "Bold mascot": ["Thick outlines, flat colours, sporty", "linear-gradient(135deg,#FFB547,#D85A30)"],
  "Minimal line art": ["A few clean lines, lots of space", "linear-gradient(135deg,#F1EFE8,#888780)"],
  "Retro badge": ["A vintage round emblem", "linear-gradient(135deg,#F0997B,#712B13)"],
  Cartoon: ["Friendly, clean outlines", "linear-gradient(135deg,#AFA9EC,#534AB7)"],
  Watercolour: ["Soft painted edges", "linear-gradient(135deg,#9FE3C7,#F7B2C4)"],
  "Hand lettering": ["Your words as the design", "linear-gradient(135deg,#444441,#C9A24B)"],
};
const IDEAS = ["A lion holding a cricket bat", "A mountain sunrise", "A cup of filter coffee", "A phoenix"];
const WAIT_HINT = "Usually 20–40 seconds. You can look around the room meanwhile.";
const STOPPED = "Stopped. Nothing was added to your tee. (If the picture was already being drawn, it may still count as one of today’s requests.)";

/**
 * @param ai       { available, loggedIn, left, styles }
 * @param areas    [{ key, label, free }] — where it can go; target = the one chosen now
 * @param onDraw   ({ subject, style, areaKey }) => Promise<{ images: [{ url, width, height }], left? }>
 * @param onChange ({ baseUrl, change, areaKey }) => Promise<{ images, left? }>
 * @param onPlace  (url, areaKey) => Promise<boolean>
 * @param onImprove (idea) => Promise<{ prompt, expect, style, area }>  "Improve my idea" (text AI, free)
 */
export default function DrawStudio({ ai, areas, targetKey, fabric, session, setSession, onLogin, onDraw, onChange, onPlace, onImprove, onClose }) {
  const { subject = "", style = null, areaKey = null, view = "form", results = [], earlier = [], placed = {}, error = null, wait = null, last = null, changing = null, ownWords = null, note = null } = session;
  const set = (patch) => setSession((s) => ({ ...s, ...patch }));
  const steps = useRef(0);
  const running = useRef(null); // the step running now: { stopped, back }
  const [missing, setMissing] = useState("");
  const [change, setChange] = useState("");
  const [pickFor, setPickFor] = useState(null); // the design whose "Other area" choices are open
  // "Improve my idea": { preview } once the text AI answered, shown until Use this / Keep mine
  const [improving, setImproving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [improveNote, setImproveNote] = useState("");
  const styles = (ai.styles || []).filter((s) => STYLE_INFO[s]);
  const pickedStyle = styles.includes(style) ? style : styles[0];
  const freeAreas = areas.filter((a) => a.free);
  const forKey = freeAreas.some((a) => a.key === areaKey) ? areaKey : freeAreas.some((a) => a.key === targetKey) ? targetKey : freeAreas[0]?.key;
  const canDraw = ai.available && ai.loggedIn && ai.left !== 0;

  // new designs: shown now; the ones shown before move to "Earlier designs"
  const showResults = (patch) => setSession((s) => ({ ...s, ...patch, view: "results", earlier: keepEarlier(s.results, s.earlier, patch.results) }));
  // job() returns the designs; nothing is shown if Stop was pressed (a design that arrives anyway goes to Earlier)
  const step = async (waitInfo, job, retry) => {
    steps.current += 1;
    const me = { stopped: false, back: results.length ? "results" : "form" };
    running.current = me;
    set({ view: "working", wait: { ...waitInfo, id: steps.current }, error: null, last: retry, note: null });
    try {
      const patch = await job();
      if (me.stopped) {
        if (patch?.results?.length) setSession((s) => ({ ...s, earlier: keepEarlier(patch.results, s.earlier), note: "The design you stopped finished anyway — it’s under Earlier designs if you want it." }));
        return;
      }
      showResults(patch);
    } catch (err) {
      if (!me.stopped) set({ view: "error", error: err?.message || "That didn’t work." });
    } finally {
      if (running.current === me) running.current = null;
    }
  };
  const stop = () => {
    const me = running.current;
    if (!me) return;
    me.stopped = true;
    running.current = null;
    set({ view: me.back, wait: null, note: STOPPED });
  };
  const draw = (req = { subject: subject.trim(), style: pickedStyle, areaKey: forKey }) => {
    if (req.subject.length < 3) return setMissing("Describe what to draw first — a few words are enough.");
    setMissing("");
    step({ label: `Drawing ${req.subject.length > 40 ? "your design" : req.subject.toLowerCase()}…`, expect: 25, hint: WAIT_HINT }, async () => {
      const res = await onDraw(req);
      return { request: req, results: res.images.map((im) => ({ url: im.url, w: im.width, h: im.height })), changing: null };
    }, () => draw(req));
  };
  const changeIt = (baseUrl, words) => {
    if (words.trim().length < 3) return;
    step({ label: "Changing your design…", expect: 25, hint: WAIT_HINT }, async () => {
      const res = await onChange({ baseUrl, change: words.trim(), areaKey: session.request?.areaKey || forKey });
      setChange("");
      return { results: res.images.map((im) => ({ url: im.url, w: im.width, h: im.height })), changing: null };
    }, () => changeIt(baseUrl, words));
  };
  // the customer's rough words → a clear instruction + what they'll get (nothing is drawn yet, nothing is counted)
  const improve = async () => {
    const idea = subject.trim();
    if (idea.length < 3) return setMissing("Write your idea first — a few words are enough.");
    setMissing("");
    setImproveNote("");
    setPreview(null);
    setImproving(true);
    try {
      setPreview(await onImprove(idea));
    } catch (err) {
      setImproveNote(err?.message || "I couldn’t improve that just now. Try again, or draw it with your own words.");
    } finally {
      setImproving(false);
    }
  };
  // "Use this" keeps the customer's own words, so "Back to my words" can bring them back
  const useImproved = () => {
    const free = freeAreas.some((a) => a.key === preview.area);
    set({ ownWords: { subject, style, areaKey }, subject: preview.prompt, ...(styles.includes(preview.style) ? { style: preview.style } : {}), ...(free ? { areaKey: preview.area } : {}) });
    setPreview(null);
    setImproveNote("Your idea is improved. Check the style and print area below, then tap Draw it.");
  };
  const backToMyWords = () => {
    set({ ...ownWords, ownWords: null });
    setImproveNote("");
  };

  // a design can go on the area it was drawn for (Add to tee) and on any other one as well (Other area)
  const onIt = (url) => [].concat(placed[url] || []);
  const place = async (r, key = session.request?.areaKey || forKey) => {
    setPickFor(null);
    if (!(await onPlace(r.url, key))) return;
    const label = areas.find((a) => a.key === key)?.label || "your tee";
    setSession((s) => {
      const was = [].concat(s.placed?.[r.url] || []);
      return { ...s, placed: { ...s.placed, [r.url]: was.includes(label) ? was : [...was, label] } };
    });
  };
  const earlierStrip = <EarlierResults title="Earlier designs" items={earlier} onIt={onIt} onAdd={(r) => place(r)} fabric={fabric} />;

  if (!ai.available) {
    return (
      <div className="ps">
        <div className="ps-body">
          <div className="ps-error"><b>Drawing isn’t available right now</b><span>You can pick from the art library, upload your own picture, or turn your photo into free art looks in the Photo tab.</span></div>
          <div className="ps-actions"><button type="button" className="ps-btn" onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps">
      {view === "form" && (
        <div className="ps-body">
          {note && <p className="ps-note" role="status">{note}</p>}
          {results.length > 0 && (
            <button type="button" className="ps-link ps-back" onClick={() => set({ view: "results", note: null })}>← Back to my designs</button>
          )}
          <h3 className="ps-h">Describe it</h3>
          <textarea
            className={`ds-text${missing ? " bad" : ""}`}
            value={subject}
            maxLength={300}
            rows={3}
            placeholder="A lion holding a cricket bat"
            aria-label="What should the design show?"
            onChange={(e) => { set({ subject: e.target.value }); if (missing) setMissing(""); if (improveNote) setImproveNote(""); }}
          />
          {missing && <p className="ds-missing" role="alert">{missing}</p>}
          <div className="ds-ideas">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="dr-chip" onClick={() => { set({ subject: idea }); setMissing(""); setPreview(null); }}>{idea}</button>
            ))}
          </div>
          {ai.text && onImprove && (
            <div className="ds-improve">
              <button type="button" className="ps-btn" onClick={improve} disabled={improving}>{improving ? "Improving your idea…" : "✨ Improve my idea"}</button>
              <small>Free · shows what you’ll get before drawing</small>
            </div>
          )}
          {improveNote && <p className="ds-improvenote" role="status">{improveNote}</p>}
          {ownWords && !preview && (
            <button type="button" className="ps-link" onClick={backToMyWords}>↶ Back to my words</button>
          )}
          {preview && (
            <IdeaPreview
              preview={{ ...preview, area: freeAreas.some((a) => a.key === preview.area) ? preview.area : forKey }}
              areas={freeAreas}
              onArea={(key) => setPreview((p) => ({ ...p, area: key }))}
            >
              <button type="button" className="ps-btn gold" onClick={useImproved}>Use this</button>
              <button type="button" className="ps-btn" onClick={() => setPreview(null)}>Keep my words</button>
            </IdeaPreview>
          )}

          <h3 className="ps-h">Pick a style</h3>
          <div className="ps-styles">
            {styles.map((s) => (
              <button key={s} type="button" className={`ps-style${s === pickedStyle ? " on" : ""}`} aria-pressed={s === pickedStyle} onClick={() => set({ style: s })}>
                <i style={{ background: STYLE_INFO[s][1] }} aria-hidden="true" />
                <b>{s}</b>
                <span>{STYLE_INFO[s][0]}</span>
              </button>
            ))}
          </div>
          {pickedStyle === "Hand lettering" && <p className="ps-small">Put the words in quotes, for example: “Work smarter not harder” with a crown.</p>}

          <label className="ds-for">
            <span>Draw it for</span>
            <select value={forKey || ""} onChange={(e) => set({ areaKey: e.target.value })}>
              {freeAreas.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </label>

          {ai.loggedIn ? (
            canDraw ? (
              <button type="button" className="ps-btn gold ds-go" onClick={() => draw()}>Draw it · 1 request</button>
            ) : (
              <p className="ps-note">You’ve used today’s AI requests. They reset tomorrow — until then, try the art library, or free looks in the Photo tab.</p>
            )
          ) : (
            <div className="ps-actions"><button type="button" className="ps-btn gold" onClick={onLogin}>Log in to draw</button><span className="ps-small">Your design stays here.</span></div>
          )}
          {ai.loggedIn && ai.left != null && <p className="ps-small">{ai.left} AI request{ai.left === 1 ? "" : "s"} left today.</p>}
          {!results.length && earlierStrip}
        </div>
      )}

      {view === "working" && wait && (
        <div className="ps-body">
          <WaitCard key={wait.id} label={wait.label} expect={wait.expect} hint={wait.hint} onStop={stop} />
        </div>
      )}

      {view === "error" && (
        <div className="ps-body">
          <div className="ps-error" role="alert"><b>That didn’t work</b><span>{error}</span></div>
          <div className="ps-actions">
            {last && <button type="button" className="ps-btn gold" onClick={() => last()}>↻ Try again</button>}
            <button type="button" className="ps-btn" onClick={() => set({ view: results.length ? "results" : "form", error: null })}>Back</button>
          </div>
        </div>
      )}

      {view === "results" && (
        <div className="ps-body">
          {note && <p className="ps-note" role="status">{note}</p>}
          <div className={`ps-results${results.length === 1 ? " one" : ""}`}>
            {results.map((r) => (
              <div key={r.url} className="ps-result">
                <img src={imageUrl(r.url, 500)} alt="A design made for you" style={{ background: fabric }} />
                {onIt(r.url).length ? <span className="ps-on">On {onIt(r.url).join(" and ")} ✓</span> : <button type="button" className="ps-btn gold" onClick={() => place(r)}>Add to tee</button>}
                {changing === r.url ? (
                  <form className="ds-change" onSubmit={(e) => { e.preventDefault(); changeIt(r.url, change); }}>
                    <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="Make it angrier, add a crown…" aria-label="What should change?" maxLength={200} autoFocus />
                    <button type="submit" className="ps-btn" disabled={change.trim().length < 3}>Change · 1 request</button>
                    <button type="button" className="ps-link" onClick={() => { setChange(""); set({ changing: null }); }}>Cancel</button>
                  </form>
                ) : (
                  <div className="ps-links">
                    {freeAreas.length > 1 && <button type="button" className="ps-link" aria-expanded={pickFor === r.url} onClick={() => setPickFor(pickFor === r.url ? null : r.url)}>Other area</button>}
                    {canDraw && <button type="button" className="ps-link" onClick={() => set({ changing: r.url })}>Change it</button>}
                  </div>
                )}
                {pickFor === r.url && (
                  <div className="dr-designareas">
                    {freeAreas.map((a) => (
                      <button key={a.key} type="button" className="dr-chip" onClick={() => place(r, a.key)}>{a.label}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="ps-actions">
            {canDraw && session.request && <button type="button" className="ps-btn" onClick={() => draw(session.request)}>↻ Try another</button>}
            <button type="button" className="ps-btn" onClick={() => set({ view: "form", note: null })}>New drawing</button>
            <button type="button" className="ps-btn dark" onClick={onClose}>Done</button>
          </div>
          {ai.left != null && <p className="ps-small">{ai.left} AI request{ai.left === 1 ? "" : "s"} left today.</p>}
          {earlierStrip}
        </div>
      )}
    </div>
  );
}
