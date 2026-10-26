// pages/ReadyDesignPage.jsx — /ready-made/design/:slug (25 Oct 2026)
//
// One IDENTEE design of Shop your IDENTEE (made with the Collection maker). It is sold print on demand: on Add to
// cart / Buy now the customer gets their own copy of the design (readyDesignService.copy), and that copy goes
// through the same cart, checkout and print sheets as a tee designed in the design room. "Change it" opens their
// copy in the design room.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDispatch } from "react-redux";
import readyDesignService from "../services/readyDesignService";
import customizationService from "../services/customizationService";
import { fetchCart } from "../redux/slices/cartWishlistSlice";
import PriceTag from "../components/PriceTag";
import { imageUrl } from "../utils/imageUrl";
import ShopComingSoon from "../components/ShopComingSoon";
import { shippingNote, useShippingRule } from "../utils/sitePricing";
import { useShopOpen } from "../utils/shopOpen";
import { SHOPS } from "../utils/shopNames";
import "./readyDesign.css";

const SIDES = [
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left"],
  ["right", "Right"],
];
const token = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "null")?.token || null;
  } catch {
    return null;
  }
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
  const shipRule = useShippingRule();
  const [design, setDesign] = useState(null);
  const [missing, setMissing] = useState(false);
  const [side, setSide] = useState(null);
  const [colourSlug, setColourSlug] = useState(null); // the colour chosen (one the tee is sold in)
  const [qtys, setQtys] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { text, bad }

  useEffect(() => {
    let alive = true;
    readyDesignService
      .get(slug)
      .then((d) => {
        if (!alive) return;
        setDesign(d);
        setQtys({ [d.sizes.includes("M") ? "M" : d.sizes[0]]: 1 });
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (shop.known && !shop.open) return <ShopComingSoon />;
  if (missing) {
    return (
      <Page>
        <Link className="rd-back" to="/ready-made">
          ← {SHOPS.shop.name}
        </Link>
        <p className="rd-msg">This design isn't in the shop any more.</p>
      </Page>
    );
  }
  if (!design) return <Page style={{ minHeight: "60vh" }} />;

  const shown = side || design.hero || "front";
  // the colours on sale (the designed one first), each with its own pictures
  const colours = design.colours?.length ? design.colours : [{ slug: design.color, name: design.colourName, hex: design.colourHex, mockups: design.mockups }];
  const picked = colours.find((c) => c.slug === colourSlug) || colours[0];
  const mockups = picked.mockups || design.mockups;
  // the pictures: the four sides, then the photos of a person wearing it (this colour)
  const photos = picked.photos || [];
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
          product: { _id: copy.customizationId, brandname: design.name, images: mockups?.front ? [mockups.front] : [], price: design.price },
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

  return (
    <Page>
      <Link className="rd-back" to="/ready-made">
        ← {SHOPS.shop.name}
      </Link>
      <div className="rd-main">
        <div>
          <div className="rd-gallery-big">{bigSrc && <img src={imageUrl(bigSrc, 1000)} alt={`${design.name}, ${shown.startsWith("photo:") ? "worn" : shown}, ${picked.name}`} />}</div>
          <div className="rd-thumbs">
            {SIDES.filter(([k]) => mockups?.[k]).map(([k, label]) => (
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
          {pieces > 0 && <p className="rd-note">{shippingNote(shipRule, pieces)}</p>}
          <div className="rd-actions">
            <button type="button" className="rd-btn rd-btn-dark" onClick={addToCart} disabled={!!busy}>
              {busy === "cart" ? "Adding…" : "Add to cart"}
            </button>
            <button type="button" className="rd-btn rd-btn-gold" onClick={buyNow} disabled={!!busy}>
              {busy === "buy" ? "One moment…" : `Buy now${pieces ? ` · ${pieces} pc` : ""}`}
            </button>
            {/* the customer's own copy opens in the design room: change the words, move a picture, add their name… */}
            <button type="button" className="rd-btn" onClick={changeIt} disabled={!!busy}>
              {busy === "change" ? "Opening…" : "Edit this design"}
            </button>
          </div>
          {msg && (
            <p className={`rd-msg${msg.bad ? " rd-msg-bad" : ""}`}>
              {msg.text} {!msg.bad && <Link to="/cart">See your cart →</Link>}
            </p>
          )}
          {design.description && design.description !== design.blurb && <p className="rd-desc">{design.description}</p>}
          {(design.fabric || design.washCare?.length > 0) && (
            <p className="rd-note">
              {[design.style, design.fabric, ...(design.washCare || [])].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="rd-note">
            Printed for you after you order — every size at its own true print size. Edit this design opens your own copy in the design
            room: change the words, move a picture, add your name — the original stays as it is.
          </p>
        </div>
      </div>
    </Page>
  );
}
