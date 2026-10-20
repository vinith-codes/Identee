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
import { STYLE_INFO, styleSample } from "./styleInfo";

// the art styles for the photo itself, in plain words
const ART_INFO = {
  Cartoon: "Clean outlines, flat colours",
  Sketch: "Pencil lines, light shading",
  Sticker: "Die-cut, with a white border",
  Watercolour: "Soft, painted look",
  "Pop art": "Halftone dots, strong colours",
  "Art filters (free)": "4 instant looks, free",
};
const isFree = (plan) => plan.job === "photo" ? !plan.enhance : plan.job === "art" && /free/i.test(plan.style || "");
// the other ways to use the same photo (a switch on the card, nothing is spent)
const SWITCH = {
  copy: [["photo", "Keep it as a photo instead · free"]],
  photo: [["copy", "Copy just the design from it"], ["art", "Turn it into art"]],
  art: [["photo", "Keep it as a photo instead · free"]],
  inspired: [["copy", "Copy the design instead"]],
};

/**
 * @param plan   { job, photo: { url }, areaKey, style, change, subject, seen, cutOut, enhance }
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
  const choices = areas.filter((a) => a.free || a.key === plan.areaKey);
  const styleList = job === "art" ? photoStyles.filter((s) => aiOk || /free/i.test(s)) : styles;
  const what = {
    copy: plan.change ? `Only the design from your photo, flat and clean, with this change: ${plan.change}` : "Only the design from your photo, made flat, straight and clean",
    photo: plan.cutOut ? "Your photo, with its background removed" : "Your photo, as it is",
    art: /free/i.test(plan.style || "") ? "Your photo in 4 free art looks (sketch, stencil, poster, pop art)" : `Your photo redrawn as ${plan.style ? plan.style.toLowerCase() : "art"}`,
    inspired: `A new design inspired by your photo${plan.subject ? `: ${plan.subject}` : ""}`,
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
      {job === "copy" && <p className="ppc-note">From a photo I make my best copy. Small text or fine lines may come out a little different — you can try again or ask me to change it.</p>}
      {job === "photo" && live && (
        <div className="ppc-opts">
          <label><input type="checkbox" checked={plan.cutOut} onChange={(e) => set({ cutOut: e.target.checked })} /> Remove the background <small>free</small></label>
          {aiOk && <label><input type="checkbox" checked={!!plan.enhance} onChange={(e) => set({ enhance: e.target.checked })} /> Make it sharper with AI <small>1 request</small></label>}
        </div>
      )}
      {(job === "art" || job === "inspired") && (
        <>
          <p className="pc-h">Style</p>
          <div className="pc-styles" role="radiogroup" aria-label="Style">
            {styleList.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === plan.style} className={`pc-style${s === plan.style ? " on" : ""}`} disabled={!live} onClick={() => set({ style: s })}>
                {job === "inspired" && styleSample(s) ? <img src={styleSample(s)} alt="" width="160" height="160" /> : null}
                <b>{s}</b>
                <span>{job === "art" ? ART_INFO[s] || "" : STYLE_INFO[s]?.[0] || ""}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {live ? (
        <>
          <label className="ppc-area">
            <span>Where to print</span>
            <select value={plan.areaKey || ""} onChange={(e) => set({ areaKey: e.target.value })}>
              {!plan.areaKey && <option value="">Choose a print area…</option>}
              {choices.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="pc-go" disabled={short || !plan.areaKey || ((job === "art" || job === "inspired") && !plan.style)} onClick={() => onMake(plan)}>
            Make it · {free ? "free" : "1 request"}
          </button>
          <p className="pc-note">
            {short
              ? !ai.available ? "The AI isn’t available right now — the free choices below still work." : ai.left === 0 ? "You’ve used today’s AI requests. The free choices below still work." : "Log in to use this."
              : `${!free && ai.left != null ? `${ai.left} request${ai.left === 1 ? "" : "s"} left today. ` : ""}Nothing is made until you tap Make it.`}
          </p>
          <div className="pc-more">
            {(SWITCH[job] || []).map(([to, label]) => (
              <button key={to} type="button" className="dr-chip" onClick={() => set({ job: to, style: to === "art" ? photoStyles.find((s) => aiOk || /free/i.test(s)) || null : to === "inspired" ? plan.style : null, cutOut: to === "photo" ? true : plan.cutOut, enhance: false })}>{label}</button>
            ))}
            <button type="button" className="dr-chip" onClick={onCancel}>Not now</button>
          </div>
        </>
      ) : (
        <p className="pc-area">{areas.find((a) => a.key === plan.areaKey)?.label || ""}</p>
      )}
    </div>
  );
}
