// components/shop/ShopAsk.jsx — "Tell us what you're looking for" on Shop your IDENTEE (round 8, 11 Nov 2026)
//
// The customer types a wish in plain words ("black anime tee under ₹500") and the ready tees that fit show up right
// here, across every collection. The wish is read by rules (utils/shopWish.js): instant, free, no sign-in.
// The wish lives in the address (?ask=...), so Back from a tee returns to the same answers.
// When nothing fits, the customer is pointed to Create your IDENTEE to make it themselves.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import shopService from "../../services/shopService";
import ProductCard from "./ProductCard";
import { pairMenWomen } from "../../utils/shopPairs";
import { parseWish, wishExamples, wishTries } from "../../utils/shopWish";
import { SHOPS } from "../../utils/shopNames";

const LIMIT = 24;

const ASK_CSS = `
  .sh-ask { display: grid; gap: 10px; margin: 0 0 26px; padding: 16px; border-radius: 20px; background: var(--cream); border: 1px solid var(--line); }
  .sh-ask-title { margin: 0; font-size: 16px; font-weight: 800; color: var(--ink); }
  .sh-ask-form { display: flex; gap: 8px; max-width: 640px; }
  .sh-ask-form input { flex: 1 1 auto; min-width: 0; min-height: 46px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line);
    background: #fff; color: var(--ink); font-family: inherit; font-size: 16px; font-weight: 500; }
  .sh-ask-form input:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
  .sh-ask-go { flex: none; min-height: 46px; padding: 0 22px; border-radius: 999px; border: none; background: var(--ink); color: #fff;
    font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
  .sh-ask-go:disabled { opacity: .5; cursor: default; }
  .sh-ask-try { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 12.5px; color: var(--muted); }
  .sh-ask-try button { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink);
    font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .sh-ask-try button:hover { border-color: var(--ink); }
  .sh-ask-said { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 13px; color: var(--muted); }
  .sh-ask-said b { font-weight: 600; color: var(--ink); background: #F4ECD8; border-radius: 999px; padding: 5px 11px; font-size: 12.5px; }
  .sh-ask-note { margin: 0; font-size: 13.5px; color: var(--ink); }
  .sh-ask-none { display: grid; gap: 8px; justify-items: start; padding: 14px 16px; border-radius: 14px; background: #fff; border: 1px dashed var(--line);
    font-size: 14px; color: var(--ink); }
  .sh-ask-none a, .sh-ask-own { color: #7A5B12; font-weight: 700; }
  .sh-ask-own { font-size: 13.5px; }
  .sh-ask .sh-grid { margin-top: 4px; }
  @media (max-width: 480px) {
    .sh-ask { padding: 14px 12px; border-radius: 16px; }
    .sh-ask-go { padding: 0 16px; }
  }
`;

export default function ShopAsk({ facets }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const ask = (params.get("ask") || "").slice(0, 120);
  const [draft, setDraft] = useState({ of: ask, value: ask });
  const value = draft.of === ask ? draft.value : ask; // Back / Forward changed the wish: the box follows it
  const [found, setFound] = useState({ key: "", items: [], total: 0, note: "", said: [], vague: false, failed: false });

  useEffect(() => {
    if (!ask || !facets) return undefined;
    let alive = true;
    const wish = parseWish(ask, facets);
    const tries = wishTries(wish);
    (async () => {
      const answer = { key: ask, items: [], total: 0, note: "", said: wish.said, vague: !tries.length, failed: false };
      try {
        for (const t of tries) {
          const d = await shopService.listProducts({ ...t.params, limit: LIMIT });
          if (d.items?.length) {
            Object.assign(answer, { items: d.items, total: d.total, note: t.note });
            break;
          }
        }
      } catch {
        answer.failed = true;
      }
      if (alive) setFound(answer);
    })();
    return () => {
      alive = false;
    };
  }, [ask, facets]);

  const cards = useMemo(() => pairMenWomen(found.items), [found.items]);
  const examples = useMemo(() => wishExamples(facets || {}), [facets]);
  const loading = !!ask && found.key !== ask;
  const shown = !!ask && found.key === ask;
  const from = { to: location.pathname + location.search, label: `${SHOPS.shop.name} · “${ask}”` };

  const go = (text) => {
    const wish = String(text || "").trim().slice(0, 120);
    const next = new URLSearchParams(params);
    if (wish) next.set("ask", wish);
    else next.delete("ask");
    setDraft({ of: wish, value: wish });
    setParams(next);
  };

  return (
    <section className="sh-ask" aria-label="Tell us what you're looking for">
      <style>{ASK_CSS}</style>
      <h2 className="sh-ask-title">Tell us what you’re looking for</h2>
      <form
        className="sh-ask-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
      >
        <input
          type="search"
          value={value}
          maxLength={120}
          enterKeyHint="search"
          placeholder="black tee under ₹500"
          aria-label="What are you looking for?"
          onChange={(e) => setDraft({ of: ask, value: e.target.value })}
        />
        <button type="submit" className="sh-ask-go" disabled={!value.trim() || loading}>
          {loading ? "Looking…" : "Find"}
        </button>
      </form>

      {!ask && examples.length > 0 && (
        <p className="sh-ask-try" style={{ margin: 0 }}>
          Try:
          {examples.map((x) => (
            <button key={x} type="button" onClick={() => go(x)}>
              {x}
            </button>
          ))}
        </p>
      )}

      {loading && (
        <div className="sh-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sh-skel" />
          ))}
        </div>
      )}

      {shown && (
        <div aria-live="polite" style={{ display: "grid", gap: 10 }}>
          {found.said.length > 0 && !found.failed && (
            <p className="sh-ask-said" style={{ margin: 0 }}>
              Looking for:
              {found.said.map((s) => (
                <b key={s}>{s}</b>
              ))}
              <button type="button" className="sh-clear" onClick={() => go("")}>
                Clear
              </button>
            </p>
          )}
          {found.failed ? (
            <p className="sh-error" style={{ margin: 0 }}>
              Couldn’t look that up just now. Please try again.
            </p>
          ) : found.vague ? (
            <p className="sh-ask-note">Tell us a little more: a colour, a style, a theme or a price. For example “black oversized tee under ₹500”.</p>
          ) : cards.length === 0 ? (
            <div className="sh-ask-none">
              <span>
                <b>No ready tee fits that yet.</b> You can make exactly that tee yourself, with your own words and pictures.
              </span>
              <Link to={SHOPS.create.to}>{SHOPS.create.name} →</Link>
            </div>
          ) : (
            <>
              {found.note && <p className="sh-ask-note">{found.note}</p>}
              <p className="sh-ask-note" style={{ color: "var(--muted)" }}>
                {cards.length} tee{cards.length === 1 ? "" : "s"} found{found.total > found.items.length ? " (the first ones are shown)" : ""}
              </p>
              <div className="sh-grid">
                {cards.map((p) => (
                  <ProductCard key={p.groupId || p._id} p={p} from={from} />
                ))}
              </div>
              <Link className="sh-ask-own" to={SHOPS.create.to}>
                Not what you had in mind? Design your own →
              </Link>
            </>
          )}
        </div>
      )}
    </section>
  );
}
