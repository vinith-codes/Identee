// components/shop/ShopGrid.jsx
//
// The ready-made product grid with its filters — used on /ready-made (all
// categories) and on each category page (category fixed). Filters live in
// the address (?size=M&color=Black&maxPrice=999&sort=price_asc&q=…), so a
// filtered page can be shared or reloaded. A category with more than one
// style (Men's: Oversized + Round Neck) first shows a card per style; a card
// opens that style's tees (the client, 28 Oct 2026).
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import shopService from "../../services/shopService";
import { colourHex, isLight } from "../../utils/colours";
import { imageUrl } from "../../utils/imageUrl";
import ProductCard from "./ProductCard";
import { money } from "../../utils/money";
import { SHOP_CSS } from "./shopStyles";

const SORTS = [
  ["newest", "Newest"],
  ["popular", "Popular"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["discount", "Biggest discount"],
];
const PRICE_STEPS = [499, 799, 999, 1499, 1999, 2999];
const PAGE_SIZE = 12;
const KEYS = ["cat", "style", "size", "color", "maxPrice", "q", "sort"];

// "MEN'S T-SHIRTS" → "Men's T-shirts"
const oneCategoryName = (name) => (name ? name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : "");

// one list of products: the first page when the query changes, then "Show more" pages
function useProductPages(query) {
  const key = JSON.stringify(query);
  const [data, setData] = useState({ key: "", items: [], total: 0, page: 0, pages: 0, facets: null });
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    let alive = true;
    shopService
      .listProducts({ ...query, page: 1 })
      .then((d) => {
        if (!alive) return;
        setData({ key, ...d });
        setError("");
      })
      .catch(() => alive && setError("Couldn't load the products. Please try again."));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    setMore(true);
    try {
      const d = await shopService.listProducts({ ...query, page: data.page + 1 });
      setData((cur) => ({ ...d, key: cur.key, items: [...cur.items, ...d.items] }));
    } catch {
      setError("Couldn't load more products.");
    } finally {
      setMore(false);
    }
  };

  return { data, loading: data.key !== key, error, more, loadMore };
}

function ProductGrid({ list, skeletons = 8, from = null }) {
  const { data, loading, more, loadMore } = list;
  return (
    <>
      <div className={`sh-grid${loading ? " is-loading" : ""}`}>
        {loading && !data.items.length
          ? Array.from({ length: skeletons }).map((_, i) => <div key={i} className="sh-skel" />)
          : data.items.map((p) => <ProductCard key={p.groupId} p={p} from={from} />)}
      </div>
      {!loading && data.page < data.pages && (
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <button type="button" className="sh-more-btn" onClick={loadMore} disabled={more}>
            {more ? "Loading…" : `Show more (${data.total - data.items.length} left)`}
          </button>
        </div>
      )}
    </>
  );
}

// one style's card on a category page: its newest tee's photo and how many tees; left out when it has none
function StyleCard({ style, query, onOpen }) {
  const { data, loading } = useProductPages({ ...query, style, limit: 1 });
  if (loading) return <div className="sh-skel sh-style-skel" />;
  if (!data.total) return null;
  const photo = data.items[0]?.images?.[0];
  return (
    <button type="button" className="sh-style-card" onClick={() => onOpen(style)} aria-label={`${style}: ${data.total} tees`}>
      {photo && <img src={imageUrl(photo, 600)} alt="" loading="lazy" />}
      <span className="sh-style-text">
        <b>{style}</b>
        <span>
          {data.total} product{data.total === 1 ? "" : "s"}
        </span>
        <span className="sh-style-go">Shop now →</span>
      </span>
    </button>
  );
}

