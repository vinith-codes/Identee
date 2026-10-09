// components/home/HomeSections.jsx — the sections of the storefront home page.
// Data comes from pages/Home.jsx (garment photos, shop products, videos).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { imageUrl } from "../../utils/imageUrl";
import { colourHex, isLight } from "../../utils/colours";
import { money } from "../../utils/money";

const PRINTS = ["YOUR NAME", "TEAM 07", "BIRTHDAY SQUAD", "SAY IT LOUD"];
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- hero: the tee changes colour while a print is typed on it ---------- */
export function HomeHero({ garment, colours, printCm }) {
  const [cur, setCur] = useState(0);
  const [manual, setManual] = useState(false);
  const [pi, setPi] = useState(0); // which print
  const [typed, setTyped] = useState(0); // letters shown so far
  const calm = reduceMotion();

  // every 3.8 s: next print (and next colour, until the visitor picks one)
  useEffect(() => {
    if (calm || !colours.length) return;
    const t = setInterval(() => {
      setPi((p) => (p + 1) % PRINTS.length);
      setTyped(0);
      if (!manual) setCur((c) => (c + 1) % colours.length);
    }, 3800);
    return () => clearInterval(t);
  }, [calm, manual, colours.length]);

  // type the print letter by letter
  useEffect(() => {
    if (calm) return;
    const t = setInterval(() => setTyped((n) => n + 1), 85);
    return () => clearInterval(t);
  }, [calm, pi]);
  const text = calm ? PRINTS[pi] : PRINTS[pi].slice(0, typed);

  const c = colours[cur] || colours[0];
  const ink = c && isLight(c.hex) ? "#15130F" : "#F3E7C6";
  const designHref = garment ? `/customize/${garment.key}?new=1&color=${c?.slug || "white"}` : "/customizable";

  return (
    <section className="hm-hero" aria-label="Welcome">
      <div className="hm-wrap">
        <div>
          <p className="hm-eyebrow">IDENTEE — Signature streetwear</p>
          <h1>
            <span className="ln">
              <span>Wear it</span>
            </span>
            <span className="ln">
              <span>
                <span className="under">your way.</span>
              </span>
            </span>
          </h1>
          <p className="lead">
            Design your own {garment ? garment.label.toLowerCase() : "tee"} in our 3D design room, or pick a ready-made one. Even a single piece, printed true to your size.
          </p>
          <div className="ctas">
            <Link className="hm-btn ink" to={designHref}>
              Design your own <span className="arr">→</span>
            </Link>
            <Link className="hm-btn outline" to="/ready-made">
              Shop ready-made
            </Link>
          </div>
          {colours.length > 1 && (
            <div className="hm-picker">
              <small>Try a colour</small>
              <div className="hm-dots" role="group" aria-label="Tee colour">
                {colours.map((col, i) => (
                  <button
                    key={col.slug}
                    type="button"
                    className="hm-dot"
                    style={{ background: col.hex }}
                    aria-label={col.name}
                    title={col.name}
                    aria-pressed={i === cur}
                    onClick={() => {
                      setManual(true);
                      setCur(i);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hm-stage" aria-label={c ? `${garment?.label || "Tee"} in ${c.name}` : undefined}>
          {colours.map((col, i) => (
            <img key={col.slug} src={imageUrl(col.front, 1000)} alt="" className={i === cur ? "on" : ""} loading={i === 0 ? "eager" : "lazy"} />
          ))}
          {c && (
            <div className="hm-print" aria-hidden="true">
              <b className="hm-caret" style={{ color: ink }}>
                {text}
              </b>
              <span style={{ color: ink }}>
                {printCm[0]} × {printCm[1]} CM
              </span>
            </div>
          )}
          {c && (
            <>
              <div className="hm-note n1">
                Size M<small>Print {printCm[0]} × {printCm[1]} cm</small>
              </div>
              <div className="hm-note n2">
                Turn it 360°<small>in the design room</small>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="hm-wrap">
        <div className="hm-facts">
          <span>No minimum order</span>
          <span>Printed true to size</span>
          <span>Cash on delivery</span>
          <span>Pan-India delivery</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- slim marquee ---------- */
const WORDS = ["DESIGN YOUR OWN", "SINGLE PIECE ORDERS", "360° PREVIEW", "TRUE-TO-SIZE PRINTS", "READY-MADE COLLECTIONS", "PAN INDIA DELIVERY"];
export function HomeMarquee() {
  const all = [...WORDS, ...WORDS, ...WORDS, ...WORDS];
  return (
    <div className="hm-mq" aria-hidden="true">
      <div className="track">
        {all.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------- two ways to shop ---------- */
export function HomeWays({ garment, customPhoto, stackPhotos, custom, ready }) {
  return (
    <section className="hm-sec" id="shop" aria-label="Two ways to shop">
      <div className="hm-wrap">
        <div className="hm-head" data-reveal>
          <div>
            <p className="hm-eyebrow">Shop</p>
            <h2>Two ways to wear IDENTEE</h2>
          </div>
          <p>Make something that's only yours, or choose from finished designs ready to wear.</p>
        </div>
        <div className="hm-ways">
          <Link className="hm-way custom" to={garment ? `/customize/${garment.key}?new=1&color=white` : "/customizable"} data-reveal="draw"
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.classList.remove("draw");
              void el.offsetWidth; // restart the drawing
              el.classList.add("draw");
            }}
          >
            {customPhoto && <img className="photo" src={imageUrl(customPhoto, 900)} alt="" loading="lazy" />}
            <svg className="art" viewBox="0 0 200 200" aria-hidden="true">
              <path className="g" d="M30 150 C 40 60, 90 40, 100 100 S 160 160, 170 60" />
              <path d="M40 176 L 160 176" />
              <path d="M70 120 L 100 70 L 130 120 Z" />
            </svg>
            <div className="label">
              <p className="hm-eyebrow">Customizable</p>
              <h3>Design your own</h3>
              <p>Your text, photos or artwork, placed exactly where you want and shown at its real size.</p>
              {custom.count > 0 && (
                <div className="meta">
                  {custom.count === 1 && garment ? garment.label : `${custom.count} garments`}
                  {custom.fromPrice ? ` · from ${money(custom.fromPrice)}` : ""}
                </div>
              )}
              <span className="hm-btn ink">
                Start designing <span className="arr">→</span>
              </span>
            </div>
          </Link>
          <Link className="hm-way ready" to="/ready-made" data-reveal="draw" style={{ "--i": 1 }}>
            {stackPhotos.length > 0 && (
              <div className="hm-stack" aria-hidden="true">
                {stackPhotos.slice(0, 3).map((src, i) => (
                  <img key={src + i} src={imageUrl(src, 600)} alt="" loading="lazy" />
                ))}
              </div>
            )}
            <div className="label">
              <p className="hm-eyebrow">Ready-made</p>
              <h3>Shop ready-made</h3>
              <p>Finished designs in every size, ready to ship.</p>
              {ready.categoryCount > 0 && (
                <div className="meta">
                  {ready.categoryCount} {ready.categoryCount === 1 ? "category" : "categories"} · {ready.productCount} {ready.productCount === 1 ? "product" : "products"}
                </div>
              )}
              <span className="hm-btn gold">
                Shop now <span className="arr">→</span>
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- three steps (the real Design Room order) ---------- */
export function HomeSteps() {
  const steps = [
    ["Pick colour & size", "Every print area is shown at its real size in cm for the size you choose."],
    ["Design in 3D", "Add text, photos or art, then turn the tee 360° to check every side."],
    ["We print & deliver", "Printed from 300 DPI files and shipped across India."],
  ];
  return (
    <section className="hm-sec" style={{ paddingTop: 0 }} aria-label="How it works">
      <div className="hm-wrap">
        <div className="hm-head" data-reveal>
          <div>
            <p className="hm-eyebrow">Design your own</p>
            <h2>From idea to doorstep</h2>
          </div>
          <p>The design room walks you through it, one step at a time.</p>
        </div>
        <ol className="hm-steps" data-reveal="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map(([t, d], i) => (
            <li key={t} className="hm-step" style={{ "--i": i }}>
              <div className="n" aria-hidden="true">
                {i + 1}
              </div>
              <h3>{t}</h3>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- featured ready-made products ---------- */
export function HomeFeatured({ products }) {
  if (products.length < 3) return null; // too few to look like a collection
  return (
    <section className="hm-sec hm-feat" aria-label="Featured tees">
      <div className="hm-wrap">
        <div className="hm-head" data-reveal>
          <div>
            <p className="hm-eyebrow">Ready-made</p>
            <h2>Featured tees</h2>
          </div>
          <Link className="hm-btn outline" to="/ready-made">
            See everything <span className="arr">→</span>
          </Link>
        </div>
        <div className="hm-row">
          {products.map((p) => {
            const price = p.subscriptionPrice && p.subscriptionPrice < p.price ? p.subscriptionPrice : p.price;
            const off = p.oldPrice > price ? Math.round(((p.oldPrice - price) / p.oldPrice) * 100) : 0;
            return (
              <Link key={p.groupId} className="hm-card" to={`/product/${p._id}`}>
                <div className="ph">
                  {p.images?.[0] && <img src={imageUrl(p.images[0], 600)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />}
                  {p.images?.[1] && <img className="alt" src={imageUrl(p.images[1], 600)} alt="" loading="lazy" />}
                  {!p.inStock ? <span className="badge">Out of stock</span> : off >= 5 ? <span className="badge">{off}% off</span> : null}
                  <span className="quick">View</span>
                </div>
                <h3>{p.brandname}</h3>
                <div className="pr">
                  {money(price)}
                  {off > 0 && <s>{money(p.oldPrice)}</s>}
                </div>
                {p.colors?.length > 1 && (
                  <div className="sw" aria-label={`${p.colors.length} colours`}>
                    {p.colors.slice(0, 6).map((col) => (
                      <i key={col._id} style={{ background: colourHex(col.name) }} title={col.name} />
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- promises: only what the shop really does ---------- */
export function HomePromises({ tight = false }) {
  const items = [
    [<><circle cx="14" cy="14" r="10" /><path d="M14 9v10M9 14h10" /></>, "No minimum", "Order one piece, or many in any mix of sizes."],
    [<><rect x="5" y="5" width="18" height="18" rx="2" /><path d="M5 11h18M11 5v18" /></>, "True to size", "Each size printed at its own size from the chart."],
    [<><rect x="3" y="7" width="22" height="14" rx="2" /><circle cx="14" cy="14" r="3" /></>, "Cash on delivery", "Or pay online, securely."],
    [<><path d="M3 8h13v11H3zM16 12h5l4 4v3h-9z" /><circle cx="8" cy="20" r="2" /><circle cx="20" cy="20" r="2" /></>, "Pan-India delivery", "Follow every order in My orders."],
  ];
  return (
    <section className={`hm-sec${tight ? " tight" : ""}`} aria-label="Why IDENTEE">
      <div className="hm-wrap">
        <div className="hm-promises" data-reveal>
          {items.map(([icon, t, d]) => (
            <div key={t} className="hm-promise">
              <svg viewBox="0 0 28 28" aria-hidden="true">
                {icon}
              </svg>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- style outlook: the three videos (Admin → Video banners) ---------- */
export function HomeOutlook({ main, side1, side2 }) {
  // gentle depth: each video drifts at its own speed while scrolling
  useEffect(() => {
    if (reduceMotion()) return;
    const vids = [...document.querySelectorAll(".hm-vid video[data-par]")];
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        vids.forEach((v) => {
          const r = v.parentElement.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          v.style.transform = `translateY(${(r.top + r.height / 2 - window.innerHeight / 2) * Number(v.dataset.par)}px)`;
        }),
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <section className="hm-sec" style={{ paddingTop: 0 }} aria-label="Style outlook">
      <div className="hm-wrap">
        <div className="hm-head" data-reveal>
          <div>
            <p className="hm-eyebrow">Style outlook</p>
            <h2>Simplicity, made bold</h2>
          </div>
          <p>Crafted essentials with an excellent purpose.</p>
        </div>
        <div className="hm-ed">
          <Vid src={main} par={-0.06} />
          <div className="hm-ed-side">
            <Vid src={side1} par={-0.1} />
            <Vid src={side2} par={-0.04} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Vid({ src, par }) {
  return (
    <div className="hm-vid">
      <video key={src} src={src} autoPlay muted loop playsInline data-par={par} />
    </div>
  );
}

/* ---------- closing band ---------- */
export function HomeFinal({ garment, photos }) {
  const half = Math.ceil(photos.length / 2);
  const a = photos.slice(0, half);
  const b = photos.slice(half).length ? photos.slice(half) : photos;
  const col = (list) => [...list, ...list, ...list].map((src, i) => <img key={src + i} src={imageUrl(src, 500)} alt="" loading="lazy" />);
  return (
    <section className="hm-sec hm-final" aria-label="Design your own">
      <div className="hm-wrap">
        <div data-reveal>
          <p className="hm-eyebrow">Your style, your story</p>
          <h2>
            Walk into the <em>design room.</em>
          </h2>
          <p>Drop in your artwork, place it, turn the tee around and see it exactly as it will be printed.</p>
          <Link className="hm-btn gold" to={garment ? `/customize/${garment.key}?new=1&color=white` : "/customizable"}>
            Start designing <span className="arr">→</span>
          </Link>
        </div>
        {photos.length > 1 && (
          <div className="hm-cols" aria-hidden="true">
            <div className="hm-col">{col(a)}</div>
            <div className="hm-col down">{col(b)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
