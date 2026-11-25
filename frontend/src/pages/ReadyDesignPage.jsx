// pages/ReadyDesignPage.jsx — /ready-made/design/:slug (25 Oct 2026)
//
// One IDENTEE design of Shop your IDENTEE (made with the Collection maker). It is sold print on demand: on Add to
// cart / Buy now the customer gets their own copy of the design (readyDesignService.copy), and that copy goes
// through the same cart, checkout and print sheets as a tee designed in the design room. "Customize this tee" opens
// their copy in the design room. It costs the garment's price and ships free (the client, 30 Oct 2026).
// (24 Nov 2026, the owner: "think as a user and implement proper navigation") it says where it is (Home › Shop your
// IDENTEE › Ayyappa › Oversized), ‹ › walk to the tee before / after it in the grid it was opened from (3 of 45), and
// "More from Ayyappa" under it shows the next tees — all without going back to the grid.
// (25 Nov 2026) a design made in several tees (Oversized, Round Neck Men's, Round Neck Women's) shows once in the shop;
// here the customer picks Style: Oversized / Round Neck and Men / Women, just above the sizes (design.versions).
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import readyDesignService from "../services/readyDesignService";
import customizationService from "../services/customizationService";
import { fetchCart } from "../redux/slices/cartWishlistSlice";
import PriceTag from "../components/PriceTag";
import { imageUrl } from "../utils/imageUrl";
import ShopComingSoon from "../components/ShopComingSoon";
import { useShopOpen } from "../utils/shopOpen";
import { SHOPS } from "../utils/shopNames";
import { photosFor } from "../utils/wearerFor";
import { collectionInfo, collectionLink, collectionOf } from "../utils/shopRules";
import shopService from "../services/shopService";
import { gridQuery, isOwnTee, moreFrom, neighbours, teeHref, walkList } from "../utils/shopNav";
import { Crumbs } from "../components/shop/ShopTrail";
import ProductCard from "../components/shop/ProductCard";
import { SHOP_CSS } from "../components/shop/shopStyles";
import TrendPhotoBox from "../components/shop/TrendPhotoBox";
import useTrend from "../utils/useTrend";
import "./readyDesign.css";

const SIDES = [
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left"],
  ["right", "Right"],
];
// an Oversized tee shows its front and back only, no side views (the user, 31 Oct 2026) — since 25 Nov 2026 the style's own
// setting (Admin → Shop your IDENTEE → Styles: "front-back" | "all"); an older server without it: the old rule
const frontBackOnly = (design) => (design.sides ? design.sides === "front-back" : design.style === "Oversized" || design.garmentType === "oversized-tee");
const token = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "null")?.token || null;
  } catch {
    return null;
  }
};
// the tees of one grid, in the grid's order (kept for the visit: walking ‹ › asks for them once)
const lists = new Map();
const gridTees = (query) => {
  const k = JSON.stringify(query);
  if (!lists.has(k)) {
    const load = async () => {
      const items = [];
      for (let page = 1; page <= 4; page += 1) {
        const d = await shopService.listProducts({ ...query, limit: 48, page });
        items.push(...(d.items || []));
        if (page >= (d.pages || 1)) break;
      }
      return items;
    };
    lists.set(k, load().catch((e) => {
      lists.delete(k);
      throw e;
    }));
  }
  return lists.get(k);
};
const apiError = (err) => err?.response?.data?.message || "That didn't work. Please try again.";
// a white page, as /ready-made (the site's own background is dark)
const Page = ({ children, style }) => (
  <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
    <div className="rd-page" style={style}>
      {children}
    </div>
  </div>
);

