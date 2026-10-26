// Admin → Shop your IDENTEE → Collection maker (25 Oct 2026)
//
// The admin types what they want (+ an example picture); the AI pipeline (server/services/collectionService.js)
// turns it into a brief the admin checks, then — after Start — looks up facts, plans each tee, makes the pictures
// and places them. This page then finishes each tee in the browser (fits the words, runs the print check, takes the
// 3D mockup pictures) and lists them for Publish / Reject. Nothing reaches the shop until it is published.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import collectionService from "../../services/collectionService";
import MockupCamera from "../../studio/MockupCamera";
import { finishElements } from "../../studio/designFinish";
import { fontsReady } from "../../studio/fonts";
import { shopHref } from "../../utils/siteUrls";
import { imageUrl } from "../../utils/imageUrl";
import LayoutPicker from "./LayoutPicker";
import "./collectionMaker.css";

const apiError = (err) => err?.response?.data?.message || err?.message || "Something went wrong. Please try again.";
const rupees = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN")}`;
const when = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const POLL_MS = 2500;
const SIDES = [
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left"],
  ["right", "Right"],
];
const STATUS_TEXT = {
  planned: "Waiting for its picture",
  drafted: "Finishing…",
  ready: "Ready to publish",
  published: "In the shop",
  rejected: "Rejected",
  failed: "Not made",
};
const PLACE_TEXT = { top: "top", middle: "middle", bottom: "bottom", small: "small, centred", "top-band": "band at the top", "bottom-band": "band at the bottom" };
const SERVICE_TEXT = { google: "Google", grok: "Grok", art: "the art library", mixed: "AI + the art library" };
const MAX_REFS = 10; // example pictures (server: routes/collectionRoutes.js)
const PIPELINE = ["Looking up facts", "Planning the tees", "Making the pictures", "Finishing the tees (in this browser)"];

/* ---------- 1. a new collection: products, layouts, then the request ---------- */
// "Let the AI choose" or the layouts the admin ticked (only those that fit the chosen products are kept)
function LayoutChoice({ setup, garments, value, onChange }) {
  const [own, setOwn] = useState(value.length > 0);
  return (
    <>
      <div className="cm-row">
        <button
          type="button"
          className="cm-chip"
          aria-pressed={!own}
          onClick={() => {
            setOwn(false);
            onChange([]);
          }}
        >
          Let the AI choose
        </button>
        <button type="button" className="cm-chip" aria-pressed={own} onClick={() => setOwn(true)}>
          I'll pick the layouts
        </button>
      </div>
      <p className="cm-note" style={{ margin: "6px 0 10px" }}>
        {own
          ? value.length
            ? `${value.length} picked. The tees are spread over them; the AI fills each one with pictures and words.`
            : "Tick one or more layouts. Gold = a picture, dark = words."
          : "The AI arranges each tee to suit its idea (a different arrangement on each tee)."}
      </p>
      {own && <LayoutPicker setup={setup} garments={garments} value={value} onChange={onChange} />}
    </>
  );
}
// the picked layouts that still fit the chosen products
const fittingLayouts = (setup, garments, layouts) =>
  layouts.filter((k) => setup.garments.some((g) => (!garments.length || garments.includes(g.key)) && g.layouts.some((l) => l.key === k)));

