// studio/PhotoPlanCard.jsx
//
// A photo sent in the chat, and what will be made from it — shown BEFORE anything is made or charged (like the
// drawing plan card). The customer sees their photo, what was understood ("I see a black t-shirt with a lion"),
// what they will get, where it goes and what it costs; they can switch to another way of using the photo.
//
//   copy      only the print from the photo, flat and clean (1 request)
//   photo     the photo itself, background removed (free) — optionally made sharper by the AI (1 request)
//   art       the photo redrawn in a style (1 request; the free looks cost nothing)
//   inspired  a new design that takes the look from the photo (1 request)
import { imageUrl } from "../utils/imageUrl";
import StylePicker from "./StylePicker";
import { SAME_THEME } from "./photoIntent";

// the art styles for the photo itself, in plain words
const ART_INFO = {
  Cartoon: "Clean outlines, flat colours",
  Sketch: "Pencil lines, light shading",
  Sticker: "Die-cut, with a white border",
  Watercolour: "Soft, painted look",
  "Pop art": "Halftone dots, strong colours",
  Realistic: "Lifelike, rich detail",
  Anime: "Anime style, crisp lines",
  "Line art": "A few clean lines",
};
const isFree = (plan) => plan.job === "photo" && !plan.enhance;
// the other ways to use the same photo (a switch on the card, nothing is spent)
const SWITCH = {
  copy: [["inspired", "Make my own design from it instead"], ["photo", "Keep it as a photo instead · free"]],
  photo: [["copy", "Copy just the design from it"], ["art", "Turn it into art"]],
  art: [["photo", "Keep it as a photo instead · free"]],
  inspired: [["copy", "Copy the design instead"]],
};

/**
 * @param plan   { job, photo: { url }, areaKey, style, change, subject, seen, design, words, cutOut, enhance }
 *               design / words: what the photo reading found in the print (copy) — the words are shown here
 * @param areas  the garment's print areas [{ key, label, free }]
 * @param styles AI styles (for "inspired"); photoStyles: art styles for the photo
 * @param ai     { available, loggedIn, left }
 * @param live   the newest plan, nothing running
 */
