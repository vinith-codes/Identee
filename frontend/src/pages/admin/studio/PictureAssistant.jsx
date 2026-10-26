// Admin → Studio: the picture assistant (25 Oct 2026). The AI only makes PICTURES here — one at a time, from the admin's
// words — and the admin puts each one on the tee by hand. A picture is asked for as one kind (whole artwork, title
// lettering, hero figure, background texture, small logo), with an optional look and up to 3 reference pictures that
// are only a reference (never copied). "Real person" sends it to Grok (costs more); everything else goes to Google.
import { useEffect, useMemo, useRef, useState } from "react";
import artDesignService from "../../../services/artDesignService";
import { PICTURES_CHANGED } from "../../../studio/pictureHelpers";
import TeePlan from "./TeePlan";
import studioService from "../../../services/studioService";
import { imageUrl } from "../../../utils/imageUrl";
import WaitCard from "../../../studio/WaitCard";
import { areaCm } from "../../../studio/teeModel";
import { shapeFor } from "./studioBits";

const apiError = (err) => err?.response?.data?.message || err?.message || "That didn’t work. Please try again.";
const rupees = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN")}`;

// The free art library inside the assistant (Step 3): a search box; a match goes straight onto the chosen area.
function ArtSearch({ target, targetLabel, onAdd }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(null);
  useEffect(() => {
    if (all !== null || q.trim().length < 2) return undefined;
    let off = false;
    artDesignService
      .getArtDesigns()
      .then((list) => !off && setAll(Array.isArray(list) ? list : []))
      .catch(() => !off && setAll([]));
    return () => {
      off = true;
    };
  }, [q, all]);
  const term = q.trim().toLowerCase();
  const found = useMemo(() => (term.length < 2 || !all ? [] : all.filter((d) => `${d.name} ${d.category?.name || ""}`.toLowerCase().includes(term)).slice(0, 12)), [all, term]);
  return (
    <div className="st-artsearch">
      <div className="eyebrow">Or the free art library</div>
      <div className="dr-artsearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the free designs… (tiger, bike, cricket)" aria-label="Search the free designs" />
        {q && <button type="button" className="dr-artclear" onClick={() => setQ("")} aria-label="Clear the search">✕</button>}
      </div>
      {term.length >= 2 && all === null && <p className="dr-empty">Opening the designs…</p>}
      {term.length >= 2 && all !== null && !found.length && <p className="dr-empty">Nothing called “{q.trim()}”. Try a shorter word.</p>}
      {found.length > 0 && (
        <div className="st-artgrid">
          {found.map((d) => (
            <button key={d._id} type="button" className="dr-artitem" title={`Add “${d.name}” to ${targetLabel}`} onClick={() => onAdd(d, target)}>
              <img src={imageUrl(d.imageUrl, 200)} alt={d.name} loading="lazy" decoding="async" />
              <span>{d.name}</span>
              <b>Free · add</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PictureAssistant({ setup, garment, colour, positions, size, activeKey, results, onResult, onAdd, onAddArt, onAddWords, onColour, onName, say, onClose }) {
  const [mode, setMode] = useState("one"); // "one" picture at a time | "tee": the whole tee from one prompt
  const [kind, setKind] = useState("whole");
  const [prompt, setPrompt] = useState("");
  const [look, setLook] = useState("");
  const [realPerson, setRealPerson] = useState(false);
  const [refs, setRefs] = useState([]); // { file, url }
  const [target, setTarget] = useState(activeKey || positions.find((p) => p.side === "front" && p.main)?.key || positions[0]?.key);
  const [count, setCount] = useState(1); // how many tries at once (each is one picture, costed)
  const [making, setMaking] = useState(null); // { label, expect, hint } while a picture is made
  const [error, setError] = useState("");
  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState(null); // { improved, understood, cost } from "Improve my words"
  const fileRef = useRef(null);
  // the open print area is where the next picture goes
  const [lastActive, setLastActive] = useState(activeKey);
  if (activeKey !== lastActive) {
    setLastActive(activeKey);
    if (activeKey) setTarget(activeKey);
  }
  useEffect(() => () => refs.forEach((r) => URL.revokeObjectURL(r.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = positions.find((p) => p.key === target) || positions[0];
  const price = realPerson ? setup.grokPricePerImageInr : setup.pricePerImageInr;
  const canMake = prompt.trim().length >= 3 && !making && pos && (realPerson ? setup.grok : setup.google);

  const addRefs = (e) => {
    const files = [...(e.target.files || [])].filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type) && f.size <= 10 * 1024 * 1024);
    e.target.value = "";
    setRefs((cur) => [...cur, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, setup.maxRefs || 3));
  };
  const dropRef = (i) =>
    setRefs((cur) => {
      URL.revokeObjectURL(cur[i].url);
      return cur.filter((_, j) => j !== i);
    });

  const improve = async () => {
    if (prompt.trim().length < 3 || improving) return;
    setError("");
    setImproving(true);
    try {
      setSuggestion(await studioService.improve({ prompt: prompt.trim(), kind, look, garment: garment.key, colour: colour.slug }));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setImproving(false);
    }
  };
  const make = async () => {
    if (!canMake) return;
    setError("");
    const n = count;
    setMaking({ label: n > 1 ? `Drawing ${n} pictures at once…` : realPerson ? "Grok is drawing…" : "Drawing the picture…", expect: realPerson ? 30 : 25, hint: "Usually 20–40 seconds." });
    const fields = { prompt: prompt.trim(), kind, look, realPerson, shape: shapeFor(kind, pos, size), garment: garment.key, colour: colour.slug, of: n };
    const files = refs.map((r) => r.file);
    // several tries go out together; each one is listed as soon as it is back
    const errors = [];
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        studioService
          .makePicture({ ...fields, variation: i + 1 }, files)
          .then((picture) => onResult({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...picture, kind, prompt: prompt.trim(), look, area: pos.key, at: Date.now() }))
          .catch((err) => errors.push(apiError(err))),
      ),
    );
    if (errors.length) setError(errors.length === n ? errors[0] : `${errors.length} of ${n} didn’t come back: ${errors[0]}`);
    setMaking(null);
    if (errors.length < n) window.dispatchEvent(new Event(PICTURES_CHANGED)); // My pictures shows the new one(s)
  };

  return (
    <aside className="st-assist" aria-label="Picture assistant">
      <header>
        <div>
          <div className="eyebrow">AI pictures</div>
          <h2>Picture assistant</h2>
        </div>
        <button type="button" className="dr-x" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      <div className="st-assist-body">
        <div className="dr-seg st-mode" role="group" aria-label="How to work">
          <button type="button" className={mode === "one" ? "on" : ""} aria-pressed={mode === "one"} onClick={() => setMode("one")}>One picture at a time</button>
          <button type="button" className={mode === "tee" ? "on" : ""} aria-pressed={mode === "tee"} onClick={() => setMode("tee")}>Whole tee from one prompt</button>
        </div>
        {mode === "tee" && (
          <TeePlan setup={setup} garment={garment} colour={colour} positions={positions} size={size} onColour={onColour} onResult={onResult} onAdd={onAdd} onAddWords={onAddWords} onName={onName} say={say} />
        )}
        <div className="dr-field" hidden={mode !== "one"}>
          What kind of picture?
          <div className="st-kinds" role="radiogroup" aria-label="Kind of picture">
            {setup.kinds.map((k) => (
              <button key={k.key} type="button" role="radio" aria-checked={kind === k.key} className={`st-kind${kind === k.key ? " on" : ""}`} onClick={() => setKind(k.key)} title={k.about}>
                {k.label}
              </button>
            ))}
          </div>
          <small>{setup.kinds.find((k) => k.key === kind)?.about}</small>
        </div>
        <label className="dr-field" hidden={mode !== "one"}>
          Describe it
          <textarea
            className="st-prompt"
            rows={4}
            value={prompt}
            maxLength={setup.promptMax || 1500}
            placeholder={
              kind === "title"
                ? "e.g. the word SCENE in heavy condensed capitals, cracked gold ink, 1990s bootleg poster style"
                : kind === "hero"
                  ? "e.g. a stern film director in a dark coat, half-turned, dramatic side light, painted portrait"
                  : kind === "background"
                    ? "e.g. faded film-grain texture with a torn-paper edge, dark red and black"
                    : kind === "logo"
                      ? "e.g. a small round stamp that says EST. 2026 with a film reel in the middle"
                      : "e.g. a bootleg movie-poster collage of three dramatic portraits with the title SCENE across the bottom and the date 14 · 11 · 2026 in small type"
            }
            onChange={(e) => setPrompt(e.target.value)}
          />
          <small>{prompt.length} / {setup.promptMax || 1500}</small>
        </label>
        {mode !== "one" ? null : suggestion ? (
          <div className="st-suggest">
            <b>Improved words</b>
            <p>{suggestion.improved}</p>
            {suggestion.understood?.length > 0 && (
              <ul>{suggestion.understood.map((l) => <li key={l}>{l}</li>)}</ul>
            )}
            <div className="dr-row">
              <button type="button" className="dr-chip on" onClick={() => { setPrompt(suggestion.improved); setSuggestion(null); }}>Use these words</button>
              <button type="button" className="dr-chip" onClick={() => setSuggestion(null)}>Keep mine</button>
            </div>
          </div>
        ) : (
          <button type="button" className="st-improve" disabled={prompt.trim().length < 3 || improving || !!making} onClick={improve}>
            {improving ? "Improving…" : `✦ Improve my words${setup.chatPriceInr ? ` · ${rupees(setup.chatPriceInr)}` : ""}`}
            <small>The text AI rewrites them as a stronger picture prompt and says what it understood.</small>
          </button>
        )}
        <div className="dr-row" hidden={mode !== "one"}>
          <label className="dr-field">
            Look
            <select value={look} onChange={(e) => setLook(e.target.value)}>
              <option value="">My words decide</option>
              {setup.looks.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="dr-field">
            Goes on
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {positions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} · {areaCm(p, size).join("×")} cm
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={`st-switch${!setup.grok ? " off" : ""}`} hidden={mode !== "one"}>
          <input type="checkbox" checked={realPerson} disabled={!setup.grok} onChange={(e) => setRealPerson(e.target.checked)} />
          <span>
            <b>Real person</b>
            <small>{setup.grok ? `A real, named person (an actor, a player). Drawn by Grok · ${rupees(setup.grokPricePerImageInr)} a picture.` : "Grok is not set up on this server, so real people can’t be drawn."}</small>
          </span>
        </label>
        <div className="dr-field" hidden={mode !== "one"}>
          Reference pictures <small style={{ fontWeight: 400 }}>— optional, up to {setup.maxRefs || 3}. Only for the look{setup.grok ? " (or the person’s likeness)" : ""}; never copied.</small>
          <div className="st-refs">
            {refs.map((r, i) => (
              <span key={r.url} className="st-ref">
                <img src={r.url} alt="" />
                <button type="button" aria-label="Remove this reference" onClick={() => dropRef(i)}>✕</button>
              </span>
            ))}
            {refs.length < (setup.maxRefs || 3) && (
              <button type="button" className="st-ref st-ref-add" onClick={() => fileRef.current?.click()}>
                + Add
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={addRefs} />
          </div>
        </div>
        <div className="dr-field" hidden={mode !== "one"}>
          How many tries at once?
          <div className="dr-row" role="group" aria-label="How many tries">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={`dr-chip${count === n ? " on" : ""}`} aria-pressed={count === n} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
            <small>Each try is one picture. Pick the best, delete the rest.</small>
          </div>
        </div>
        {mode !== "one" ? null : making ? (
          <WaitCard key={making.label} {...making} />
        ) : (
          <button type="button" className="dr-cta st-make" disabled={!canMake} onClick={make}>
            Make {count > 1 ? `${count} pictures` : "the picture"} · {rupees(price * count)}
          </button>
        )}
        {mode === "one" && error && <p className="st-error" role="alert">{error}</p>}
        {mode === "one" && !setup.google && !realPerson && <p className="st-error">Google’s picture AI is not set up on this server.</p>}

        {onAddArt && <ArtSearch target={pos?.key} targetLabel={pos?.label || "the tee"} onAdd={onAddArt} />}

        {results.length > 0 && <p className="dr-empty">✓ {results.length} picture{results.length === 1 ? "" : "s"} made in this room — they are in the editor's <b>AI pictures</b> tab; tap one there to choose where it goes.</p>}
      </div>
    </aside>
  );
}