function NewCollection({ setup, onMade }) {
  const [garments, setGarments] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [pics, setPics] = useState([]); // the example pictures: [{ file, url }] (url: its preview)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // (the preview addresses are let go when a picture is removed and when the page closes)
  const picsRef = useRef([]);
  useEffect(() => {
    picsRef.current = pics;
  }, [pics]);
  useEffect(() => () => picsRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const addPics = (list) => {
    const room = MAX_REFS - pics.length;
    const added = [...list].filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type)).slice(0, Math.max(0, room));
    setPics((p) => [...p, ...added.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (list.length > room) setError(`Up to ${MAX_REFS} example pictures.`);
  };
  const removePic = (url) => {
    URL.revokeObjectURL(url);
    setPics((p) => p.filter((x) => x.url !== url));
  };
  const toggleGarment = (key) => {
    const next = garments.includes(key) ? garments.filter((k) => k !== key) : [...garments, key];
    setGarments(next);
    setLayouts((l) => fittingLayouts(setup, next, l)); // (a layout the products no longer have is dropped)
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { collection } = await collectionService.makeBrief(
        prompt.trim(),
        pics.map((p) => p.file),
        { garments, layouts },
      );
      onMade(collection._id);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  const ready = garments.length && prompt.trim().length >= 3 && pics.length;
  return (
    <form className="cm-card" onSubmit={submit}>
      <h2 className="cm-h2">New collection</h2>
      <p className="cm-help">Choose the products and the layouts, then say what you want and add an example picture. The AI improves your request into a brief and shows what it understood — nothing is made until you press Start.</p>

      <div className="cm-step">
        <span className="cm-step-no">1</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="cm-label">Products</span>
          <div className="cm-row">
            {setup.garments.map((g) => (
              <button key={g.key} type="button" className="cm-chip" aria-pressed={garments.includes(g.key)} onClick={() => toggleGarment(g.key)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cm-step">
        <span className="cm-step-no">2</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="cm-label">Layouts — where the prints go</span>
          {garments.length ? <LayoutChoice setup={setup} garments={garments} value={layouts} onChange={setLayouts} /> : <p className="cm-note" style={{ margin: 0 }}>Choose the products first.</p>}
        </div>
      </div>

      <div className="cm-step">
        <span className="cm-step-no">3</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <label className="cm-label" htmlFor="cm-prompt">
            What should the tees be?
          </label>
          <textarea
            id="cm-prompt"
            className="cm-textarea"
            value={prompt}
            maxLength={2000}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="For example: 3 tees for Suriya's film SCENE releasing on Diwali, one with Suriya's face, realistic like the picture"
          />
          <div className="cm-row" style={{ marginTop: 10 }}>
            {pics.length < MAX_REFS && (
              <label className="cm-btn cm-btn-small" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {pics.length ? "+ Add more example pictures" : "Add example pictures (at least 1)"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    addPics(e.target.files || []);
                    e.target.value = ""; // (the same picture can be picked again after removing it)
                  }}
                />
              </label>
            )}
            <span className="cm-note">
              {pics.length} of up to {MAX_REFS}
            </span>
          </div>
          {pics.length > 0 && (
            <>
              <div className="cm-refs">
                {pics.map((p, i) => (
                  <div key={p.url} className="cm-refpic">
                    <img src={p.url} alt={`Example picture ${i + 1}`} />
                    <button type="button" aria-label={`Remove example picture ${i + 1}`} onClick={() => removePic(p.url)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="cm-note" style={{ margin: "6px 0 0" }}>
                Only references: the AI takes their look and mood together and makes new, original artwork — it never copies them.
              </p>
            </>
          )}
        </div>
      </div>

      {error && <p className="cm-error">{error}</p>}
      <div className="cm-row" style={{ marginTop: 14 }}>
        <button className="cm-btn cm-btn-primary" disabled={busy || !ready}>
          {busy ? "Reading your request…" : "Improve it into a brief"}
        </button>
        <span className="cm-note">{!garments.length ? "Choose the products first." : !pics.length ? "Add at least one example picture." : prompt.trim().length < 3 ? "Type your request." : "about ₹0.20"}</span>
      </div>
    </form>
  );
}

/* ---------- 2. the brief: what the AI understood, the questions it has, then Start ---------- */
const ASK_LABEL = { garments: "Which products?", count: "How many tees?", language: "Language of the words on the tees?" };
const missingNow = (b) => [!b.garments?.length && "garments", !(Number(b.count) >= 1) && "count", !b.language && "language"].filter(Boolean);

function GarmentChips({ setup, value, onToggle }) {
  return (
    <div className="cm-row">
      {setup.garments.map((g) => (
        <button key={g.key} type="button" className="cm-chip" aria-pressed={value.includes(g.key)} onClick={() => onToggle(g.key)}>
          {g.label}
        </button>
      ))}
    </div>
  );
}
function LanguageChips({ setup, value, onPick }) {
  return (
    <div className="cm-row">
      {setup.languages.map((l) => (
        <button key={l} type="button" className="cm-chip" aria-pressed={value === l} onClick={() => onPick(l)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function BriefForm({ collection, setup, onStarted }) {
  const [brief, setBrief] = useState(() => ({ ...collection.brief, count: collection.brief.count ?? "", language: collection.brief.language || "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  // the picture budget follows the number of tees (a few spare for retries) until it is changed by hand
  const [budgetTouched, setBudgetTouched] = useState(false);
  const setCount = (v) =>
    setBrief((b) => {
      const n = Math.min(setup.maxTees, Math.max(1, Math.round(Number(v)) || 1));
      return { ...b, count: v, budget: budgetTouched || !v ? b.budget : Math.min(setup.maxBudget, n + Math.ceil(n / 2)) };
    });
  const asked = collection.brief.missing || []; // what the prompt didn't say (still shown once answered)
  const open = missingNow(brief);
  const count = Math.min(setup.maxTees, Math.max(1, Number(brief.count) || 1));
  const budget = Math.min(setup.maxBudget, Math.max(count, Number(brief.budget) || count));
  const each = brief.realPeople ? setup.grokPricePerImageInr : setup.pricePerImageInr;
  const toggle = (k, v) =>
    setBrief((b) => {
      const next = { ...b, [k]: b[k].includes(v) ? b[k].filter((s) => s !== v) : [...b[k], v] };
      if (k === "garments") next.layouts = fittingLayouts(setup, next.garments, b.layouts || []);
      return next;
    });
  // the colours of the chosen products (every product's colours while none is chosen)
  const colours = [...new Map(setup.garments.filter((g) => !brief.garments.length || brief.garments.includes(g.key)).flatMap((g) => g.colours).map((c) => [c.slug, c])).values()];
  const labelOf = (key) => setup.garments.find((g) => g.key === key)?.label || key;
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await collectionService.start(collection._id, { ...brief, count, budget });
      onStarted();
    } catch (err) {
      setError(apiError(err));
      setBusy(false);
    }
  };
  return (
    <>
      <div className="cm-card">
        <h2 className="cm-h2">What the AI understood</h2>
        <p className="cm-help">Check it. Nothing is made until you press Start at the bottom.</p>
        {brief.understood?.length > 0 && (
          <ul className="cm-understood">
            {brief.understood.map((u) => (
              <li key={u.label}>
                <b>{u.label}:</b> {u.value}
              </li>
            ))}
          </ul>
        )}
        <label className="cm-label" htmlFor="cm-improved" style={{ marginTop: 12 }}>
          The brief the AI wrote from your request (you can change it)
        </label>
        <textarea id="cm-improved" className="cm-textarea" style={{ minHeight: 130 }} value={brief.improved} maxLength={3000} onChange={(e) => set("improved", e.target.value)} />
        {(collection.refImage || collection.refNotes) && (
          <div className="cm-ref" style={{ flexWrap: "wrap" }}>
            {(collection.refImages?.length ? collection.refImages : [collection.refImage]).filter(Boolean).map((src, i) => (
              <img key={src} src={imageUrl(src, 200)} alt={`Your example picture ${i + 1}`} />
            ))}
            <span className="cm-note" style={{ flexBasis: "100%" }}>
              {collection.refNotes
                ? `What it takes from your example${collection.refImages?.length > 1 ? "s" : ""} (only a reference — the tees get new, original artwork): ${collection.refNotes}`
                : "Your example pictures (only a reference)."}
            </span>
          </div>
        )}
      </div>

      {asked.length > 0 && (
        <div className={`cm-card${open.length ? " cm-ask" : ""}`}>
          <h2 className="cm-h2">{open.length ? "Please answer" : "Your answers"}</h2>
          <p className="cm-help">Your request didn't say this. Choose, and Start opens.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {asked.includes("garments") && (
              <div>
                <span className="cm-label">{ASK_LABEL.garments}</span>
                <GarmentChips setup={setup} value={brief.garments} onToggle={(k) => toggle("garments", k)} />
              </div>
            )}
            {asked.includes("count") && (
              <div style={{ maxWidth: 220 }}>
                <label className="cm-label" htmlFor="cm-ask-count">
                  {ASK_LABEL.count}
                </label>
                <input id="cm-ask-count" className="cm-input" type="number" min={1} max={setup.maxTees} value={brief.count} placeholder={`1 to ${setup.maxTees}`} onChange={(e) => setCount(e.target.value)} />
              </div>
            )}
            {asked.includes("language") && (
              <div>
                <span className="cm-label">{ASK_LABEL.language}</span>
                <LanguageChips setup={setup} value={brief.language} onPick={(l) => set("language", l)} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cm-card">
        <h2 className="cm-h2">The details</h2>
        <p className="cm-help">Change anything you want.</p>
        <div className="cm-grid2">
          <div className="cm-field cm-full">
            <label className="cm-label" htmlFor="cm-theme">
              Theme
            </label>
            <input id="cm-theme" className="cm-input" value={brief.theme} maxLength={200} onChange={(e) => set("theme", e.target.value)} />
          </div>
          {!asked.includes("garments") && (
            <div className="cm-field cm-full">
              <span className="cm-label">Products</span>
              <GarmentChips setup={setup} value={brief.garments} onToggle={(k) => toggle("garments", k)} />
            </div>
          )}
          {!asked.includes("count") && (
            <div className="cm-field">
              <label className="cm-label" htmlFor="cm-count">
                How many tees
              </label>
              <input id="cm-count" className="cm-input" type="number" min={1} max={setup.maxTees} value={brief.count} onChange={(e) => setCount(e.target.value)} />
            </div>
          )}
          <div className="cm-field">
            <label className="cm-label" htmlFor="cm-budget">
              Most pictures it may make
            </label>
            <input id="cm-budget" className="cm-input" type="number" min={count} max={setup.maxBudget} value={brief.budget} onChange={(e) => {
                setBudgetTouched(true);
                set("budget", e.target.value);
              }} />
          </div>
          {!asked.includes("language") && (
            <div className="cm-field cm-full">
              <span className="cm-label">Language of the words</span>
              <LanguageChips setup={setup} value={brief.language} onPick={(l) => set("language", l)} />
            </div>
          )}
          <div className="cm-field cm-full">
            <span className="cm-label">Layouts — where the prints go</span>
            <LayoutChoice setup={setup} garments={brief.garments} value={brief.layouts || []} onChange={(v) => set("layouts", v)} />
          </div>
          <div className="cm-field cm-full">
            <span className="cm-label">Pictures from</span>
            <div className="cm-row">
              {setup.sources.map((o) => (
                <button key={o.key} type="button" className="cm-chip" aria-pressed={brief.sources === o.key} onClick={() => set("sources", o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="cm-note" style={{ margin: "4px 0 0" }}>
              Any kind of design: words only, a picture only, several prints on one tee (a chest logo and a big back print), a picture with its caption… Art library pictures are free.
            </p>
          </div>
          <div className="cm-field cm-full">
            <label className="cm-label" htmlFor="cm-style">
              Look and mood
            </label>
            <input id="cm-style" className="cm-input" value={brief.style} maxLength={300} onChange={(e) => set("style", e.target.value)} />
          </div>
          <div className="cm-field cm-full">
            <span className="cm-label">Tee colours (none ticked = any)</span>
            <div className="cm-row">
              {colours.map((c) => (
                <button key={c.slug} type="button" className="cm-chip" aria-pressed={brief.colours.includes(c.slug)} onClick={() => toggle("colours", c.slug)}>
                  <span className="cm-dot" style={{ background: c.hex }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="cm-field cm-full">
            <label className="cm-label" htmlFor="cm-avoid">
              Leave out (optional)
            </label>
            <input id="cm-avoid" className="cm-input" value={brief.avoid} maxLength={300} onChange={(e) => set("avoid", e.target.value)} placeholder="For example: no brand logos" />
          </div>
          <div className="cm-field cm-full">
            <label className="cm-row" style={{ gap: 8, cursor: setup.grok ? "pointer" : "default" }}>
              <input type="checkbox" checked={!!brief.realPeople} disabled={!setup.grok} onChange={(e) => set("realPeople", e.target.checked)} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Real people may be drawn (uses Grok)</span>
            </label>
            <p className="cm-note" style={{ margin: "4px 0 0 24px" }}>
              {setup.grok
                ? `Google doesn't draw real people (actors, players). Ticked, Grok draws those tees — about ${rupees(setup.grokPricePerImageInr)} a picture. Make sure you may use the person's face before selling.`
                : "Grok isn't set up on the server, so real people can't be drawn."}
            </p>
          </div>
        </div>
        <div className="cm-cost">
          <strong>Cost:</strong> {count} tee{count === 1 ? "" : "s"}
          {brief.garments.length ? ` (${brief.garments.map(labelOf).join(", ")})` : ""}, at most {budget} pictures (a few spare for retries) ≈ <strong>up to {rupees(budget * each)}</strong>
          {brief.realPeople ? " (if every picture is a Grok one)" : ""}, plus about ₹1 for the AI's thinking. It also looks up the latest facts with Google Search.
        </div>
        {error && <p className="cm-error">{error}</p>}
        <div className="cm-row" style={{ marginTop: 14 }}>
          <button className="cm-btn cm-btn-primary" onClick={start} disabled={busy || !brief.theme?.trim() || open.length > 0}>
            {busy ? "Starting…" : `Start — make ${count} tee${count === 1 ? "" : "s"}`}
          </button>
          {open.length > 0 && <span className="cm-note">Answer the questions above first.</span>}
        </div>
      </div>
    </>
  );
}

/* ---------- 3. progress ---------- */
// While it runs: the steps. When it's done: one short line (the steps are not needed any more).
function Progress({ collection, designs, finishing, onResume }) {
  const [resuming, setResuming] = useState(false);
  const running = collection.status === "running";
  const stopped = collection.status === "failed";
  const step = collection.step || "";
  const at = !running ? (finishing ? 3 : 4) : step.startsWith("Making") ? 2 : step.startsWith("Planning") ? 1 : 0;
  const published = designs.filter((d) => d.status === "published").length;
  const spent = (
    <>
      {rupees(collection.spentInr)} spent · {collection.pictures} picture{collection.pictures === 1 ? "" : "s"}
      {designs.length ? ` · ${designs.length} tee${designs.length === 1 ? "" : "s"} · ${published} published` : ""}
    </>
  );
  if (!running && !finishing && !stopped) {
    return (
      <div className="cm-summary">
        <span className="cm-summary-done">✓ Done</span>
        <span className="cm-note">{spent}</span>
        {collection.error && <span className="cm-note" style={{ color: "#8e2a20" }}>{collection.error}</span>}
      </div>
    );
  }
  return (
    <div className="cm-card">
      <h2 className="cm-h2">{running ? "Making the tees" : stopped ? "Stopped" : "Finishing the tees"}</h2>
      <p className="cm-help">
        {running
          ? "You can leave this page; the server keeps going. Come back to see the tees."
          : stopped
            ? "Press Resume to carry on — the tees made so far are kept."
            : "Keep this page open: this browser is fitting the words and taking the 3D pictures."}
      </p>
      {!stopped && (
        <ol className="cm-steps">
          {PIPELINE.map((label, i) => (
            <li key={label} className={i < at ? "cm-step-done" : i === at ? "cm-step-now" : ""}>
              <span className="cm-step-icon">{i < at ? "✓" : ""}</span>
              {i === 2 && running && step.startsWith("Making") ? step : label}
            </li>
          ))}
        </ol>
      )}
      <p className="cm-note" style={{ marginTop: 12 }}>
        {spent}
      </p>
      {collection.error && <p className="cm-error">{collection.error}</p>}
      {stopped && (
        <div className="cm-row" style={{ marginTop: 10 }}>
          <button
            className="cm-btn cm-btn-dark"
            disabled={resuming}
            onClick={async () => {
              setResuming(true);
              await onResume();
              setResuming(false);
            }}
          >
            {resuming ? "Carrying on…" : "Resume"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- 4. one tee ---------- */
// a tee's parts, in plain words (the first plans had one picture + one line)
const partsOf = (design) =>
  design.plan?.parts?.length
    ? design.plan.parts
    : [design.plan?.subject && { kind: "picture", area: "", subject: design.plan.subject }, design.plan?.words && { kind: "words", area: "", text: design.plan.words, font: design.plan.font }].filter(Boolean);
const partText = (p) =>
  p.kind === "words"
    ? `“${String(p.text).replace(/\n/g, " / ")}” in ${p.font}${p.shape && p.shape !== "straight" ? ", curved" : ""}`
    : p.kind === "art"
      ? `art library: ${p.name}`
      : `AI picture: ${String(p.subject || "").slice(0, 90)}${String(p.subject || "").length > 90 ? "…" : ""}`;

// The card shows the tee, its name, product and colour and the main buttons. Everything else opens on demand:
// Change (in your own words) and Details (its parts, idea, notes, Edit name, New pictures).
function TeeCard({ design, colour, product, layoutLabel, areaLabel, onAction, onChange, busy }) {
  const [side, setSide] = useState(null);
  const [panel, setPanel] = useState(null); // null | "change" | "details"
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState(null); // { text, bad }
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(design.name);
  const [blurb, setBlurb] = useState(design.blurb);
  const hasMockups = !!design.mockups?.front;
  // the side with the picture first
  const hero = (design.elements || []).find((e) => e.type === "image")?.side === "back" ? "back" : "front";
  const shown = side || hero;
  const pic = hasMockups ? design.mockups[shown] || design.mockups.front : design.art?.url;
  const canChange = ["ready", "drafted", "failed"].includes(design.status);
  const notes = design.issues?.length || 0;
  const toggle = (p) => setPanel((now) => (now === p ? null : p));
  const save = async () => {
    await onAction(design, "text", { name, blurb });
    setEditing(false);
  };
  return (
    <article className="cm-tee">
      <div className="cm-tee-pics">
        {pic ? <img src={imageUrl(pic, 700)} alt={`${design.name}, ${shown}`} className={hasMockups ? "" : "cm-art"} /> : <span className="cm-note">No picture yet</span>}
        <span className={`cm-badge cm-badge-${design.status}`}>{STATUS_TEXT[design.status] || design.status}</span>
        {hasMockups && (
          <div className="cm-sidebtns">
            {SIDES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={shown === k} onClick={() => setSide(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cm-tee-body">
        <div className="cm-tee-head">
          <div style={{ minWidth: 0 }}>
            <p className="cm-tee-name">{design.name}</p>
            <p className="cm-tee-sub">
              {colour && <span className="cm-dot" style={{ background: colour.hex }} />}
              {[product, colour?.name].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!["published", "rejected"].includes(design.status) && (
            <button className="cm-btn-link cm-danger" disabled={busy} onClick={() => onAction(design, "reject")}>
              Reject
            </button>
          )}
        </div>
        {design.status === "failed" && design.error && <p className="cm-error" style={{ margin: 0 }}>{design.error}</p>}
        {notes > 0 && design.status !== "failed" && (
          <button type="button" className="cm-notes-chip" onClick={() => setPanel("details")}>
            ⚠ {notes} note{notes === 1 ? "" : "s"} — see Details
          </button>
        )}

        <div className="cm-tee-actions">
          {design.status === "ready" && (
            <button className="cm-btn cm-btn-small cm-btn-primary" disabled={busy} onClick={() => onAction(design, "publish")}>
              Publish
            </button>
          )}
          {design.status === "published" && (
            <>
              <a className="cm-btn cm-btn-small" href={shopHref(`/ready-made/design/${design.slug}`)} target="_blank" rel="noreferrer">
                See in shop
              </a>
              <button className="cm-btn cm-btn-small" disabled={busy} onClick={() => onAction(design, "unpublish")}>
                Unpublish
              </button>
            </>
          )}
          {design.status === "rejected" && (
            <button className="cm-btn cm-btn-small" disabled={busy || !hasMockups} onClick={() => onAction(design, "restore")}>
              Bring back
            </button>
          )}
          {design.status === "failed" && (
            <button className="cm-btn cm-btn-small cm-btn-dark" disabled={busy} onClick={() => onAction(design, "redo")}>
              Try again
            </button>
          )}
          {canChange && (
            <button className="cm-btn cm-btn-small" aria-pressed={panel === "change"} onClick={() => toggle("change")}>
              Change
            </button>
          )}
          <button className="cm-btn cm-btn-small" aria-pressed={panel === "details"} onClick={() => toggle("details")}>
            Details
          </button>
        </div>

        {panel === "change" && canChange && (
          <form
            className="cm-panel"
            onSubmit={async (e) => {
              e.preventDefault();
              setAnswer(null);
              const r = await onChange(design, ask.trim());
              if (r.error) setAnswer({ text: r.error, bad: true });
              else {
                setAnswer({ text: r.reply || "Changed." });
                setAsk("");
              }
            }}
          >
            <textarea
              className="cm-textarea cm-textarea-small"
              value={ask}
              maxLength={1000}
              onChange={(e) => setAsk(e.target.value)}
              aria-label="Change this tee"
              placeholder="e.g. make the words bigger"
            />
            <div className="cm-row">
              <button className="cm-btn cm-btn-small cm-btn-dark" disabled={busy || ask.trim().length < 3}>
                {busy ? "Changing…" : "Change it"}
              </button>
              <span className="cm-note">₹0.20; a new picture ₹2.9</span>
            </div>
            {answer && <p className={answer.bad ? "cm-error" : "cm-note"} style={{ margin: 0 }}>{answer.text}</p>}
          </form>
        )}

        {panel === "details" && (
          <div className="cm-panel">
            {editing ? (
              <>
                <input className="cm-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Name in the shop" />
                <textarea className="cm-textarea cm-textarea-small" value={blurb} maxLength={300} onChange={(e) => setBlurb(e.target.value)} aria-label="Line for the shop page" />
                <div className="cm-row">
                  <button className="cm-btn cm-btn-small cm-btn-dark" onClick={save} disabled={busy || !name.trim()}>
                    Save
                  </button>
                  <button className="cm-btn cm-btn-small" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              design.blurb && <p className="cm-tee-meta" style={{ margin: 0 }}>“{design.blurb}”</p>
            )}
            <p className="cm-tee-meta" style={{ margin: 0 }}>
              {layoutLabel || (design.plan?.layout === "custom" ? "Its own layout" : "")}
              {design.service ? ` · pictures by ${SERVICE_TEXT[design.service] || design.service}` : ""}
              {design.costInr ? ` · ${rupees(design.costInr)}` : ""}
            </p>
            {partsOf(design).length > 0 && (
              <ul className="cm-parts">
                {partsOf(design).map((p, i) => (
                  <li key={i}>
                    {p.area && (
                      <b>
                        {areaLabel(p.area)}
                        {p.place && p.place !== "full" ? ` (${PLACE_TEXT[p.place] || p.place})` : ""}:{" "}
                      </b>
                    )}
                    {partText(p)}
                  </li>
                ))}
              </ul>
            )}
            {design.plan?.idea && <p className="cm-tee-meta" style={{ margin: 0 }}>Idea: {design.plan.idea}</p>}
            {notes > 0 && (
              <ul className="cm-issues">
                {design.issues.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <div className="cm-row">
              {["ready", "published"].includes(design.status) && !editing && (
                <button className="cm-btn cm-btn-small" onClick={() => setEditing(true)}>
                  Edit name
                </button>
              )}
              {["ready", "drafted"].includes(design.status) && (
                <button className="cm-btn cm-btn-small" disabled={busy} onClick={() => onAction(design, "redo")} title="Makes the AI pictures again (art library pictures stay)">
                  New pictures (₹2.9 each)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------- the page ---------- */
export default function CollectionMakerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [setupError, setSetupError] = useState("");
  const [past, setPast] = useState([]);
  const [data, setData] = useState(null); // { collection, designs }
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [job, setJob] = useState(null); // the tee the 3D camera is taking pictures of
  const jobDone = useRef(null);
  const tried = useRef(new Set()); // tees this page already tried to finish (a failure isn't retried in a loop)

  useEffect(() => {
    collectionService
      .getSetup()
      .then(setSetup)
      .catch((err) => setSetupError(apiError(err)));
  }, []);
  const loadPast = useCallback(() => {
    collectionService
      .listCollections()
      .then(setPast)
      .catch(() => {});
  }, []);
  // (the list again when a run moves on: "not started" → "making…" → "3 published")
  const runStatus = data?.collection?.status;
  useEffect(() => {
    loadPast();
  }, [loadPast, id, runStatus]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await collectionService.getCollection(id));
      setLoadError("");
    } catch (err) {
      setLoadError(apiError(err));
    }
  }, [id]);
  useEffect(() => {
    let alive = true;
    if (!id) return undefined;
    collectionService
      .getCollection(id)
      .then((d) => alive && (setData(d), setLoadError("")))
      .catch((err) => alive && setLoadError(apiError(err)));
    return () => {
      alive = false;
    };
  }, [id]);

  // follow a running collection
  const running = data?.collection?.status === "running";
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [running, load]);

  // each product's print areas, colours and layouts (a tee is finished with its own product's)
  const garmentBy = useMemo(() => Object.fromEntries((setup?.garments || []).map((g) => [g.key, g])), [setup]);
  const colourOf = useCallback((d) => garmentBy[d.garmentType]?.colours.find((c) => c.slug === d.color) || null, [garmentBy]);
  const layoutBy = useMemo(() => Object.fromEntries((setup?.garments || []).flatMap((g) => g.layouts).map((l) => [l.key, l.label])), [setup]);
  const designs = useMemo(() => data?.designs || [], [data]);

  const replace = (doc) => setData((d) => (d ? { ...d, designs: d.designs.map((x) => (x._id === doc._id ? doc : x)) } : d));

  // finishing, one tee at a time: words fitted, print check, 3D pictures, saved. (Refs, not state: the list is
  // refreshed while a tee is being finished, and that must not cancel it.)
  const finishingRef = useRef(false);
  const mounted = useRef(true);
  const [finishTick, setFinishTick] = useState(0);
  useEffect(() => {
    mounted.current = true; // (set again: React may run this twice — off, then on)
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!setup || finishingRef.current) return;
    const keyOf = (d) => `${d._id}:${d.updatedAt}`; // (a changed tee is finished again)
    const design = designs.find((d) => d.status === "drafted" && !tried.current.has(keyOf(d)));
    if (!design) return;
    finishingRef.current = true;
    tried.current.add(keyOf(design));
    (async () => {
      try {
        const garment = garmentBy[design.garmentType];
        const colour = colourOf(design);
        if (!garment) {
          replace({ ...design, issues: ["This tee's product is not live any more (Admin → Create your IDENTEE)."] });
          return;
        }
        await fontsReady(design.elements);
        const { elements, issues } = finishElements(design.elements, garment.positions, { size: design.size, fabricHex: colour?.hex || "#1C1C1D" });
        const pictures = await new Promise((resolve) => {
          jobDone.current = resolve;
          setJob({ id: `${design._id}:${Date.now()}`, garment, positions: garment.positions, size: design.size, colourHex: colour?.hex || "#1C1C1D", elements });
        });
        if (!mounted.current) return;
        setJob(null);
        if (!pictures) {
          replace({ ...design, issues: ["The 3D pictures couldn't be taken in this browser. Reload the page to try again."] });
          return;
        }
        try {
          replace(await collectionService.finishDesign(design._id, { elements, mockups: pictures, issues }));
        } catch (err) {
          replace({ ...design, issues: [`Couldn't save the finished tee: ${apiError(err)}`] });
        }
      } finally {
        finishingRef.current = false;
        if (mounted.current) setFinishTick((t) => t + 1);
      }
    })();
  }, [setup, designs, garmentBy, colourOf, finishTick]);

  // change one tee in the admin's words; the page then finishes it again (words, check, 3D pictures)
  const onChange = async (design, instruction) => {
    setBusyId(design._id);
    try {
      const { design: doc, reply } = await collectionService.change(design._id, instruction);
      replace(doc);
      return { reply };
    } catch (err) {
      return { error: apiError(err) };
    } finally {
      setBusyId(null);
    }
  };
  const onResume = async () => {
    try {
      await collectionService.resume(id);
      await load();
    } catch (err) {
      setActionError(apiError(err));
    }
  };
  const areaLabel = useCallback((key) => (setup?.garments || []).flatMap((g) => g.positions).find((p) => p.key === key)?.label || key, [setup]);
  const onAction = async (design, action, body) => {
    setBusyId(design._id);
    setActionError("");
    try {
      const doc = action === "text" ? await collectionService.setText(design._id, body) : await collectionService.act(design._id, action);
      replace(doc);
      if (action === "redo") load();
    } catch (err) {
      setActionError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const collection = data?.collection;
  const finishing = !!job || designs.some((d) => d.status === "drafted");
  return (
    <div className="cm-page">
      <p className="cm-kicker">Shop your IDENTEE</p>
      <h1 className="cm-title">Collection maker</h1>
      {!id && (
      <p className="cm-lead">
        Ready-made tees made by AI from your request: it looks up the facts, plans each tee, draws the pictures and puts them on the tee at true print size.
        You check every tee and publish the ones you like. Customers buy them like a designed tee — printed after the order, no stock.
      </p>
      )}
      {setupError && <p className="cm-error">{setupError}</p>}

      <div className="cm-layout">
        <div style={{ minWidth: 0 }}>
          {!id && setup && <NewCollection setup={setup} onMade={(newId) => navigate(`/admin/collection-maker/${newId}`)} />}
          {id && loadError && <p className="cm-error">{loadError}</p>}
          {id && collection && setup && (
            <>
              <div className="cm-card">
                <div className="cm-row" style={{ justifyContent: "space-between" }}>
                  <h2 className="cm-h2" style={{ margin: 0 }}>{collection.brief?.theme || "Collection"}</h2>
                  <Link className="cm-btn cm-btn-small" to="/admin/collection-maker">
                    + New collection
                  </Link>
                </div>
                <p className="cm-note" style={{ margin: "6px 0 0" }}>Your request: “{collection.prompt}”</p>
              </div>
              {collection.status === "brief" ? (
                <BriefForm collection={collection} setup={setup} onStarted={load} />
              ) : (
                <Progress collection={collection} designs={designs} finishing={finishing} onResume={onResume} />
              )}
              {(collection.facts?.summary || collection.facts?.points?.length > 0) && (
                <details className="cm-card cm-facts">
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Facts the AI found</summary>
                  {collection.facts.summary && <p>{collection.facts.summary}</p>}
                  {collection.facts.points?.length > 0 && (
                    <ul>
                      {collection.facts.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                  {collection.facts.sources?.length > 0 && (
                    <p>
                      Sources:{" "}
                      {collection.facts.sources.map((s, i) => (
                        <span key={s.url}>
                          {i > 0 && " · "}
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title || "link"}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                </details>
              )}
              {designs.length > 0 && (
                <div className="cm-card">
                  <h2 className="cm-h2">The tees</h2>
                  <p className="cm-help">Publish puts a tee in Shop your IDENTEE (seen while that shop is open).</p>
                  {actionError && <p className="cm-error">{actionError}</p>}
                  <div className="cm-tees">
                    {designs.map((d) => (
                      <TeeCard key={d._id} design={d} colour={colourOf(d)} product={garmentBy[d.garmentType]?.label} layoutLabel={layoutBy[d.plan?.layout]} areaLabel={areaLabel} onAction={onAction} onChange={onChange} busy={busyId === d._id} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {id && !collection && !loadError && <p className="cm-note">Loading…</p>}
        </div>

        <aside className="cm-card">
          <h2 className="cm-h2">Earlier collections</h2>
          {past.length === 0 ? (
            <p className="cm-note" style={{ margin: 0 }}>None yet.</p>
          ) : (
            <ul className="cm-past">
              {past.map((c) => (
                <li key={c._id}>
                  <Link to={`/admin/collection-maker/${c._id}`} aria-current={c._id === id ? "page" : undefined}>
                    {c.theme || c.prompt.slice(0, 60)}
                    <small>
                      {when(c.createdAt)} · {c.status === "brief" ? "not started" : c.status === "running" ? "making…" : c.status === "failed" ? "stopped" : `${c.counts.published || 0} published`} · {rupees(c.spentInr)}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {job && <MockupCamera job={job} onDone={(pictures) => jobDone.current?.(pictures)} />}
    </div>
  );
}
