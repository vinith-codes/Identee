// components/shop/ShopGrid.jsx
//
// The ready-made product grid with its filters — used on /ready-made (all
// categories) and on each category page (category fixed). Filters live in
// the address (?size=M&color=Black&maxPrice=999&sort=price_asc&q=…), so a
// filtered page can be shared or reloaded. A category with more than one
// style (Men's: Oversized + Round Neck) first shows a card per style; a card
// opens that style's tees (the client, 28 Oct 2026). A collection (SCENE Movie
// Products, 30 Oct 2026) works the same, with Unisex / Men / Women to filter by. A design sold
// for men and for women is one card with Men / Women buttons (31 Oct 2026).
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import shopService from "../../services/shopService";
import { colourHex, isLight } from "../../utils/colours";
import { imageUrl } from "../../utils/imageUrl";
import ProductCard from "./ProductCard";
import { money } from "../../utils/money";
import { pairMenWomen } from "../../utils/shopPairs";
import { SHOP_CSS } from "./shopStyles";

const SORTS = [
  ["newest", "Newest"],
  ["popular", "Popular"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["discount", "Biggest discount"],
];
const PRICE_STEPS = [499, 799, 999, 1499, 1999, 2999];
// was 12, then 24; with Men's + Women's pairs on one card, a pair split over two pages counted twice (Round Neck said 28
// products for 20 designs once the 10 new designs came as Round Neck too, 31 Oct 2026). 48 is the most the API sends.
const PAGE_SIZE = 48;
const KEYS = ["cat", "style", "gender", "size", "color", "maxPrice", "q", "sort"];

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

// a collection's "Make your own" tee (GTA · Make your own): the plain tee a customer puts their own photo on
const isOwnTee = (p) => /·\s*make your own\s*$/i.test(p.brandname || "");

function ProductGrid({ list, skeletons = 8, from = null, hideOwn = false }) {
  const { data, loading, more, loadMore } = list;
  // a design sold as Men's and as Women's is one card with Men / Women on it (utils/shopPairs.js)
  const cards = useMemo(() => pairMenWomen(hideOwn ? data.items.filter((p) => !isOwnTee(p)) : data.items), [data.items, hideOwn]);
  return (
    <>
      <div className={`sh-grid${loading ? " is-loading" : ""}`}>
        {loading && !data.items.length
          ? Array.from({ length: skeletons }).map((_, i) => <div key={i} className="sh-skel" />)
          : cards.map((p) => <ProductCard key={p.groupId} p={p} from={from} />)}
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

// who a style's tees are for, from its Unisex / Men / Women counts: "Unisex", "Men & Women", "Unisex · Men · Women"
const forWhom = (genders = []) => genders.map((g) => g.name).join(genders.length === 2 && !genders.some((g) => g.name === "Unisex") ? " & " : " · ");

// one style's card on a category page: its newest tee's photo and how many tees; left out when it has none
function StyleCard({ style, query, onOpen }) {
  // up to 48, so a Men's + Women's pair counts once, as on the grid it opens
  const { data, loading } = useProductPages({ ...query, style, limit: 48 });
  if (loading) return <div className="sh-skel sh-style-skel" />;
  if (!data.total) return null;
  // (a collection's "Make your own" tee comes first but is the plain one: a designed tee's picture shows the style better)
  const photo = (data.items.find((p) => !isOwnTee(p)) || data.items[0])?.images?.[0];
  const who = forWhom(data.facets?.genders);
  const total = data.total - (data.items.length - pairMenWomen(data.items).length);
  return (
    <button type="button" className="sh-style-card" onClick={() => onOpen(style)} aria-label={`${style}: ${total} tees${who ? `, ${who}` : ""}`}>
      {photo && <img src={imageUrl(photo, 600)} alt="" loading="lazy" />}
      <span className="sh-style-text">
        <b>{style}</b>
        <span>
          {total} product{total === 1 ? "" : "s"}
          {who ? ` · ${who}` : ""}
        </span>
        <span className="sh-style-go">Shop now →</span>
      </span>
    </button>
  );
}

/**
 * defaultStyle + hideOwn (a trend's collection, GTA, 24 Nov 2026 — the owner: "the ready designs are not seen big"):
 * the designs show straight away, starting with defaultStyle, with a tab per style instead of a card per style; the
 * "Make your own" tees stay out of this grid (the banner above it is for them); every page is loaded so the count is
 * right (a Men's + Women's pair split over two pages counted twice).
 *
 * allTab (a collection's page, 24 Nov 2026 — the owner: "think as a user and implement proper navigation"): no card per
 * style to tap through first; the tees show straight away with All · Oversized · Round Neck tabs over them.
 */
export default function ShopGrid({ category = null, collection = null, collectionName = "", id = "shop", defaultStyle = "", hideOwn = false, heading = null, allTab = false }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ""]));
  const [search, setSearch] = useState(f.q);
  const [open, setOpen] = useState(false); // filters drawer on phones

  const query = useMemo(
    () => ({
      category: category || f.cat || undefined,
      collection: collection || undefined,
      style: f.style || defaultStyle || undefined,
      gender: f.gender || undefined,
      size: f.size || undefined,
      color: f.color || undefined,
      maxPrice: f.maxPrice || undefined,
      q: f.q || undefined,
      sort: f.sort || undefined,
      limit: PAGE_SIZE,
    }),
    [category, collection, defaultStyle, f.cat, f.style, f.gender, f.size, f.color, f.maxPrice, f.q, f.sort],
  );
  const list = useProductPages(query);
  const { data, loading, error } = list;
  const style = f.style || defaultStyle;
  const tabs = Boolean(defaultStyle) || allTab;
  // a Men's + Women's pair is one card, so it counts once (and the "Make your own" tees left out are not counted)
  const ownShown = hideOwn ? data.items.filter(isOwnTee).length : 0;
  const shownTotal = data.total - ownShown - (data.items.length - ownShown - pairMenWomen(hideOwn ? data.items.filter((p) => !isOwnTee(p)) : data.items).length);
  // tabs: load every page (54 Round Neck tees = 27 Men's + Women's pairs, more than one page of 48)
  useEffect(() => {
    if (defaultStyle && !loading && !list.more && data.page > 0 && data.page < data.pages) list.loadMore();
  }, [defaultStyle, loading, list, data.page, data.pages]);

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
    next.delete("gender"); // Men / Women is chosen inside a style
    setParams(next, { preventScrollReset: true });
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  // a tab (defaultStyle) — Men / Women is chosen inside a style, so it starts again
  function pickTab(s) {
    const next = new URLSearchParams(params);
    if (s && s !== defaultStyle) next.set("style", s);
    else next.delete("style");
    next.delete("gender");
    setParams(next, { replace: true, preventScrollReset: true });
    setTimeout(() => document.getElementById("designs")?.scrollIntoView({ block: "start" }), 60); // stay at the designs
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
    f.style && !tabs && ["style", f.style],
    f.gender && ["gender", f.gender.charAt(0).toUpperCase() + f.gender.slice(1)],
    f.size && ["size", `Size ${f.size}`],
    f.color && ["color", f.color],
    f.maxPrice && ["maxPrice", `Under ${money(f.maxPrice)}`],
    f.q && ["q", `“${f.q}”`],
  ].filter(Boolean);
  const prices = PRICE_STEPS.filter((p) => !facets || p > facets.priceMin);
  const styles = facets?.styles || [];
  // one category (or collection) with several styles: a card per style until one is chosen
  const oneCategory = Boolean(category || f.cat || collection);
  const byStyle = oneCategory && styles.length > 1;
  // where a product card was opened from, for the product page's back link ("SCENE Movie Products · Oversized")
  const catName = collectionName || (oneCategory ? oneCategoryName(data.items[0]?.category?.name) : "");
  const from = { to: location.pathname + location.search, label: [catName || "Shop your IDENTEE", style].filter(Boolean).join(" · ") };
  // Unisex / Men / Women (only when the tees shown are for more than one of them)
  const genders = facets?.genders || [];

  if (byStyle && !style && !allTab) {
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

      {heading}

      {byStyle && tabs && (
        <div className={allTab ? "sh-styletabs" : "sh-cats sh-tabs"} role="group" aria-label="Style">
          {(allTab ? ["", ...styles] : styles).map((s) => (
            <button key={s || "all"} type="button" className={`${allTab ? "" : "sh-chip"}${s === style ? " on" : ""}`} onClick={() => pickTab(s)} aria-pressed={s === style}>
              {s || (allTab ? "All styles" : "All")}
            </button>
          ))}
        </div>
      )}

      {byStyle && !tabs && (
        <div className="sh-stylebar">
          <button type="button" className="sh-back" onClick={() => pickStyle("")}>
            ← All styles
          </button>
          <h2>{f.style}</h2>
        </div>
      )}

      {genders.length > 1 && (
        <div className="sh-cats" role="group" aria-label="Who it is for">
          <button type="button" className={`sh-chip${!f.gender ? " on" : ""}`} onClick={() => set("gender", "")} aria-pressed={!f.gender}>
            All
          </button>
          {genders.map((g) => {
            const on = f.gender.toLowerCase() === g.name.toLowerCase();
            return (
              <button key={g.name} type="button" className={`sh-chip${on ? " on" : ""}`} onClick={() => set("gender", on ? "" : g.name.toLowerCase())} aria-pressed={on}>
                {g.name} {!hideOwn && <span className="sh-count">{g.count}</span>}
              </button>
            );
          })}
        </div>
      )}
      {genders.length === 1 && genders[0].name === "Unisex" && byStyle && <p className="sh-for">Unisex · made to fit men and women</p>}

      {!category && !collection && facets?.categories.length > 1 && (
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
        <span>{loading ? "Loading…" : `${shownTotal} product${shownTotal === 1 ? "" : "s"}`}</span>
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

      <ProductGrid list={list} from={from} hideOwn={hideOwn} />

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
