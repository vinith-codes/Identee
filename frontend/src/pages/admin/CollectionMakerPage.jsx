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
const PIPELINE = ["Looking up facts", "Planning the tees", "Making the pictures", "Finishing the tees (in this browser)"];

/* ---------- 1. a new collection: the prompt ---------- */
function NewCollection({ onMade }) {
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // the example picture's preview (its address is let go when it changes and when the page closes)
  const previewRef = useRef("");
  const pick = (f) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : "";
    setPreview(previewRef.current);
    setFile(f);
  };
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { collection } = await collectionService.makeBrief(prompt.trim(), file);
      onMade(collection._id);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cm-card" onSubmit={submit}>
      <h2 className="cm-h2">New collection</h2>
      <p className="cm-help">Say what you want, in your own words. The AI first shows you a brief to check — nothing is made or spent until you press Start.</p>
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
        <label className="cm-btn cm-btn-small" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {file ? "Change the example picture" : "Add an example picture (optional)"}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
        </label>
        {file && (
          <button type="button" className="cm-btn cm-btn-small" onClick={() => pick(null)}>
            Remove it
          </button>
        )}
      </div>
      {file && preview && (
        <div className="cm-ref">
          <img src={preview} alt="The example picture" />
          <span className="cm-note">The AI takes its look as inspiration and makes new artwork — it doesn't copy it.</span>
        </div>
      )}
      {error && <p className="cm-error">{error}</p>}
      <div className="cm-row" style={{ marginTop: 14 }}>
        <button className="cm-btn cm-btn-primary" disabled={busy || prompt.trim().length < 3}>
          {busy ? "Reading your request…" : "Make the brief"}
        </button>
        <span className="cm-note">about ₹0.20</span>
      </div>
    </form>
  );
}

