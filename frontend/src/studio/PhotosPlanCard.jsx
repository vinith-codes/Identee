// studio/PhotosPlanCard.jsx — several photos sent in one message, and what will be made from each (17 Nov 2026)
//
// Like the one-photo plan card (PhotoPlanCard.jsx), shown BEFORE anything is made or counted: one row per photo —
// what it becomes (the photo itself, free · just the design · art · a new design), its style, where it goes — and
// at the bottom what the whole plan uses of today's pictures, said plainly when it doesn't fit. "Make all" makes
// each row the same way "Make it" makes one photo (studio/multiPhoto.js makeActFor).
import { imageUrl } from "../utils/imageUrl";
import { jobWords, limitLine, picturesNeeded } from "./multiPhoto";

const JOBS = [
  // (short, so they fit a 360 px phone)
  ["photo-cut", "Photo, no background · free"],
  ["photo-asis", "Photo as it is · free"],
  ["copy", "Copy the design · 1 picture"],
  ["art", "Make it art · 1 picture"],
  ["inspired", "New design from it · 1 picture"],
];
const jobKey = (it) => (it.job === "photo" ? (it.cutOut ? "photo-cut" : "photo-asis") : it.job);

/**
 * @param plan   { items: [{ n, photo: { url }, job, areaKeys, style, cutOut, change, subject, seen, skip }] }
 * @param areas  the garment's print areas [{ key, label, free }]
 * @param styles AI styles (a new design); photoStyles: art styles for a photo
 * @param ai     { available, loggedIn, left }
 * @param live   the newest plan, nothing running
 */
export default function PhotosPlanCard({ plan, areas, styles, photoStyles, ai, live, onChange, onMake, onCancel }) {
  const items = plan.items || [];
  const set = (i, patch) => onChange({ ...plan, items: items.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
  const aiOk = ai.available && ai.loggedIn && ai.left !== 0;
  const used = items.filter((x) => !x.skip);
  const need = picturesNeeded(items);
  const tooMany = need > 0 && (!aiOk || (ai.left != null && need > ai.left));
  const missing = used.some((x) => !x.areaKeys?.length || ((x.job === "art" || x.job === "inspired") && !x.style));
  // a row's area choices: the free ones not given to another photo of this plan
  const choicesFor = (i) => areas.filter((a) => (a.free || items[i].areaKeys?.includes(a.key)) && !items.some((x, n) => n !== i && !x.skip && x.areaKeys?.includes(a.key)));
  const setJob = (i, key) => {
    const it = items[i];
    if (key === "photo-cut" || key === "photo-asis") return set(i, { job: "photo", cutOut: key === "photo-cut", style: null });
    set(i, { job: key, cutOut: true, style: key === "art" ? (photoStyles.includes(it.style) ? it.style : photoStyles[0] || null) : key === "inspired" ? (styles.includes(it.style) ? it.style : styles[0] || null) : null });
  };
  const label = (k) => areas.find((a) => a.key === k)?.label || k;
  return (
    <div className={`pc mpc${live ? "" : " done"}`}>
      <p className="mpc-h">Your {items.length} photos — here’s my plan</p>
      <ul className="mpc-rows">
        {items.map((it, i) => (
          <li key={`${it.n}-${i}`} className={`mpc-row${it.skip ? " off" : ""}`}>
            <img src={/^blob:/.test(it.photo?.url || "") ? it.photo.url : imageUrl(it.photo?.url, 200)} alt={`Photo ${it.n}`} />
            <div className="mpc-body">
              <p className="mpc-what">
                <b>Photo {it.n}</b>
                {it.seen ? <span> · {it.seen.replace(/\.$/, "")}</span> : null}
              </p>
              {live && !it.skip ? (
                <>
                  <select aria-label={`What to make from photo ${it.n}`} value={jobKey(it)} onChange={(e) => setJob(i, e.target.value)}>
                    {JOBS.filter(([k]) => aiOk || k.startsWith("photo") || k === jobKey(it)).map(([k, words]) => (
                      <option key={k} value={k}>{words}</option>
                    ))}
                  </select>
                  {(it.job === "art" || it.job === "inspired") && (
                    <select aria-label={`Style for photo ${it.n}`} value={it.style || ""} onChange={(e) => set(i, { style: e.target.value })}>
                      {!it.style && <option value="">Choose a style…</option>}
                      {(it.job === "art" ? photoStyles : styles).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                  <select aria-label={`Where to print photo ${it.n}`} value={it.areaKeys?.[0] || ""} onChange={(e) => set(i, { areaKeys: [e.target.value], areaKey: e.target.value })}>
                    {!it.areaKeys?.length && <option value="">Choose a print area…</option>}
                    {choicesFor(i).map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                  {it.areaKeys?.length > 1 && <small className="mpc-also">Also on {it.areaKeys.slice(1).map(label).join(" and ")} (made once)</small>}
                </>
              ) : (
                <p className="mpc-sum">{it.skip ? "Not used" : `${jobWords(it)} · ${(it.areaKeys || []).map(label).join(" and ")}`}</p>
              )}
            </div>
            {live && (
              <button type="button" className="mpc-skip" onClick={() => set(i, it.skip ? { skip: false, ...(it.areaKeys?.length ? {} : { areaKeys: choicesFor(i)[0] ? [choicesFor(i)[0].key] : [] }) } : { skip: true })} aria-label={it.skip ? `Use photo ${it.n}` : `Leave out photo ${it.n}`}>
                {it.skip ? "Use it" : "Leave out"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {live ? (
        <>
          <button type="button" className="pc-go" disabled={!used.length || tooMany || missing} onClick={() => onMake(plan)}>
            Make {used.length === 1 ? "it" : `all ${used.length}`} · {need ? `${need} picture${need === 1 ? "" : "s"}` : "free"}
          </button>
          <p className={`pc-note${tooMany ? " mpc-warn" : ""}`}>
            {need && !ai.available ? "The AI isn’t available right now — the free choices (the photo itself) still work." : need && !ai.loggedIn ? "Log in to make pictures." : limitLine(need, ai.left)} Nothing is made until you tap Make.
          </p>
          <div className="pc-more">
            <button type="button" className="dr-chip" onClick={onCancel}>Not now</button>
          </div>
        </>
      ) : (
        !used.length && <p className="pc-area">Nothing made from these photos.</p>
      )}
    </div>
  );
}
