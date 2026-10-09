// pages/SingleProductPage.jsx  —  /product/:id  (a ready-made product, one colour)
//
// Photo gallery (swipe on phones, tap for full screen), price, colours,
// sizes from the product's own stock ("Only 2 left", out-of-stock crossed
// out), size chart, quantity, Add to cart / Buy now, favourite, details
// (description, fabric & care, delivery & help, product details), reviews
// and "You may also like". Hidden products show "no longer available".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import ProductReviews from "../components/ProductReviews";
import ProductCard from "../components/shop/ProductCard";
import { SHOP_CSS } from "../components/shop/shopStyles";
import { money } from "../utils/money";
import shopService from "../services/shopService";
import { fetchCart } from "../redux/slices/cartWishlistSlice";
import { imageUrl } from "../utils/imageUrl";
import { colourHex, isLight } from "../utils/colours";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const LOW_LEFT = 5; // "Only N left" at or below this
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL", "FREE SIZE"];
const sizeRank = (s) => {
  const kids = /^(\d+)(?:\s*-\s*\d+)?\s*(?:y|yrs?|years)?$/i.exec(String(s));
  if (kids) return -100 + Number(kids[1]);
  const i = SIZE_ORDER.indexOf(String(s).toUpperCase());
  return i === -1 ? 100 : i;
};
const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