/* ---------- 2. the brief: checked and changed, then Start ---------- */
function BriefForm({ collection, setup, onStarted }) {
  const [brief, setBrief] = useState(() => ({ ...collection.brief }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  const count = Math.min(setup.maxTees, Math.max(1, Number(brief.count) || 1));
  const budget = Math.min(setup.maxBudget, Math.max(count, Number(brief.budget) || count));
  const each = brief.realPeople ? setup.grokPricePerImageInr : setup.pricePerImageInr;
  const toggleColour = (slug) => setBrief((b) => ({ ...b, colours: b.colours.includes(slug) ? b.colours.filter((s) => s !== slug) : [...b.colours, slug] }));
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
    <div className="cm-card">
      <h2 className="cm-h2">Check the brief</h2>
      <p className="cm-help">This is what the AI understood from your request. Change anything, then press Start.</p>
      <div className="cm-grid2">
        <div className="cm-field cm-full">
          <label className="cm-label" htmlFor="cm-theme">Theme</label>
          <input id="cm-theme" className="cm-input" value={brief.theme} maxLength={200} onChange={(e) => set("theme", e.target.value)} />
        </div>
        <div className="cm-field">
          <label className="cm-label" htmlFor="cm-count">How many tees</label>
          <input id="cm-count" className="cm-input" type="number" min={1} max={setup.maxTees} value={brief.count} onChange={(e) => set("count", e.target.value)} />
        </div>
        <div className="cm-field">
          <label className="cm-label" htmlFor="cm-lang">Language of the words</label>
          <input id="cm-lang" className="cm-input" value={brief.language} maxLength={60} onChange={(e) => set("language", e.target.value)} />
        </div>
        <div className="cm-field cm-full">
          <label className="cm-label" htmlFor="cm-style">Look and mood</label>
          <input id="cm-style" className="cm-input" value={brief.style} maxLength={300} onChange={(e) => set("style", e.target.value)} />
        </div>
        <div className="cm-field cm-full">
          <span className="cm-label">Tee colours (none ticked = any)</span>
          <div className="cm-row">
            {setup.colours.map((c) => (
              <button key={c.slug} type="button" className="cm-chip" aria-pressed={brief.colours.includes(c.slug)} onClick={() => toggleColour(c.slug)}>
                <span className="cm-dot" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="cm-field cm-full">
          <label className="cm-label" htmlFor="cm-avoid">Leave out (optional)</label>
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
        <div className="cm-field">
          <label className="cm-label" htmlFor="cm-budget">Most pictures it may make</label>
          <input id="cm-budget" className="cm-input" type="number" min={count} max={setup.maxBudget} value={brief.budget} onChange={(e) => set("budget", e.target.value)} />
        </div>
      </div>
      {(collection.refImage || collection.refNotes) && (
        <div className="cm-ref">
          {collection.refImage && <img src={imageUrl(collection.refImage, 200)} alt="Your example picture" />}
          <span className="cm-note">{collection.refNotes ? `What the AI sees in your example: ${collection.refNotes}` : "Your example picture."}</span>
        </div>
      )}
      <div className="cm-cost">
        <strong>Cost:</strong> {count} tee{count === 1 ? "" : "s"}, at most {budget} pictures (a few spare for retries) ≈ <strong>up to {rupees(budget * each)}</strong>
        {brief.realPeople ? " (if every picture is a Grok one)" : ""}, plus about ₹1 for the AI's thinking. It also looks up the latest facts with Google Search.
      </div>
      {error && <p className="cm-error">{error}</p>}
      <div className="cm-row" style={{ marginTop: 14 }}>
        <button className="cm-btn cm-btn-primary" onClick={start} disabled={busy || !brief.theme?.trim()}>
          {busy ? "Starting…" : `Start — make ${count} tee${count === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

/* ---------- 3. progress ---------- */
function Progress({ collection, designs, finishing }) {
  const running = collection.status === "running";
  const step = collection.step || "";
  const at = !running ? (finishing ? 3 : 4) : step.startsWith("Making") ? 2 : step.startsWith("Planning") ? 1 : step.startsWith("Looking") ? 0 : 0;
  return (
    <div className="cm-card">
      <h2 className="cm-h2">{running ? "Making the tees" : finishing ? "Finishing the tees" : "Done"}</h2>
      <p className="cm-help">
        {running
          ? "You can leave this page; the server keeps going. Come back to see the tees."
          : finishing
            ? "Keep this page open: this browser is fitting the words and taking the 3D pictures."
            : "Check each tee below, then publish the ones you like."}
      </p>
      <ol className="cm-steps">
        {PIPELINE.map((label, i) => (
          <li key={label} className={i < at ? "cm-step-done" : i === at && (running || finishing) ? "cm-step-now" : ""}>
            <span className="cm-step-icon">{i < at ? "✓" : ""}</span>
            {i === 2 && running && step.startsWith("Making") ? step : label}
          </li>
        ))}
      </ol>
      <p className="cm-note" style={{ marginTop: 12 }}>
        Spent so far: <strong>{rupees(collection.spentInr)}</strong> · {collection.pictures} picture{collection.pictures === 1 ? "" : "s"} of {collection.brief.budget}
        {designs.length ? ` · ${designs.filter((d) => d.status === "published").length} published` : ""}
      </p>
      {collection.error && <p className="cm-error">{collection.error}</p>}
    </div>
  );
}

/* ---------- 4. one tee ---------- */
function TeeCard({ design, colour, layoutLabel, onAction, busy }) {
  const [side, setSide] = useState("back");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(design.name);
  const [blurb, setBlurb] = useState(design.blurb);
  const hasMockups = !!design.mockups?.front;
  const pic = hasMockups ? design.mockups[side] || design.mockups.front : design.art?.url;
  const save = async () => {
    await onAction(design, "text", { name, blurb });
    setEditing(false);
  };
  return (
    <article className="cm-tee">
      <div className="cm-tee-pics">
        {pic ? <img src={imageUrl(pic, 700)} alt={`${design.name}, ${side}`} className={hasMockups ? "" : "cm-art"} /> : <span className="cm-note">No picture yet</span>}
        <span className={`cm-badge cm-badge-${design.status}`}>{STATUS_TEXT[design.status] || design.status}</span>
        {hasMockups && (
          <div className="cm-sidebtns">
            {SIDES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cm-tee-body">
        {editing ? (
          <>
            <input className="cm-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Name in the shop" />
            <textarea className="cm-textarea" style={{ minHeight: 60 }} value={blurb} maxLength={300} onChange={(e) => setBlurb(e.target.value)} aria-label="Line for the shop page" />
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
          <>
            <p className="cm-tee-name">{design.name}</p>
            {design.blurb && <p className="cm-tee-meta" style={{ margin: 0 }}>{design.blurb}</p>}
          </>
        )}
        <div className="cm-tee-meta">
          {colour && (
            <span className="cm-row" style={{ gap: 6, display: "inline-flex" }}>
              <span className="cm-dot" style={{ background: colour.hex }} />
              {colour.name}
            </span>
          )}
          {layoutLabel ? ` · ${layoutLabel}` : ""}
          {design.plan?.words ? <> · Words: “{design.plan.words.replace(/\n/g, " / ")}”</> : ""}
          {design.service ? ` · Picture by ${design.service === "grok" ? "Grok" : "Google"}` : ""}
          {design.costInr ? ` · ${rupees(design.costInr)}` : ""}
        </div>
        {design.plan?.idea && <div className="cm-tee-meta">Idea: {design.plan.idea}</div>}
        {design.error && design.status === "failed" && <p className="cm-error" style={{ margin: 0 }}>{design.error}</p>}
        {design.issues?.length > 0 && (
          <ul className="cm-issues">
            {design.issues.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <div className="cm-row" style={{ marginTop: 4 }}>
          {design.status === "ready" && (
            <button className="cm-btn cm-btn-small cm-btn-primary" disabled={busy} onClick={() => onAction(design, "publish")}>
              Publish
            </button>
          )}
          {design.status === "published" && (
            <>
              <a className="cm-btn cm-btn-small" href={shopHref(`/ready-made/design/${design.slug}`)} target="_blank" rel="noreferrer">
                See it in the shop
              </a>
              <button className="cm-btn cm-btn-small" disabled={busy} onClick={() => onAction(design, "unpublish")}>
                Unpublish
              </button>
            </>
          )}
          {["ready", "failed", "drafted"].includes(design.status) && (
            <button className="cm-btn cm-btn-small" disabled={busy} onClick={() => onAction(design, "redo")} title="Costs one picture">
              New picture
            </button>
          )}
          {["ready", "published"].includes(design.status) && !editing && (
            <button className="cm-btn cm-btn-small" onClick={() => setEditing(true)}>
              Edit name
            </button>
          )}
          {design.status === "rejected" ? (
            <button className="cm-btn cm-btn-small" disabled={busy || !hasMockups} onClick={() => onAction(design, "restore")}>
              Bring back
            </button>
          ) : (
            design.status !== "published" && (
              <button className="cm-btn cm-btn-small cm-btn-danger" disabled={busy} onClick={() => onAction(design, "reject")}>
                Reject
              </button>
            )
          )}
        </div>
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

  const colourBy = useMemo(() => Object.fromEntries((setup?.colours || []).map((c) => [c.slug, c])), [setup]);
  const layoutBy = useMemo(() => Object.fromEntries((setup?.layouts || []).map((l) => [l.key, l.label])), [setup]);
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
    const keyOf = (d) => `${d._id}:${d.art?.url}`;
    const design = designs.find((d) => d.status === "drafted" && !tried.current.has(keyOf(d)));
    if (!design) return;
    finishingRef.current = true;
    tried.current.add(keyOf(design));
    (async () => {
      try {
        const colour = colourBy[design.color];
        await fontsReady(design.elements);
        const { elements, issues } = finishElements(design.elements, setup.positions, { size: design.size, fabricHex: colour?.hex || "#1C1C1D" });
        const pictures = await new Promise((resolve) => {
          jobDone.current = resolve;
          setJob({ id: `${design._id}:${Date.now()}`, garment: setup.garment, positions: setup.positions, size: design.size, colourHex: colour?.hex || "#1C1C1D", elements });
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
  }, [setup, designs, colourBy, finishTick]);

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
      <p className="cm-lead">
        Ready-made tees made by AI from your request: it looks up the facts, plans each tee, draws the pictures and puts them on the tee at true print size.
        You check every tee and publish the ones you like. Customers buy them like a designed tee — printed after the order, no stock.
      </p>
      {setupError && <p className="cm-error">{setupError}</p>}

      <div className="cm-layout">
        <div style={{ minWidth: 0 }}>
          {!id && <NewCollection onMade={(newId) => navigate(`/admin/collection-maker/${newId}`)} />}
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
                <Progress collection={collection} designs={designs} finishing={finishing} />
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
                  <p className="cm-help">Publish puts a tee in Shop your IDENTEE (customers see it only while that shop is open). New picture makes the picture again (costs one picture).</p>
                  {actionError && <p className="cm-error">{actionError}</p>}
                  <div className="cm-tees">
                    {designs.map((d) => (
                      <TeeCard key={d._id} design={d} colour={colourBy[d.color]} layoutLabel={layoutBy[d.plan?.layout]} onAction={onAction} busy={busyId === d._id} />
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