export default function ShopGrid({ category = null, id = "shop" }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ""]));
  const [search, setSearch] = useState(f.q);
  const [open, setOpen] = useState(false); // filters drawer on phones

  const query = useMemo(
    () => ({
      category: category || f.cat || undefined,
      style: f.style || undefined,
      size: f.size || undefined,
      color: f.color || undefined,
      maxPrice: f.maxPrice || undefined,
      q: f.q || undefined,
      sort: f.sort || undefined,
      limit: PAGE_SIZE,
    }),
    [category, f.cat, f.style, f.size, f.color, f.maxPrice, f.q, f.sort],
  );
  const list = useProductPages(query);
  const { data, loading, error } = list;

  // search box → address, after a short pause
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== f.q) set("q", search.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(k, v) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "cat") next.delete("style");
    setParams(next, { replace: true, preventScrollReset: true });
  }
  // a style card / "All styles" is a step the phone's back button can undo
  function pickStyle(style) {
    const next = new URLSearchParams(params);
    if (style) next.set("style", style);
    else next.delete("style");
    setParams(next, { preventScrollReset: true });
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  const clearAll = () => {
    const next = new URLSearchParams(params);
    KEYS.filter((k) => k !== "sort").forEach((k) => next.delete(k));
    setSearch("");
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const facets = data.facets;
  const active = [
    !category && f.cat && ["cat", facets?.categories.find((c) => c.slug === f.cat)?.name || f.cat],
    f.style && ["style", f.style],
    f.size && ["size", `Size ${f.size}`],
    f.color && ["color", f.color],
    f.maxPrice && ["maxPrice", `Under ${money(f.maxPrice)}`],
    f.q && ["q", `“${f.q}”`],
  ].filter(Boolean);
  const prices = PRICE_STEPS.filter((p) => !facets || p > facets.priceMin);
  const styles = facets?.styles || [];
  // one category with several styles: a card per style until one is chosen
  const oneCategory = Boolean(category || f.cat);
  const byStyle = oneCategory && styles.length > 1;
  // where a product card was opened from, for the product page's back link ("Men's T-shirts · Oversized")
  const catName = oneCategory ? oneCategoryName(data.items[0]?.category?.name) : "";
  const from = { to: location.pathname + location.search, label: [catName || "Shop your IDENTEE", f.style].filter(Boolean).join(" · ") };

  if (byStyle && !f.style) {
    return (
      <section id={id} className="sh-wrap" aria-label="Styles">
        <style>{SHOP_CSS}</style>
        {error && <p className="sh-error">{error}</p>}
        <div className="sh-styles">
          {styles.map((s) => (
            <StyleCard key={s} style={s} query={query} onOpen={pickStyle} />
          ))}
        </div>
        {active.length > 0 && (
          <div className="sh-meta">
            {active.map(([k, label]) => (
              <button key={k} type="button" className="sh-pill" onClick={() => (k === "q" ? (setSearch(""), set("q", "")) : set(k, ""))} aria-label={`Remove filter ${label}`}>
                {label} ×
              </button>
            ))}
          </div>
        )}
        {!loading && data.total === 0 && (
          <div className="sh-empty">
            <b>No products match.</b>
            <button type="button" className="sh-clear" onClick={clearAll}>
              Clear the filters
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section id={id} className="sh-wrap" aria-label="Products">
      <style>{SHOP_CSS}</style>

      {byStyle && (
        <div className="sh-stylebar">
          <button type="button" className="sh-back" onClick={() => pickStyle("")}>
            ← All styles
          </button>
          <h2>{f.style}</h2>
        </div>
      )}

      {!category && facets?.categories.length > 1 && (
        <div className="sh-cats" role="group" aria-label="Category">
          <button type="button" className={`sh-chip${!f.cat ? " on" : ""}`} onClick={() => set("cat", "")} aria-pressed={!f.cat}>
            All
          </button>
          {facets.categories.map((c) => (
            <button key={c.slug} type="button" className={`sh-chip${f.cat === c.slug ? " on" : ""}`} onClick={() => set("cat", c.slug)} aria-pressed={f.cat === c.slug}>
              {c.name} <span className="sh-count">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sh-bar">
        <input className="sh-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tees, colours, fabric…" aria-label="Search products" />
        <button type="button" className="sh-filterbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Filters{active.length ? ` · ${active.length}` : ""}
        </button>
        <div className={`sh-filters${open ? " open" : ""}`}>
          {(category || f.cat) && styles.length > 1 && (
            <select value={f.style} onChange={(e) => set("style", e.target.value)} aria-label="Style">
              <option value="">All styles</option>
              {styles.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
          {facets?.sizes.length > 0 && (
            <select value={f.size} onChange={(e) => set("size", e.target.value)} aria-label="Size">
              <option value="">Any size</option>
              {facets.sizes.map((s) => (
                <option key={s} value={s}>
                  Size {s}
                </option>
              ))}
            </select>
          )}
          {facets?.colors.length > 1 && (
            <select value={f.color} onChange={(e) => set("color", e.target.value)} aria-label="Colour">
              <option value="">Any colour</option>
              {facets.colors.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
          {prices.length > 0 && (
            <select value={f.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} aria-label="Price">
              <option value="">Any price</option>
              {prices.map((p) => (
                <option key={p} value={p}>
                  Under {money(p)}
                </option>
              ))}
            </select>
          )}
          <select value={f.sort || "newest"} onChange={(e) => set("sort", e.target.value === "newest" ? "" : e.target.value)} aria-label="Sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {facets?.colors.length > 1 && (
        <div className="sh-swatches" role="group" aria-label="Colour">
          {facets.colors.map((c) => {
            const hex = colourHex(c);
            const on = f.color.toLowerCase() === c.toLowerCase();
            return (
              <button key={c} type="button" title={c} aria-label={c} aria-pressed={on} className={`sh-dot big${on ? " on" : ""}${isLight(hex) ? " light" : ""}`} style={{ background: hex }} onClick={() => set("color", on ? "" : c)} />
            );
          })}
        </div>
      )}

      <div className="sh-meta" aria-live="polite">
        <span>{loading ? "Loading…" : `${data.total} product${data.total === 1 ? "" : "s"}`}</span>
        {active.map(([k, label]) => (
          <button key={k} type="button" className="sh-pill" onClick={() => (k === "q" ? (setSearch(""), set("q", "")) : set(k, ""))} aria-label={`Remove filter ${label}`}>
            {label} ×
          </button>
        ))}
        {active.length > 1 && (
          <button type="button" className="sh-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      {error && <p className="sh-error">{error}</p>}

      <ProductGrid list={list} from={from} />

      {!loading && data.total === 0 && (
        <div className="sh-empty">
          <b>No products match.</b>
          {active.length ? (
            <button type="button" className="sh-clear" onClick={clearAll}>
              Clear the filters
            </button>
          ) : (
            <span>New ready-made tees are coming soon.</span>
          )}
        </div>
      )}
    </section>
  );
}