export default function SingleProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const token = user?.token;

  const [data, setData] = useState({ id: null, product: null, variants: [], error: null });
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [viewer, setViewer] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text, cart }
  const [busy, setBusy] = useState(false);
  const [fav, setFav] = useState(false);
  const [settings, setSettings] = useState({});
  const [related, setRelated] = useState([]);

  // the product (+ its colours); switching colour keeps the group loaded
  useEffect(() => {
    let alive = true;
    const known = data.variants.some((v) => v._id === id);
    if (known) return;
    shopService
      .getProduct(id)
      .then((d) => alive && setData({ id, product: d.product, variants: d.variants || [], error: null }))
      .catch((err) => alive && setData({ id, product: null, variants: [], error: err.response?.status === 404 ? "notfound" : "error" }));
    return () => {
      alive = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded = data.product && (data.id === id || data.variants.some((v) => v._id === id));
  const product = data.product;
  const variants = useMemo(
    () => [...(data.variants.length ? data.variants : product ? [product] : [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [data.variants, product],
  );
  const v = variants.find((x) => x._id === id) || product;
  const hidden = !!product?.isHidden && !variants.some((x) => x._id === id && !x.isHidden);

  // reset choices when the colour changes
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    setSize(null);
    setQty(1);
    setPhoto(0);
    setMsg(null);
  }

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/settings/public`).then((r) => setSettings(r.data || {})).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token || !v?._id) return;
    axios
      .get(`${BACKEND_URL}/api/users/getfavorites`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setFav(Array.isArray(r.data) && r.data.some((f) => f._id === v._id)))
      .catch(() => {});
  }, [token, v?._id]);

  // "You may also like": same category first
  const groupId = v?.productGroupId;
  const style = v?.productdetails?.garmentStyle;
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    shopService
      .listProducts({ limit: 8, exclude: groupId, sort: "popular" })
      .then((d) => {
        if (!alive) return;
        const same = d.items.filter((p) => p.garmentStyle === style);
        const rest = d.items.filter((p) => p.garmentStyle !== style);
        setRelated([...same, ...rest].slice(0, 4));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [groupId, style]);

  const sizes = useMemo(() => {
    const stock = v?.productdetails?.stockBySize || [];
    const list = v?.productdetails?.sizes?.length ? v.productdetails.sizes : stock.map((s) => s.size);
    return [...new Set(list)]
      .map((s) => ({ size: s, stock: stock.find((x) => x.size === s)?.stock ?? 0 }))
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  }, [v]);
  const chosen = sizes.find((s) => s.size === size);
  const anyStock = sizes.some((s) => s.stock > 0);

  const goLogin = useCallback(() => navigate("/login", { state: { from: location.pathname } }), [navigate, location.pathname]);

  const addToCart = async () => {
    if (!size) return setMsg({ text: "Choose a size first." });
    if (!token) return goLogin();
    setBusy(true);
    setMsg(null);
    try {
      await axios.post(`${BACKEND_URL}/api/products/${v._id}/addtocart`, { qty, size, action: "add" }, { headers: { Authorization: `Bearer ${token}` } });
      dispatch(fetchCart(token));
      setMsg({ ok: true, cart: true, text: `Added ${qty} × size ${size} to your cart.` });
    } catch (err) {
      setMsg({ text: err.response?.data?.message || "Couldn't add it to your cart. Please try again." });
    } finally {
      setBusy(false);
    }
  };
  const buyNow = () => {
    if (!size) return setMsg({ text: "Choose a size first." });
    if (!token) return goLogin();
    navigate(`/buy-now/${v._id}`, { state: { product: v, items: [{ size, qty }] } });
  };
  const toggleFav = async () => {
    if (!token) return goLogin();
    try {
      await axios.post(`${BACKEND_URL}/api/users/favorites/${v._id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setFav((f) => !f);
    } catch {
      setMsg({ text: "Couldn't update your favourites." });
    }
  };

  if (data.error && data.id === id) {
    return (
      <Shell>
        <Unavailable title={data.error === "notfound" ? "We couldn't find this product" : "Something went wrong"} text={data.error === "notfound" ? "It may have been removed." : "Please reload the page."} />
      </Shell>
    );
  }
  if (!loaded || !v) {
    return (
      <Shell>
        <div className="pp-grid" aria-busy="true">
          <div className="pp-skel" style={{ aspectRatio: "4 / 5" }} />
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <div className="pp-skel" style={{ height: 34, width: "70%" }} />
            <div className="pp-skel" style={{ height: 26, width: "40%" }} />
            <div className="pp-skel" style={{ height: 120 }} />
          </div>
        </div>
      </Shell>
    );
  }
  if (hidden) {
    return (
      <Shell>
        <Unavailable title={`${v.brandname} is no longer available`} text="It's been taken out of the shop. Have a look at what's there now." />
      </Shell>
    );
  }

  const images = v.images?.length ? v.images : [];
  const price = v.subscriptionPrice && v.subscriptionPrice < v.price ? v.subscriptionPrice : v.price;
  const off = v.oldPrice > price ? Math.round(((v.oldPrice - price) / v.oldPrice) * 100) : 0;
  const pd = v.productdetails || {};
  const whatsapp = settings["general.whatsappNumber"];
  const email = settings["general.storeEmail"];
  const maxQty = Math.min(chosen?.stock || 1, 10);

  return (
    <Shell>
      <nav className="pp-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <Link to="/ready-made">Ready-made</Link>
        {style && (
          <>
            {" "}
            / <Link to={`/category/${encodeURIComponent(style)}`}>{style}</Link>
          </>
        )}
      </nav>

      <div className="pp-grid">
        {/* ---------- photos ---------- */}
        <Gallery images={images} index={photo} setIndex={setPhoto} name={v.brandname} onOpen={() => images.length && setViewer(true)} />

        {/* ---------- details ---------- */}
        <div className="pp-info">
          <h1 className="pp-title">{v.brandname}</h1>
          <p className="pp-sub">{[style, pd.fabric, pd.gender && pd.gender !== "Unisex" ? `For ${pd.gender.toLowerCase()}` : null].filter(Boolean).join(" · ")}</p>
          {v.numReviews > 0 && (
            <a href="#reviews" className="pp-rating">
              <span aria-hidden="true">{"★".repeat(Math.round(v.rating))}{"☆".repeat(5 - Math.round(v.rating))}</span> {Number(v.rating).toFixed(1)} · {v.numReviews} review{v.numReviews === 1 ? "" : "s"}
            </a>
          )}

          <p className="pp-price">
            <b>{money(price)}</b>
            {v.oldPrice > price && <s>MRP {money(v.oldPrice)}</s>}
            {off > 0 && <span className="pp-off">{off}% off</span>}
          </p>
          {price < v.price && <p className="pp-member">Your member price (regular {money(v.price)})</p>}
          <p className="pp-tax">Inclusive of all taxes</p>

          {variants.length > 1 && (
            <div className="pp-block">
              <p className="pp-label">
                Colour: <b>{titleCase(pd.color)}</b>
              </p>
              <div className="pp-colours">
                {variants.map((c) => {
                  const on = c._id === v._id;
                  const hex = colourHex(c.productdetails?.color);
                  return (
                    <Link
                      key={c._id}
                      to={`/product/${c._id}`}
                      replace
                      className={`pp-colour${on ? " on" : ""}`}
                      aria-current={on ? "true" : undefined}
                      title={titleCase(c.productdetails?.color)}
                    >
                      {c.images?.[0] ? <img src={imageUrl(c.images[0], 160)} alt="" /> : <span className={`pp-swatch${isLight(hex) ? " light" : ""}`} style={{ background: hex }} />}
                      <span>{titleCase(c.productdetails?.color)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pp-block">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <p className="pp-label">{size ? <>Size: <b>{size}</b></> : "Choose your size"}</p>
              {v.sizeChart && (
                <a className="pp-link" href={imageUrl(v.sizeChart)} target="_blank" rel="noreferrer">
                  Size chart
                </a>
              )}
            </div>
            {sizes.length ? (
              <div className="pp-sizes" role="radiogroup" aria-label="Size">
                {sizes.map((s) => (
                  <button
                    key={s.size}
                    type="button"
                    role="radio"
                    aria-checked={size === s.size}
                    disabled={s.stock <= 0}
                    className={`pp-size${size === s.size ? " on" : ""}`}
                    onClick={() => {
                      setSize(s.size);
                      setQty(1);
                      setMsg(null);
                    }}
                    title={s.stock <= 0 ? "Out of stock" : undefined}
                  >
                    {s.size}
                  </button>
                ))}
              </div>
            ) : (
              <p className="pp-note">Sizes coming soon.</p>
            )}
            {chosen && chosen.stock <= LOW_LEFT && <p className="pp-hurry">Only {chosen.stock} left in size {chosen.size}</p>}
            {!anyStock && <p className="pp-hurry">Out of stock in this colour{variants.length > 1 ? " — try another colour" : ""}.</p>}
          </div>

          <div className="pp-buy">
            <div className="pp-qty" aria-label="Quantity">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One less">
                −
              </button>
              <output aria-live="polite">{qty}</output>
              <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={!size || qty >= maxQty} aria-label="One more">
                +
              </button>
            </div>
            <button type="button" className="pp-btn dark" onClick={addToCart} disabled={busy || !anyStock}>
              {busy ? "Adding…" : "Add to cart"}
            </button>
            <button type="button" className={`pp-fav${fav ? " on" : ""}`} onClick={toggleFav} aria-pressed={fav} aria-label={fav ? "Remove from favourites" : "Add to favourites"} title={fav ? "In your favourites" : "Add to favourites"}>
              {fav ? "♥" : "♡"}
            </button>
          </div>
          <button type="button" className="pp-btn gold wide" onClick={buyNow} disabled={!anyStock}>
            Buy now{size ? ` · ${money(price * qty)}` : ""}
          </button>
          {msg && (
            <p className={`pp-msg${msg.ok ? " ok" : ""}`} role="status">
              {msg.text}
              {msg.cart && (
                <>
                  {" "}
                  <Link to="/cart">View cart →</Link>
                </>
              )}
            </p>
          )}

          <ul className="pp-promises">
            <li>🚚 Delivery charges are shown at checkout</li>
            <li>💳 Pay online or cash on delivery</li>
            {whatsapp && <li>💬 Questions? WhatsApp {whatsapp}</li>}
          </ul>

          <div className="pp-acc">
            <details open>
              <summary>Description</summary>
              <p style={{ whiteSpace: "pre-line" }}>{v.description}</p>
            </details>
            {(pd.fabric || v.washCare?.length > 0) && (
              <details>
                <summary>Fabric &amp; care</summary>
                {pd.fabric && (
                  <p>
                    <b>Fabric:</b> {pd.fabric}
                  </p>
                )}
                {v.washCare?.length > 0 && (
                  <ul>
                    {v.washCare.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </details>
            )}
            <details>
              <summary>Product details</summary>
              <dl className="pp-dl">
                {style && (
                  <>
                    <dt>Style</dt>
                    <dd>{style}</dd>
                  </>
                )}
                {pd.gender && (
                  <>
                    <dt>For</dt>
                    <dd>{pd.gender}</dd>
                  </>
                )}
                {pd.type && (
                  <>
                    <dt>Occasion</dt>
                    <dd>{pd.type}</dd>
                  </>
                )}
                {v.productType === "combo" && v.comboName && (
                  <>
                    <dt>Pack</dt>
                    <dd>{v.comboName}</dd>
                  </>
                )}
                <dt>Product code</dt>
                <dd>{v.SKU}</dd>
              </dl>
            </details>
            <details>
              <summary>Delivery &amp; help</summary>
              <p>Delivery charges for your address are shown at checkout before you pay. You'll get updates on your order in My orders.</p>
              {(whatsapp || email) && (
                <p>
                  Need help? {whatsapp && <>WhatsApp <b>{whatsapp}</b></>}
                  {whatsapp && email && " or "}
                  {email && <>email <b>{email}</b></>}.
                </p>
              )}
            </details>
          </div>
        </div>
      </div>

      <div id="reviews">
        <ProductReviews product={v} />
      </div>

      {related.length > 0 && (
        <section className="sh-wrap" style={{ marginTop: 48 }} aria-label="You may also like">
          <h2 className="pp-h2">You may also like</h2>
          <div className="sh-grid">
            {related.map((p) => (
              <ProductCard key={p.groupId} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* phone: price + add to cart stays at the bottom */}
      <div className="pp-sticky">
        <div>
          <b>{money(price)}</b>
          <span>{size ? `Size ${size}` : "Choose a size"}</span>
        </div>
        <button type="button" className="pp-btn dark" onClick={size ? addToCart : () => document.querySelector(".pp-sizes")?.scrollIntoView({ behavior: "smooth", block: "center" })} disabled={busy || !anyStock}>
          {size ? (busy ? "Adding…" : "Add to cart") : "Choose size"}
        </button>
      </div>

      {viewer && <Viewer images={images} index={photo} setIndex={setPhoto} onClose={() => setViewer(false)} name={v.brandname} />}
    </Shell>
  );
}

/* ---------- photos ---------- */
function Gallery({ images, index, setIndex, name, onOpen }) {
  const track = useRef(null);
  // phones: swiping the strip updates the dots
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };
  const go = (i) => {
    setIndex(i);
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  if (!images.length) return <div className="pp-main pp-nophoto">IDENTEE</div>;
  return (
    <div className="pp-gallery">
      {images.length > 1 && (
        <div className="pp-thumbs" role="tablist" aria-label="Photos">
          {images.map((img, i) => (
            <button key={img + i} type="button" role="tab" aria-selected={i === index} className={i === index ? "on" : ""} onClick={() => go(i)} aria-label={`Photo ${i + 1}`}>
              <img src={imageUrl(img, 160)} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="pp-mainwrap">
        <div className="pp-track" ref={track} onScroll={onScroll}>
          {images.map((img, i) => (
            <button key={img + i} type="button" className="pp-main" onClick={onOpen} aria-label="Open photo full screen" tabIndex={i === index ? 0 : -1}>
              <img src={imageUrl(img, 1200)} alt={i === 0 ? name : ""} loading={i === 0 ? "eager" : "lazy"} onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button type="button" className="pp-arrow left" onClick={() => go((index - 1 + images.length) % images.length)} aria-label="Previous photo">
              ‹
            </button>
            <button type="button" className="pp-arrow right" onClick={() => go((index + 1) % images.length)} aria-label="Next photo">
              ›
            </button>
            <div className="pp-dots" aria-hidden="true">
              {images.map((img, i) => (
                <span key={img + i} className={i === index ? "on" : ""} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Viewer({ images, index, setIndex, onClose, name }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft") setIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, onClose, setIndex]);
  return (
    <div className="pp-viewer" role="dialog" aria-modal="true" aria-label={`${name} photos`} onClick={onClose}>
      <img
        src={imageUrl(images[index], 2000)}
        alt={name}
        className={zoom ? "zoom" : ""}
        onClick={(e) => {
          e.stopPropagation();
          setZoom((z) => !z);
        }}
      />
      <button type="button" className="pp-vclose" onClick={onClose} aria-label="Close">
        ×
      </button>
      {images.length > 1 && (
        <p className="pp-vcount">
          {index + 1} / {images.length}
        </p>
      )}
    </div>
  );
}

function Unavailable({ title, text }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 16px", background: "#FBF7EE", borderRadius: 18 }}>
      <h1 className="pp-title" style={{ fontSize: 24 }}>{title}</h1>
      <p style={{ color: "#71695B", margin: "8px 0 18px" }}>{text}</p>
      <Link to="/ready-made" className="pp-btn dark" style={{ display: "inline-flex", textDecoration: "none" }}>
        Shop ready-made
      </Link>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ background: "#fff", minHeight: "80vh" }}>
      <style>{SHOP_CSS + PP_CSS}</style>
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 20px 96px" }}>{children}</main>
    </div>
  );
}

const PP_CSS = `
  .pp-crumbs { font-size: 12.5px; color: #71695B; margin-bottom: 14px; }
  .pp-crumbs a { color: #71695B; text-decoration: none; } .pp-crumbs a:hover { color: #15130F; text-decoration: underline; }
  .pp-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 44px; align-items: start; }
  .pp-skel { border-radius: 14px; background: linear-gradient(90deg, #F3EFE5, #FAF7F0, #F3EFE5); background-size: 200% 100%; animation: sh-shine 1.2s infinite linear; }
  .pp-gallery { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; position: sticky; top: 16px; }
  .pp-thumbs { display: flex; flex-direction: column; gap: 10px; }
  .pp-thumbs button { width: 76px; aspect-ratio: 4 / 5; border-radius: 10px; overflow: hidden; padding: 0; border: 1px solid #ECE4D2; background: #F3F1EC; cursor: pointer; }
  .pp-thumbs button.on { border: 2px solid #15130F; }
  .pp-thumbs img { width: 100%; height: 100%; object-fit: cover; }
  .pp-mainwrap { position: relative; grid-column: 2; min-width: 0; }
  .pp-gallery:not(:has(.pp-thumbs)) .pp-mainwrap { grid-column: 1 / -1; }
  .pp-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; border-radius: 18px; scrollbar-width: none; }
  .pp-track::-webkit-scrollbar { display: none; }
  .pp-main { flex: 0 0 100%; aspect-ratio: 4 / 5; scroll-snap-align: start; border: none; padding: 0; background: #F3F1EC; cursor: zoom-in; display: block; }
  .pp-main img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pp-nophoto { display: grid; place-items: center; border-radius: 18px; color: #CDBF9F; font-weight: 800; letter-spacing: .2em; cursor: default; }
  .pp-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; border: none;
    background: rgba(255,255,255,.92); box-shadow: 0 4px 14px rgba(0,0,0,.12); font-size: 26px; line-height: 1; cursor: pointer; color: #15130F; }
  .pp-arrow.left { left: 12px; } .pp-arrow.right { right: 12px; }
  .pp-dots { position: absolute; bottom: 12px; left: 0; right: 0; display: none; justify-content: center; gap: 6px; }
  .pp-dots span { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.6); }
  .pp-dots span.on { background: #fff; }
  .pp-title { margin: 0; font-family: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; font-size: clamp(26px, 3vw, 34px);
    color: #15130F; letter-spacing: -0.01em; text-wrap: balance; }
  .pp-sub { margin: 6px 0 0; color: #71695B; font-size: 14px; }
  .pp-rating { display: inline-block; margin-top: 8px; font-size: 13px; color: #15130F; text-decoration: none; }
  .pp-rating span { color: #C9A24B; letter-spacing: 1px; }
  .pp-price { margin: 16px 0 0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 15px; color: #71695B; }
  .pp-price b { font-size: 28px; color: #15130F; }
  .pp-off { color: #2E7D4F; font-weight: 800; }
  .pp-member { margin: 4px 0 0; color: #2E7D4F; font-size: 13px; font-weight: 700; }
  .pp-tax { margin: 2px 0 0; font-size: 12px; color: #8A8172; }
  .pp-block { border-top: 1px solid #ECE4D2; margin-top: 20px; padding-top: 18px; }
  .pp-label { margin: 0 0 10px; font-size: 13.5px; color: #3F392F; }
  .pp-link { font-size: 13px; font-weight: 700; color: #7A5B12; }
  .pp-colours { display: flex; gap: 10px; flex-wrap: wrap; }
  .pp-colour { display: grid; justify-items: center; gap: 4px; width: 70px; text-decoration: none; color: #71695B; font-size: 11.5px; text-align: center; }
  .pp-colour img, .pp-colour .pp-swatch { width: 62px; aspect-ratio: 4 / 5; border-radius: 10px; object-fit: cover; border: 1px solid #ECE4D2; display: block; }
  .pp-swatch.light { border-color: #D8CFBB; }
  .pp-colour.on { color: #15130F; font-weight: 700; }
  .pp-colour.on img, .pp-colour.on .pp-swatch { border: 2px solid #15130F; }
  .pp-sizes { display: flex; gap: 8px; flex-wrap: wrap; }
  .pp-size { min-width: 52px; height: 46px; padding: 0 14px; border-radius: 12px; border: 1px solid #D8CFBB; background: #fff; color: #15130F;
    font-weight: 700; font-size: 14px; cursor: pointer; }
  .pp-size:hover:not(:disabled) { border-color: #15130F; }
  .pp-size.on { background: #15130F; color: #fff; border-color: #15130F; }
  .pp-size:disabled { color: #B3AA98; background: #F7F4EC; text-decoration: line-through; cursor: not-allowed; }
  .pp-hurry { margin: 10px 0 0; color: #B3432B; font-size: 13px; font-weight: 700; }
  .pp-note { color: #71695B; font-size: 13.5px; }
  .pp-buy { display: flex; gap: 10px; margin-top: 22px; align-items: stretch; }
  .pp-qty { display: flex; align-items: center; border: 1px solid #D8CFBB; border-radius: 999px; }
  .pp-qty button { width: 42px; height: 50px; border: none; background: none; font-size: 18px; font-weight: 700; cursor: pointer; color: #15130F; }
  .pp-qty button:disabled { color: #C9C0AE; cursor: default; }
  .pp-qty output { min-width: 22px; text-align: center; font-weight: 800; }
  .pp-btn { flex: 1; min-height: 50px; padding: 0 22px; border-radius: 999px; border: none; font-weight: 800; font-size: 15px; cursor: pointer;
    align-items: center; justify-content: center; letter-spacing: .01em; }
  .pp-btn.dark { background: #15130F; color: #fff; } .pp-btn.dark:hover:not(:disabled) { background: #2C261F; }
  .pp-btn.gold { background: #C9A24B; color: #15130F; } .pp-btn.gold:hover:not(:disabled) { background: #B88F36; }
  .pp-btn:disabled { opacity: .45; cursor: not-allowed; }
  .pp-btn.wide { width: 100%; margin-top: 10px; display: flex; }
  .pp-fav { width: 50px; border-radius: 50%; border: 1px solid #D8CFBB; background: #fff; font-size: 22px; color: #71695B; cursor: pointer; flex-shrink: 0; }
  .pp-fav.on { color: #B3432B; border-color: #B3432B; background: #B3432B10; }
  .pp-msg { margin: 12px 0 0; font-size: 13.5px; font-weight: 600; color: #B3432B; }
  .pp-msg.ok { color: #2E7D4F; } .pp-msg a { color: #15130F; font-weight: 800; }
  .pp-promises { list-style: none; padding: 14px 16px; margin: 18px 0 0; background: #FBF7EE; border-radius: 14px; display: grid; gap: 6px; font-size: 13.5px; color: #3F392F; }
  .pp-acc { margin-top: 18px; border-top: 1px solid #ECE4D2; }
  .pp-acc details { border-bottom: 1px solid #ECE4D2; padding: 4px 0; }
  .pp-acc summary { cursor: pointer; list-style: none; padding: 12px 0; font-weight: 800; font-size: 14.5px; color: #15130F; display: flex; justify-content: space-between; }
  .pp-acc summary::-webkit-details-marker { display: none; }
  .pp-acc summary::after { content: "+"; font-weight: 600; color: #71695B; }
  .pp-acc details[open] summary::after { content: "−"; }
  .pp-acc p, .pp-acc ul { margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #3F392F; max-width: 62ch; }
  .pp-acc ul { padding-left: 18px; }
  .pp-dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 18px; margin: 0 0 12px; font-size: 14px; }
  .pp-dl dt { color: #71695B; } .pp-dl dd { margin: 0; color: #15130F; overflow-wrap: anywhere; }
  .pp-h2 { font-family: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; font-size: 24px; margin: 0 0 16px; color: #15130F; }
  .pp-sticky { display: none; }
  .pp-viewer { position: fixed; inset: 0; z-index: 1000; background: rgba(15,13,10,.94); display: grid; place-items: center; overflow: auto; }
  .pp-viewer img { max-width: 94vw; max-height: 90vh; object-fit: contain; cursor: zoom-in; }
  .pp-viewer img.zoom { max-width: none; max-height: none; width: 180vw; cursor: zoom-out; }
  .pp-vclose { position: fixed; top: 14px; right: 16px; width: 46px; height: 46px; border-radius: 50%; border: none; background: #fff; font-size: 28px; cursor: pointer; }
  .pp-vcount { position: fixed; bottom: 14px; left: 0; right: 0; text-align: center; color: #fff; font-size: 13px; margin: 0; }
  @media (max-width: 900px) {
    .pp-grid { grid-template-columns: minmax(0, 1fr); gap: 22px; }
    .pp-gallery { grid-template-columns: minmax(0, 1fr); position: static; margin: 0 -20px; }
    .pp-thumbs { display: none; }
    .pp-mainwrap { grid-column: 1; }
    .pp-track { border-radius: 0; }
    .pp-arrow { display: none; }
    .pp-dots { display: flex; }
    .pp-sticky { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; gap: 12px; align-items: center;
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); background: #fff; border-top: 1px solid #ECE4D2;
      box-shadow: 0 -6px 18px rgba(0,0,0,.06); }
    .pp-sticky div { display: grid; font-size: 12px; color: #71695B; }
    .pp-sticky b { font-size: 17px; color: #15130F; }
    .pp-sticky .pp-btn { flex: 0 0 auto; min-width: 160px; display: flex; }
  }
`;
