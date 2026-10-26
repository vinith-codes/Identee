// Admin → Studio: the whole tee from one prompt (26 Oct 2026). The admin describes the tee in one go; the text AI
// answers with a PLAN CARD — what it understood and the parts it would make (AI pictures of one kind each, typed
// words) — which the admin checks and changes before any picture is drawn ("user control should be there"). "Make
// the tee" then draws the pictures one by one with the usual picture endpoint and places each on its area; the
// words are typed in for free. The tee stays fully editable afterwards; nothing is published by itself.
import { useState } from "react";
import studioService from "../../../services/studioService";
import { FONTS } from "../../../studio/fonts";
import { shapeFor } from "./studioBits";

const apiError = (err) => err?.response?.data?.message || err?.message || "That didn’t work. Please try again.";
const rupees = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN")}`;
const KIND_ORDER = { background: 0, hero: 1, whole: 1, logo: 2, title: 3, words: 4 };
// a made picture as the assistant lists it (outside the component: it stamps the time)
const asResult = (p, pic) => ({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...pic, kind: p.kind, prompt: p.prompt, look: p.look, area: p.area, at: Date.now() });

export default function TeePlan({ setup, garment, colour, positions, size, onColour, onResult, onAdd, onAddWords, onName, say }) {
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState(null); // { understood, parts, colour, name, cost }
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState(null); // { done, total, failed: [] } while making

  const price = (p) => (p.kind === "words" ? 0 : p.realPerson ? setup.grokPricePerImageInr : setup.pricePerImageInr);
  const chosen = plan ? plan.parts.filter((p) => p.include) : [];
  const total = chosen.reduce((s, p) => s + price(p), 0);
  const areaLabel = (key) => positions.find((p) => p.key === key)?.label || key;

  const makePlan = async () => {
    if (prompt.trim().length < 5 || planning) return;
    setError("");
    setPlanning(true);
    try {
      const out = await studioService.plan({ prompt: prompt.trim(), garment: garment.key, colour: colour.slug });
      setPlan(out);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setPlanning(false);
    }
  };
  const patch = (i, p) => setPlan((cur) => ({ ...cur, parts: cur.parts.map((x, n) => (n === i ? { ...x, ...p } : x)) }));

  const makeTee = async () => {
    if (!chosen.length || run) return;
    setError("");
    if (plan.colour && plan.colour !== colour.slug) onColour(plan.colour);
    if (plan.name) onName(plan.name);
    // background → figure → logo → title → words, so each lands over the one before
    const order = [...chosen].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    const pictures = order.filter((p) => p.kind !== "words");
    const failed = [];
    setRun({ done: 0, total: pictures.length, failed });
    // the pictures go out together; each is placed as soon as it is back (the order on the area is fixed afterwards)
    const made = await Promise.all(
      pictures.map((p) => {
        const pos = positions.find((x) => x.key === p.area) || positions[0];
        return studioService
          .makePicture({ prompt: p.prompt, kind: p.kind, look: p.look, realPerson: p.realPerson, shape: shapeFor(p.kind, pos, size), garment: garment.key, colour: plan.colour || colour.slug })
          .then((pic) => ({ p, pic }))
          .catch((err) => {
            failed.push(`${p.kind} on ${areaLabel(p.area)}: ${apiError(err)}`);
            return null;
          })
          .finally(() => setRun((r) => (r ? { ...r, done: r.done + 1 } : r)));
      }),
    );
    for (const m of made) {
      if (!m) continue;
      const result = asResult(m.p, m.pic);
      onResult(result);
      onAdd(result, m.p.area);
    }
    for (const p of order.filter((x) => x.kind === "words")) onAddWords(p, p.area);
    setRun(null);
    window.dispatchEvent(new Event("identee:my-pictures"));
    if (failed.length) setError(`${failed.length} picture${failed.length === 1 ? "" : "s"} didn’t come back — ${failed[0]}`);
    say(`${made.filter(Boolean).length} picture${made.filter(Boolean).length === 1 ? "" : "s"} on the tee. Move, resize or change anything — it's yours now.`);
  };

  return (
    <div className="st-plan">
      <label className="dr-field">
        Describe the whole tee
        <textarea
          className="st-prompt"
          rows={5}
          value={prompt}
          maxLength={setup.promptMax || 1500}
          placeholder="e.g. A bootleg-poster tee for the film SCENE: Suriya as the director in dramatic side light on the front, the title SCENE in cracked gold above him, a dark grainy backdrop, and the release date 14 · 11 · 2026 as a small line on the back"
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!!run}
        />
        <small>{prompt.length} / {setup.promptMax || 1500} · the AI plans first and shows you the plan; nothing is drawn until you say so.</small>
      </label>
      <button type="button" className="dr-cta st-make" disabled={prompt.trim().length < 5 || planning || !!run} onClick={makePlan}>
        {planning ? "Planning…" : plan ? `Plan it again · ${rupees(setup.chatPriceInr || 0)}` : `Plan the tee · ${rupees(setup.chatPriceInr || 0)}`}
      </button>
      {error && <p className="st-error" role="alert">{error}</p>}

      {plan && (
        <div className="st-plancard">
          <div className="eyebrow">What the AI understood</div>
          <ul className="st-plan-understood">{plan.understood.map((l) => <li key={l}>{l}</li>)}</ul>
          {(plan.name || plan.colour) && (
            <p className="dr-empty">
              {plan.name ? <>Name: <b>{plan.name}</b></> : null}
              {plan.colour && plan.colour !== colour.slug ? <> · colour: <b>{garment.colours.find((c) => c.slug === plan.colour)?.name || plan.colour}</b> (changed when you make it)</> : null}
            </p>
          )}
          <div className="eyebrow">The parts · untick what you don't want, change anything</div>
          {plan.parts.map((p, i) => (
            <div key={i} className={`st-part${p.include ? "" : " off"}`}>
              <label className="st-part-head">
                <input type="checkbox" checked={p.include} onChange={(e) => patch(i, { include: e.target.checked })} disabled={!!run} />
                <select value={p.kind} disabled={!!run} onChange={(e) => patch(i, e.target.value === "words" ? { kind: "words", text: p.text || p.prompt?.slice(0, 40) || "", font: p.font || "Anton", place: p.place || "bottom" } : { kind: e.target.value, prompt: p.prompt || p.text || "", look: p.look || "", realPerson: !!p.realPerson })}>
                  {setup.kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  <option value="words">Words (typed, free)</option>
                </select>
                <select value={p.area} disabled={!!run} onChange={(e) => patch(i, { area: e.target.value })} aria-label="Print area">
                  {positions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                <b className="st-part-price">{price(p) ? rupees(price(p)) : "free"}</b>
              </label>
              {p.kind === "words" ? (
                <div className="dr-row">
                  <input type="text" className="st-part-text" value={p.text} maxLength={80} disabled={!!run} onChange={(e) => patch(i, { text: e.target.value })} aria-label="The words" />
                  <select value={p.font} disabled={!!run} onChange={(e) => patch(i, { font: e.target.value })} aria-label="Font">
                    {FONTS.map((f) => <option key={f} style={{ fontFamily: f }}>{f}</option>)}
                  </select>
                  <select value={p.place} disabled={!!run} onChange={(e) => patch(i, { place: e.target.value })} aria-label="Where on the area">
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>
              ) : (
                <>
                  <textarea rows={3} value={p.prompt} maxLength={setup.promptMax || 1500} disabled={!!run} onChange={(e) => patch(i, { prompt: e.target.value })} aria-label="What to draw" />
                  <div className="dr-row">
                    <select value={p.look} disabled={!!run} onChange={(e) => patch(i, { look: e.target.value })} aria-label="Look">
                      <option value="">Look: as described</option>
                      {setup.looks.map((l) => <option key={l}>{l}</option>)}
                    </select>
                    {setup.grok && (
                      <label className="st-part-real">
                        <input type="checkbox" checked={!!p.realPerson} disabled={!!run} onChange={(e) => patch(i, { realPerson: e.target.checked })} /> Real person (Grok)
                      </label>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
          <button type="button" className="dr-chip" disabled={!!run || plan.parts.length >= 5} onClick={() => setPlan((cur) => ({ ...cur, parts: [...cur.parts, { kind: "words", area: positions[0]?.key, text: "", font: "Anton", place: "bottom", include: true }] }))}>
            + Add a part
          </button>
          {run ? (
            <div className="dr-wait">
              <div className="dr-waithead">Making the pictures… {run.done} of {run.total} back</div>
              <small>Each one is placed on the tee as it arrives. Usually 20–40 seconds a picture.</small>
            </div>
          ) : (
            <button type="button" className="dr-cta gold st-make" disabled={!chosen.length} onClick={makeTee}>
              Make the tee · {chosen.filter((p) => p.kind !== "words").length} picture{chosen.filter((p) => p.kind !== "words").length === 1 ? "" : "s"} · {rupees(total)}
            </button>
          )}
          <p className="dr-empty">Every picture lands on its print area; you then move, resize, change or delete anything in the room. Nothing goes to the shop until you press Publish.</p>
        </div>
      )}
    </div>
  );
}