export default function PhotoPlanCard({ plan, areas, styles, photoStyles, ai, live, onChange, onMake, onCancel }) {
  const { job, photo } = plan;
  const set = (patch) => onChange({ ...plan, ...patch });
  const aiOk = ai.available && ai.loggedIn && ai.left !== 0;
  const free = isFree(plan);
  const short = !free && !aiOk;
  // the print areas (one or more: "full back and left chest"); each row offers the free areas not chosen in another row
  const keys = plan.areaKeys?.length ? plan.areaKeys : plan.areaKey ? [plan.areaKey] : [""];
  const setKeys = (next) => set({ areaKeys: next, areaKey: next[0] || null });
  const choicesFor = (i) => areas.filter((a) => (a.free || a.key === keys[i]) && !keys.some((k, n) => n !== i && k === a.key));
  // (art needs the AI: there are no free looks any more — without it the card says so, and the free choices stay)
  const styleList = job === "art" ? (aiOk ? photoStyles : []) : styles;
  const what = {
    copy: plan.change ? `Only the design from your photo, flat and clean, with this change: ${plan.change}` : "Only the design from your photo, made flat, straight and clean",
    // ready: "add this to my tee" — said as print-ready, with what that means for this photo
    photo: plan.ready
      ? `Your photo, print-ready: ${[plan.cutOut && "background removed", plan.enhance && "made sharper"].filter(Boolean).join(", ") || "as it is"}`
      : plan.cutOut ? "Your photo, with its background removed" : "Your photo, as it is",
    art: `Your photo redrawn as ${plan.style ? plan.style.toLowerCase() : "art"}`,
    // (nothing new named: the same theme and feel as the photo, drawn as new artwork — never a copy)
    inspired: !plan.subject || plan.subject.startsWith(SAME_THEME) ? "A new design inspired by your photo: the same theme and feel, with new artwork (not a copy)" : `A new design inspired by your photo: ${plan.subject}`,
  }[job];
  return (
    <div className={`pc ppc${live ? "" : " done"}`}>
      <div className="ppc-top">
        <img src={/^blob:/.test(photo.url) ? photo.url : imageUrl(photo.url, 240)} alt="Your photo" />
        <div>
          {plan.seen && <p className="ppc-seen">I see {plan.seen.replace(/\.$/, "")}.</p>}
          <p className="ppc-what"><b>What I’ll make:</b> {what}</p>
        </div>
      </div>
      {/* the words read in the design — so the customer can see they were read right before anything is made */}
      {job === "copy" && plan.words?.length > 0 && (
        <p className="ppc-words">
          <span>Words I’ll keep</span>
          {plan.words.map((w) => (
            <b key={w}>{w}</b>
          ))}
        </p>
      )}
      {job === "copy" && <p className="ppc-note">From a photo I make my best copy. Small text or fine lines may come out a little different — you can try again or ask me to change it.</p>}
      {job === "photo" && live && (
        <div className="ppc-opts">
          <label><input type="checkbox" checked={plan.cutOut} onChange={(e) => set({ cutOut: e.target.checked })} /> Remove the background <small>free</small></label>
          {aiOk && <label><input type="checkbox" checked={!!plan.enhance} onChange={(e) => set({ enhance: e.target.checked })} /> Make it sharper with AI <small>1 request</small></label>}
          {aiOk && plan.sharpenWhy === "small" && <p className="ppc-why">Your photo is small for this print area, so I ticked “Make it sharper” — it would print a bit soft otherwise. Untick it to keep it free.</p>}
        </div>
      )}
      {/* a new design from the photo: the compact picker (the four best, the rest under More styles), as on the Draw card */}
      {job === "inspired" && styleList.length > 0 && (
        <>
          <p className="pc-h">Style</p>
          <StylePicker styles={styleList} value={plan.style} onPick={(s) => set({ style: s })} live={live} subject={plan.subject && !plan.subject.startsWith(SAME_THEME) ? plan.subject : ""} />
        </>
      )}
      {job === "art" && styleList.length > 0 && (
        <>
          <p className="pc-h">Style</p>
          <div className="pc-styles" role="radiogroup" aria-label="Style">
            {styleList.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === plan.style} className={`pc-style${s === plan.style ? " on" : ""}`} disabled={!live} onClick={() => set({ style: s })}>
                <b>{s}</b>
                <span>{ART_INFO[s] || ""}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {live ? (
        <>
          {/* one row per print area — the same picture goes on each, made once (it costs the same as one) */}
          <div className="ppc-area">
            <span>Where to print</span>
            {keys.map((k, i) => (
              <div key={`${k}-${i}`} className="ppc-arearow">
                <select aria-label={`Print area ${i + 1}`} value={k || ""} onChange={(e) => setKeys(keys.map((x, n) => (n === i ? e.target.value : x)))}>
                  {!k && <option value="">Choose a print area…</option>}
                  {choicesFor(i).map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
                {keys.length > 1 && <button type="button" className="pc-x" onClick={() => setKeys(keys.filter((_, n) => n !== i))} aria-label={`Leave out ${areas.find((a) => a.key === k)?.label || "this area"}`}>Leave out</button>}
              </div>
            ))}
            {keys.length < 4 && choicesFor(keys.length).length > 0 && (
              <button type="button" className="ppc-addarea" onClick={() => setKeys([...keys, choicesFor(keys.length)[0].key])}>+ Another area</button>
            )}
          </div>
          <button type="button" className="pc-go" disabled={short || !keys.length || keys.some((k) => !k) || ((job === "art" || job === "inspired") && !plan.style)} onClick={() => onMake({ ...plan, areaKey: keys[0], areaKeys: keys })}>
            Make it · {free ? "free" : "1 request"}
          </button>
          <p className="pc-note">
            {short
              ? !ai.available ? "The AI isn’t available right now — the free choices below still work." : ai.left === 0 ? "You’ve used today’s AI requests. The free choices below still work." : "Log in to use this."
              : `${!free && ai.left != null ? `${ai.left} request${ai.left === 1 ? "" : "s"} left today. ` : ""}Nothing is made until you tap Make it.`}
          </p>
          <div className="pc-more">
            {(SWITCH[job] || []).map(([to, label]) => (
              <button key={to} type="button" className="dr-chip" onClick={() => set({ job: to, style: to === "art" ? (aiOk ? photoStyles[0] : null) : to === "inspired" ? plan.style || styles[0] || null : null, ...(to === "inspired" && !plan.subject ? { subject: SAME_THEME } : {}), cutOut: to === "photo" ? true : plan.cutOut, enhance: false })}>{label}</button>
            ))}
            <button type="button" className="dr-chip" onClick={onCancel}>Not now</button>
          </div>
        </>
      ) : (
        <p className="pc-area">{keys.map((k) => areas.find((a) => a.key === k)?.label).filter(Boolean).join(" and ")}</p>
      )}
    </div>
  );
}