export default function ReadyDesignPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const shop = useShopOpen();
  const [design, setDesign] = useState(null);
  const [missing, setMissing] = useState(false);
  const [side, setSide] = useState(null);
  const [colourSlug, setColourSlug] = useState(null); // the colour chosen (one the tee is sold in)
  const [qtys, setQtys] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { text, bad }
  // a trend's tee ("GTA · …", 23 Nov 2026): the customer can put their own photo on the back in the trend's look
  const trend = useTrend(collectionOf(design?.name));

  useEffect(() => {
    let alive = true;
    readyDesignService
      .get(slug)
      .then((d) => {
        if (!alive) return;
        // (another tee, from ‹ › or More from: its own colour, side and message)
        setSide(null);
        setColourSlug(null);
        setMsg(null);
        setDesign(d);
        setQtys({ [d.sizes.includes("M") ? "M" : d.sizes[0]]: 1 });
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  // the grid this tee is walked through: the one it was opened from (same style, Men / Women, colour, sort …), else
  // its collection's tees of its style
  const from = location.state?.from;
  const key = collectionOf(design?.name);
  const fromGrid = gridQuery(from?.to);
  // (a tee switched to another style on its page walks that style's tees, 25 Nov 2026)
  const sameGrid = Boolean(fromGrid && key && fromGrid.collection === key && (!fromGrid.style || !design?.style || fromGrid.style === design.style));
  const query = !design || !key ? null : sameGrid ? fromGrid : { collection: key, ...(design.style ? { style: design.style } : {}) };
  const queryKey = query ? JSON.stringify(query) : "";
  const [walk, setWalk] = useState({ key: "", items: [] });
  useEffect(() => {
    if (!queryKey) return undefined;
    let alive = true;
    gridTees(JSON.parse(queryKey))
      .then((items) => alive && setWalk({ key: queryKey, items }))
      .catch(() => alive && setWalk({ key: queryKey, items: [] }));
    return () => {
      alive = false;
    };
  }, [queryKey]);

  // back to the page the tee was opened from (Men's T-shirts · Oversized), else the shop's start page; a real step
  // back when there is one, so the phone's back button and this link agree (28 Oct 2026)
  const goBack = (e) => {
    if (window.history.state?.idx > 0) {
      e.preventDefault();
      navigate(-1);
    }
  };
  const backLink = from ? (
    <Link
      className="rd-back"
      to={from.to}
      onClick={(e) => {
        if (window.history.state?.idx > 0) {
          e.preventDefault();
          navigate(-1);
        }
      }}
    >
      ← {from.label}
    </Link>
  ) : (
    <Link className="rd-back" to="/ready-made">
      ← {SHOPS.shop.name}
    </Link>
  );

  if (shop.known && !shop.open) return <ShopComingSoon />;
  if (missing) {
    return (
      <Page>
        {backLink}
        <p className="rd-msg">This design isn't in the shop any more.</p>
      </Page>
    );
  }
  if (!design) return <Page style={{ minHeight: "60vh" }} />;

  const shown = side || design.hero || "front";
  // the colours on sale (the designed one first), each with its own pictures
  const colours = design.colours?.length ? design.colours : [{ slug: design.color, name: design.colourName, hex: design.colourHex, mockups: design.mockups }];
  // ?colour=white (a home page card shows the tee in that colour) opens in it until another colour is tapped
  const askedColour = String(new URLSearchParams(location.search).get("colour") || "").toLowerCase();
  const picked = colours.find((c) => c.slug === colourSlug) || colours.find((c) => c.slug === askedColour) || colours[0];
  const mockups = picked.mockups || design.mockups;
  // the pictures: the four sides, then the photos of a person wearing it (this colour) — the person the category
  // the customer came from is for goes first (?for=man|woman from the product card)
  const photos = photosFor(picked.photos || [], new URLSearchParams(location.search).get("for"));
  const bigSrc = shown.startsWith("photo:") ? photos[Number(shown.slice(6))]?.url : mockups?.[shown];
  const chosen = Object.entries(qtys)
    .filter(([, n]) => n > 0)
    .map(([size, qty]) => ({ size, qty }));
  const pieces = chosen.reduce((n, c) => n + c.qty, 0);
  const setQty = (size, n) => setQtys((q) => ({ ...q, [size]: Math.max(0, Math.min(99, n)) }));
  const chart = (size) => design.sizeChart.find((r) => r.size === size);

  // the customer's own copy (login needed: it is kept in their account)
  const myCopy = async () => {
    if (!token()) {
      navigate("/login", { state: { from: location.pathname } });
      return null;
    }
    return readyDesignService.copy(design.slug, picked.slug);
  };
  const run = async (label, fn) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ text: apiError(err), bad: true });
    } finally {
      setBusy("");
    }
  };
  const addToCart = () =>
    run("cart", async () => {
      if (!pieces) return setMsg({ text: "Choose at least one size.", bad: true });
      const copy = await myCopy();
      if (!copy) return;
      await customizationService.addDesignToCart(copy.customizationId, chosen);
      dispatch(fetchCart(token()));
      setMsg({ text: `Added ${pieces} piece${pieces === 1 ? "" : "s"} to your cart.` });
    });
  const buyNow = () =>
    run("buy", async () => {
      if (!pieces) return setMsg({ text: "Choose at least one size.", bad: true });
      const copy = await myCopy();
      if (!copy) return;
      navigate(`/buy-now/${copy.customizationId}`, {
        state: {
          product: { _id: copy.customizationId, brandname: design.name, images: mockups?.front ? [mockups.front] : [], price: design.price, shopTee: true },
          items: chosen,
          isCustomization: true,
        },
      });
    });
  const changeIt = () =>
    run("change", async () => {
      const copy = await myCopy();
      if (copy) navigate(`/customize/${copy.garmentType}?design=${copy.customizationId}`);
    });
  // "Put my photo on it": their copy, with the trend's assistant asking for the photo (DesignRoomPage startTrend)
  const photoIt = () =>
    run("photo", async () => {
      const copy = await myCopy();
      if (copy) navigate(`/customize/${copy.garmentType}?design=${copy.customizationId}`, { state: { trend: { key: trend.key, name: trend.name, colours: trend.colours || [] } } });
    });
  const ownTee = isOwnTee(design);
  // its other versions (the server's design.versions): another style, or Men / Women of this style. Picking one opens
  // that tee in this page's place (Back still goes to the grid), in the same colour when it has it.
  const versions = design.versions || [];
  const styleList = [...new Set(versions.map((v) => v.style))];
  const fits = versions.filter((v) => v.style === design.style && v.gender !== "Unisex");
  const mine = versions.find((v) => v.slug === design.slug);
  // (the Men / Women the customer chose rides along in the page's state too, so ‹ › through a Men's-only tee keep it)
  const askedFor = location.state?.fit || new URLSearchParams(location.search).get("for");
  // (a tee with a Men / Women choice says which one this is; a Men's-only or Unisex tee keeps the one asked for)
  const wantedFor = fits.length > 1 && mine?.gender === "Men" ? "man" : fits.length > 1 && mine?.gender === "Women" ? "woman" : askedFor === "man" || askedFor === "woman" ? askedFor : null;
  const openVersion = (v) => {
    if (!v || v.slug === design.slug) return;
    const q = new URLSearchParams();
    // (Men / Women goes along to an Oversized tee too, so coming back to Round Neck opens the one they chose)
    const who = v.gender === "Men" ? "man" : v.gender === "Women" ? "woman" : wantedFor;
    if (who) q.set("for", who);
    q.set("colour", picked.slug);
    navigate(`/ready-made/design/${v.slug}?${q}`, { replace: true, state: { ...location.state, fit: who || undefined } });
  };
  // another style: the same Men / Women when it has it, else Men's, else its first
  const toStyle = (st) => {
    const all = versions.filter((v) => v.style === st);
    const want = wantedFor === "woman" ? "Women" : wantedFor === "man" ? "Men" : null;
    openVersion(all.find((v) => v.gender === want) || all.find((v) => v.gender === "Men") || all[0]);
  };

  // where it is: Home › Shop your IDENTEE › Ayyappa › Oversized › the tee — the step it was opened from goes back
  // there (same filters, same place on the page)
  // (a collection made in Add a tee, not in the built-in list: its own name, "TESTSHOP" not "testshop" — 25 Nov 2026)
  const info = collectionInfo(key, String(design.name || "").split(" · ")[0].trim());
  const fromIsHere = sameGrid;
  const crumbs = [
    { label: "Home", to: "/", wide: true },
    { label: SHOPS.shop.name, to: "/ready-made", wide: true },
    ...(key ? [{ label: info.name, ...(fromIsHere && !fromGrid.style ? { to: from.to, onClick: goBack } : { to: collectionLink(key) }) }] : []),
    ...(key && design.style
      ? [{ label: design.style, ...(fromIsHere && fromGrid.style ? { to: from.to, onClick: goBack } : { to: `${collectionLink(key)}?style=${encodeURIComponent(design.style)}` }) }]
      : []),
    // (the phone leaves the tee's name out here: it is the big heading just under)
    { label: key ? String(design.name || "").replace(/^[^·]*·\s*/, "") : design.name, wide: Boolean(key) },
  ];
  // ‹ 3 of 45 › and More from: the grid's tees (a Men's + Women's pair is one, as on the grid). Walking takes this
  // page's place in the history, so Back (and the step above) still go to the grid.
  const cards = walk.key === queryKey ? walkList(walk.items, { keepOwn: ownTee }) : [];
  const near = neighbours(cards, design.slug || slug);
  const more = moreFrom(cards, design.slug || slug, 8);
  // (a Men's + Women's card: ‹ › keep to the half the customer is looking at)
  const halfOf = (c) => c.pair?.find((h) => (wantedFor === "woman" ? h.gender === "Women" : wantedFor === "man" ? h.gender === "Men" : false))?.p || c;
  const hrefOf = (c) => teeHref(halfOf(c), halfOf(c).colors?.find((x) => x._id === halfOf(c)._id));
  const walkState = from || wantedFor ? { ...(from ? { from } : {}), ...(wantedFor ? { fit: wantedFor } : {}) } : undefined;
  const nameOf = (c) => String(c.brandname || "").replace(/^[^·]*·\s*/, "");

  return (
    <Page>
      <div className="rd-top">
        <Crumbs items={crumbs} />
        {near.prev && (
          <div className="rd-walk" role="group" aria-label="Other tees">
            <Link className="rd-walk-btn" to={hrefOf(near.prev)} state={walkState} replace title={nameOf(near.prev)} aria-label={`Previous tee: ${nameOf(near.prev)}`}>
              <span aria-hidden="true">‹</span> <em>Previous</em>
            </Link>
            <span className="rd-walk-count">
              {near.index + 1} of {near.total}
            </span>
            <Link className="rd-walk-btn" to={hrefOf(near.next)} state={walkState} replace title={nameOf(near.next)} aria-label={`Next tee: ${nameOf(near.next)}`}>
              <em>Next</em> <span aria-hidden="true">›</span>
            </Link>
          </div>
        )}
      </div>
      {from && !fromIsHere && backLink}
      <div className="rd-main">
        <div>
          <div className="rd-gallery-big">{bigSrc && <img src={imageUrl(bigSrc, 1000)} alt={`${design.name}, ${shown.startsWith("photo:") ? "worn" : shown}, ${picked.name}`} />}</div>
          <div className="rd-thumbs">
            {SIDES.filter(([k]) => mockups?.[k] && (!frontBackOnly(design) || k === "front" || k === "back")).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={shown === k} aria-label={`Show the ${label.toLowerCase()}`} onClick={() => setSide(k)}>
                <img src={imageUrl(mockups[k], 240)} alt="" />
              </button>
            ))}
            {photos.map((p, i) => (
              <button key={p.url} type="button" aria-pressed={shown === `photo:${i}`} aria-label={`Show it worn, ${p.side}`} onClick={() => setSide(`photo:${i}`)}>
                <img src={imageUrl(p.url, 240)} alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="rd-info">
          <h1>{design.name}</h1>
          {design.blurb && <p className="rd-blurb">{design.blurb}</p>}
          {/* ("Make your own": the photo is the point of this tee — its box comes first) */}
          {ownTee && <TrendPhotoBox trend={trend} own onGo={photoIt} busy={busy === "photo"} addOn={design.pictureAddOn} />}
          <p className="rd-note" style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="rd-dot" style={{ background: picked.hex }} />
            {design.garmentLabel} · {picked.name}
          </p>
          {colours.length > 1 && (
            <div className="rd-colours" role="radiogroup" aria-label="Colour">
              {colours.map((c) => (
                <button key={c.slug} type="button" role="radio" aria-checked={c.slug === picked.slug} title={c.name} aria-label={c.name} className={`rd-colour${c.slug === picked.slug ? " on" : ""}`} style={{ background: c.hex }} onClick={() => { setColourSlug(c.slug); if (String(side || "").startsWith("photo:")) setSide(null); }} />
              ))}
              <span className="rd-note" style={{ margin: 0 }}>{picked.name}</span>
            </div>
          )}
          <PriceTag price={design.price} was={design.comparePrice} offer size={22} />
          {styleList.length > 1 && (
            <div className="rd-pick" role="radiogroup" aria-label="Style">
              <span className="rd-pick-label">Style</span>
              {styleList.map((st) => (
                <button key={st} type="button" role="radio" aria-checked={st === design.style} className={`rd-pick-btn${st === design.style ? " on" : ""}`} onClick={() => toStyle(st)}>
                  {st}
                </button>
              ))}
            </div>
          )}
          {fits.length > 1 && (
            <div className="rd-pick" role="radiogroup" aria-label="Men or women">
              <span className="rd-pick-label">Fit</span>
              {fits.map((v) => (
                <button key={v.slug} type="button" role="radio" aria-checked={v.slug === design.slug} className={`rd-pick-btn${v.slug === design.slug ? " on" : ""}`} onClick={() => openVersion(v)}>
                  {v.gender}
                </button>
              ))}
            </div>
          )}
          {styleList.length > 1 && fits.length < 2 && mine?.gender === "Unisex" && <p className="rd-note" style={{ margin: "-2px 0 8px" }}>Unisex · made to fit men and women</p>}
          <div className="rd-sizes" role="group" aria-label="Sizes and quantities">
            {design.sizes.map((size) => {
              const row = chart(size);
              const n = qtys[size] || 0;
              return (
                <div key={size} className="rd-size" data-on={n > 0}>
                  <b>{size}</b>
                  <small>{row ? `chest ${row.chest}″ · length ${row.length}″` : ""}</small>
                  <span className="rd-qty">
                    <button type="button" aria-label={`One less ${size}`} onClick={() => setQty(size, n - 1)} disabled={!n}>
                      −
                    </button>
                    <span>{n}</span>
                    <button type="button" aria-label={`One more ${size}`} onClick={() => setQty(size, n + 1)}>
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="rd-note">Free shipping</p>
          <div className="rd-actions">
            <button type="button" className="rd-btn rd-btn-dark" onClick={addToCart} disabled={!!busy}>
              {busy === "cart" ? "Adding…" : "Add to cart"}
            </button>
            <button type="button" className="rd-btn rd-btn-gold" onClick={buyNow} disabled={!!busy}>
              {busy === "buy" ? "One moment…" : `Buy now${pieces ? ` · ${pieces} pc` : ""}`}
            </button>
          </div>
          {msg && (
            <p className={`rd-msg${msg.bad ? " rd-msg-bad" : ""}`}>
              {msg.text} {!msg.bad && <Link to="/cart">See your cart →</Link>}
            </p>
          )}
          {/* (23 Nov 2026) a GTA tee: their own photo on the back, in the GTA look */}
          {!ownTee && <TrendPhotoBox trend={trend} onGo={photoIt} busy={busy === "photo"} addOn={design.pictureAddOn} />}
          {/* the client, 30 Oct 2026: the customer should know they can make this tee their own */}
          <div className="rd-customize">
            <b>✎ Make it yours</b>
            <span>
              Change the words, add your name or a photo, or move the picture. You get your own copy, at the same price
              {design.pictureAddOn > 0 ? ` (a picture of your own adds ₹${design.pictureAddOn})` : ""}.
            </span>
            <button type="button" className="rd-btn" onClick={changeIt} disabled={!!busy}>
              {busy === "change" ? "Opening…" : "Customize this tee"}
            </button>
          </div>
          {design.description && design.description !== design.blurb && <p className="rd-desc">{design.description}</p>}
          {(design.fabric || design.washCare?.length > 0) && (
            <p className="rd-note">
              {[design.style, design.fabric, ...(design.washCare || [])].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="rd-note">
            Printed for you after you order, every size at its own true print size. Customize this tee opens your own copy in the
            design room; the original stays as it is.
          </p>
        </div>
      </div>
      {more.length > 0 && (
        <section className="rd-more sh-wrap" aria-label={`More from ${info.name}`}>
          <style>{SHOP_CSS}</style>
          <div className="rd-more-head">
            <h2>More from {info.name}</h2>
            <Link to={fromIsHere ? from.to : collectionLink(key)} onClick={fromIsHere ? goBack : undefined}>
              See them all →
            </Link>
          </div>
          <div className="sh-grid">
            {more.map((p) => (
              <ProductCard key={p.groupId || p.key} p={p} from={from} replace />
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
