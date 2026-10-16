// components/home/HomeSections.jsx — the sections of the storefront home page.
// Data comes from pages/Home.jsx (garment photos, shop products, videos).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { imageUrl } from "../../utils/imageUrl";
import { colourHex, isLight } from "../../utils/colours";
import { money } from "../../utils/money";
import { SHOPS } from "../../utils/shopNames";

const PRINTS = ["YOUR NAME", "TEAM 07", "BIRTHDAY SQUAD", "SAY IT LOUD"];
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- hero: the tee changes colour while a print is typed on it ---------- */
export function HomeHero({ garment, colours, printCm, shopOpen }) {
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
            {shopOpen
              ? `Create your own ${garment ? garment.label.toLowerCase() : "tee"} in our 3D design room, shop a finished one, or make one for your whole team.`
              : `Create your own ${garment ? garment.label.toLowerCase() : "tee"} in our 3D design room, or make one for your whole team.`}{" "}
            Even a single piece, printed true to your size.
          </p>
          <div className="ctas">
            <Link className="hm-btn ink" to={designHref}>
              {SHOPS.create.name} <span className="arr">→</span>
            </Link>
            {/* the second way that is open: the shop, or (while it is coming soon) team orders */}
            <Link className="hm-btn outline" to={shopOpen ? SHOPS.shop.to : SHOPS.team.to}>
              {shopOpen ? SHOPS.shop.name : "For a team or group"}
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

        {/* the tee leans towards the pointer (mouse / trackpad only; not with reduced motion) */}
        <div
          className="hm-stage"
          aria-label={c ? `${garment?.label || "Tee"} in ${c.name}` : undefined}
          onPointerMove={(e) => {
            if (calm || e.pointerType !== "mouse") return;
            const r = e.currentTarget.getBoundingClientRect();
            if (!r.width || !r.height) return;
            e.currentTarget.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width) - 0.5) * 10}deg`);
            e.currentTarget.style.setProperty("--rx", `${(0.5 - (e.clientY - r.top) / r.height) * 8}deg`);
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.setProperty("--ry", "0deg");
            e.currentTarget.style.setProperty("--rx", "0deg");
          }}
        >
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
const WORDS = ["CREATE YOUR IDENTEE", "SINGLE PIECE ORDERS", "360° PREVIEW", "TEAM & GROUP TEES", "TRUE-TO-SIZE PRINTS", "SHOP YOUR IDENTEE", "PAN INDIA DELIVERY"];
export function HomeMarquee({ shopOpen }) {
  const words = WORDS.map((w) => (w === "SHOP YOUR IDENTEE" && !shopOpen ? "SHOP YOUR IDENTEE · COMING SOON" : w));
  const all = [...words, ...words, ...words, ...words];
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

/* ---------- "What do you want on your tee?" + every way to make it ----------
   Open-ended on purpose (not a list of themes, which reads as "only these"): type any idea → the design room opens
   and the assistant takes it from there (navigation state, see DesignRoomPage `ideaLink`); or start with a tool. */
const IDEA_EXAMPLE = "Messi on the back, my name on the front";
// the box types a few ideas by itself, so people see the kind of thing they can ask for (stops once they click in)
const IDEA_EXAMPLES = [
  IDEA_EXAMPLE,
  "Our cricket team, a name and number on each tee",
  "My dog as a cartoon on the front",
  "Happy 60th Appa, with his photo",
  "Class of 2026 on the back, with all our names",
];
function useTypedExample(stop) {
  const [n, setN] = useState(0); // which example
  const [len, setLen] = useState(0); // letters shown
  const calm = reduceMotion();
  useEffect(() => {
    if (calm || stop) return;
    const full = IDEA_EXAMPLES[n].length;
    // type, hold the whole line for a moment, then the next one
    const t = setTimeout(
      () => {
        if (len < full) setLen(len + 1);
        else {
          setN((n + 1) % IDEA_EXAMPLES.length);
          setLen(0);
        }
      },
      len < full ? 45 : 2200,
    );
    return () => clearTimeout(t);
  }, [n, len, calm, stop]);
  // stopped (they clicked in or typed): the current example in full, not a half-typed line
  return calm ? IDEA_EXAMPLE : stop ? IDEA_EXAMPLES[n] : IDEA_EXAMPLES[n].slice(0, len);
}
export function HomeCreate({ garment, colours }) {
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [missing, setMissing] = useState(false);
  const [focused, setFocused] = useState(false);
  const example = useTypedExample(focused || idea.length > 0);
  const base = garment ? `/customize/${garment.key}?new=1` : null;
  const go = (extra = "", color = "white") => (base ? `${base}&color=${color}${extra}` : SHOPS.create.to);
  const photo = (slug, i) => (colours.find((c) => c.slug === slug) || colours[i % Math.max(1, colours.length)])?.front;
  const submit = (e) => {
    e.preventDefault();
    const text = idea.trim();
    if (text.length < 3) return setMissing(true);
    navigate(go(), { state: { idea: text } });
  };
  const WAYS6 = [
    { title: "Your photo", text: "As it is, or turned into art.", to: go("&photo=1"), slug: "white", ov: <span className="ov box">YOUR<br />PHOTO</span> },
    { title: "Your words", text: "Names, quotes, dates — in any font.", to: go("&start=text", "black"), slug: "black", ov: <span className="ov" style={{ color: "#F0D585", fontSize: 15 }}>SAY IT<br />LOUD</span> },
    { title: "Describe it", text: "We draw what you describe.", to: go("&start=draw", "navy"), slug: "navy", ov: <span className="ov" style={{ color: "#fff" }}>✦ DRAWN<br />FOR YOU</span> },
    { title: "Ready art", text: "Designs from our art library.", to: go("&start=art", "cream"), slug: "cream", ov: <span className="ov" style={{ color: "#7A5B12" }}>◆ ART<br />LIBRARY</span> },
    { title: "Names & numbers", text: "A different one on every tee.", to: SHOPS.team.to, slug: "bottle-green", ov: <span className="ov" style={{ color: "#fff" }}>ARUN<br /><span style={{ fontSize: 22 }}>07</span></span> },
    { title: "Your logo", text: "For a shop, college or office.", to: go("&start=upload", "red"), slug: "red", ov: <span className="ov dash">YOUR LOGO</span> },
  ];
  return (
    <section className="hm-sec hm-create" aria-label="What do you want on your tee?">
      <div className="hm-wrap">
        <div className="hm-ask" data-reveal>
          <p className="hm-eyebrow">{SHOPS.create.name}</p>
          <h2>What do you want on your tee?</h2>
          <p className="sub">Type it in your own words: a name, a quote, a photo idea, your team. The design room opens with it, and the assistant helps you finish it.</p>
          <form className={`hm-askbox${missing ? " bad" : ""}`} onSubmit={submit}>
            <input
              value={idea}
              onChange={(e) => {
                setIdea(e.target.value);
                if (missing) setMissing(false);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={`Try: “${example}”`}
              aria-label="Describe what you want on your tee"
              maxLength={400}
            />
            <button type="submit">Create it <span className="arr">→</span></button>
          </form>
          {missing && <p className="hm-askmiss" role="alert">Type your idea first — a few words are enough. Or pick a way to start below.</p>}
          <div className="hm-askor">
            <span>Or start with:</span>
            <Link to={go("&photo=1")}>My photo</Link>
            <Link to={go("&start=text")}>My words</Link>
            <Link to={go("&start=draw")}>A drawing</Link>
            <Link to={go()}>A blank tee</Link>
          </div>
        </div>

        <div className="hm-head hm-head-6" data-reveal>
          <div>
            <h2>Anything you can imagine</h2>
          </div>
          <p>Six ways to make it — mix them on one tee: front, back and sleeves.</p>
        </div>
        <div className="hm-six" data-reveal>
          {WAYS6.map((w, i) => (
            <Link key={w.title} className="hm-six-card" to={w.to} style={{ "--i": i }}>
              <span className="art">
                {photo(w.slug, i) && <img src={imageUrl(photo(w.slug, i), 420)} alt="" loading="lazy" />}
                {w.ov}
              </span>
              <b>{w.title}</b>
              <small>{w.text}</small>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- three ways to shop ---------- */
// the team card's jersey shows each person in turn — everyone gets their own name and number
const ROSTER = [
  ["ARUN", "07", "L"],
  ["KARTHIK", "10", "XL"],
  ["DIVYA", "23", "M"],
];
export function HomeWays({ garment, customPhoto, stackPhotos, custom, ready, shopOpen }) {
  const [who, setWho] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return;
    const t = setInterval(() => setWho((n) => (n + 1) % ROSTER.length), 2400);
    return () => clearInterval(t);
  }, []);
  const [pName, pNumber] = ROSTER[who];
  return (
    <section className="hm-sec" id="shop" aria-label="Three ways to shop">
      <div className="hm-wrap">
        <div className="hm-head" data-reveal>
          <div>
            <p className="hm-eyebrow">Shop</p>
            <h2>Three ways to wear IDENTEE</h2>
          </div>
          <p>Make something that's only yours, choose a finished design ready to wear, or dress your whole team.</p>
        </div>
        <div className="hm-ways">
          <Link className="hm-way custom" to={SHOPS.create.to} data-reveal="draw"
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
              <p className="hm-eyebrow">Design it yourself</p>
              <h3>{SHOPS.create.name}</h3>
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
          <Link className="hm-way ready" to={SHOPS.shop.to} data-reveal="draw" style={{ "--i": 1 }}>
            {stackPhotos.length > 0 && (
              <div className="hm-stack" aria-hidden="true">
                {stackPhotos.slice(0, 3).map((src, i) => (
                  <img key={src + i} src={imageUrl(src, 600)} alt="" loading="lazy" />
                ))}
              </div>
            )}
            <div className="label">
              <p className="hm-eyebrow">Ready to wear</p>
              <h3>{SHOPS.shop.name}</h3>
              <p>{shopOpen ? "Finished designs in every size, ready to ship." : "Finished designs in every size, ready to ship — on their way."}</p>
              {shopOpen && ready.categoryCount > 0 && (
                <div className="meta">
                  {ready.categoryCount} {ready.categoryCount === 1 ? "category" : "categories"} · {ready.productCount} {ready.productCount === 1 ? "product" : "products"}
                </div>
              )}
              {shopOpen ? (
                <span className="hm-btn gold">
                  Shop now <span className="arr">→</span>
                </span>
              ) : (
                <span className="hm-soon">Coming soon</span>
              )}
            </div>
          </Link>
          <Link className="hm-way team" to={SHOPS.team.to} data-reveal="draw" style={{ "--i": 2 }}>
            <div className="hm-roster" aria-hidden="true">
              {ROSTER.map(([n, no, s], i) => (
                <span key={n} className={i === who ? "on" : ""}>
                  {n} · {Number(no)} · {s}
                </span>
              ))}
            </div>
            <div className="hm-jersey" aria-hidden="true">
              <svg viewBox="0 0 200 210">
                <path d="M62 14 L20 34 L4 84 L34 94 L40 74 L40 202 L160 202 L160 74 L166 94 L196 84 L180 34 L138 14 C 128 26, 72 26, 62 14 Z" fill="#15130F" />
                {/* the team's / company's own logo goes here */}
                <rect x="58" y="40" width="84" height="30" rx="6" fill="rgba(240,213,133,0.08)" stroke="#E6D3A3" strokeWidth="1.6" strokeDasharray="5 4" />
                <circle cx="69" cy="55" r="6" fill="#C9A24B" />
                <text x="69" y="59" textAnchor="middle" fill="#15130F" style={{ font: "800 11px Inter, Arial, sans-serif" }}>+</text>
                <text x="79" y="58.5" textAnchor="start" fill="#E6D3A3" style={{ font: "700 9.5px Inter, Arial, sans-serif", letterSpacing: "0.05em" }}>YOUR LOGO</text>
                <g key={who} className="hm-flip">
                  <text x="100" y="92" textAnchor="middle" fill="#FFFFFF" style={{ font: "800 19px Inter, Arial, sans-serif", letterSpacing: "0.08em" }}>{pName}</text>
                  <text x="100" y="172" textAnchor="middle" fill="#B8912F" style={{ font: "800 78px 'Bricolage Grotesque', Arial, sans-serif" }}>{pNumber}</text>
                </g>
              </svg>
            </div>
            <div className="label">
              <p className="hm-eyebrow">Teams, offices &amp; groups</p>
              <h3>{SHOPS.team.name}</h3>
              <p>One design for everyone: your logo, and each person’s own name, number and size. For sports teams, colleges, offices, events and family trips.</p>
              <span className="hm-btn ink">
                Start your team order <span className="arr">→</span>
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- three steps (the real Design Room order) ---------- */
/* ---------- the Photo Studio, highlighted: the customer's photo as art, or print-ready ---------- */
export function HomePhoto({ garment }) {
  // straight into the design room, which opens the Photo Studio (?photo=1)
  const href = garment ? `/customize/${garment.key}?new=1&photo=1` : "/customizable";
  // a big tee with a face on it, made in our own design room (3D previews, saved in public/home): they take turns
  const tees = [
    ["/home/photo-tee-leo.jpg", "Vijay · LEO", "on the back of a navy oversized tee"],
    ["/home/photo-tee-messi.jpg", "Messi", "on the front of a navy oversized tee"],
  ];
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return;
    const t = setInterval(() => setOn((n) => (n + 1) % tees.length), 4200);
    return () => clearInterval(t);
  }, [tees.length]);
  return (
    <section className="hm-photo" aria-label="Your photo on a tee">
      <div className="hm-wrap hm-photo-in">
        <div className="hm-photo-copy" data-reveal>
          <p className="hm-eyebrow">New · Photo studio</p>
          <h2>Your photo, on a tee</h2>
          <p>
            Upload a photo of anyone or anything you love. Turn it into art, or keep it a photo with the background removed,
            ready to print. Then see it on your tee in 3D.
          </p>
          <ol>
            <li><b>1</b> Upload your photo</li>
            <li><b>2</b> Pick art or print-ready</li>
            <li><b>3</b> Add it to your tee</li>
          </ol>
          <Link className="hm-btn gold" to={href}>
            Start with your photo <span className="arr">→</span>
          </Link>
        </div>
        <Link className="hm-photo-show" to={href} data-reveal aria-label="Start with your photo">
          {tees.map(([src], i) => (
            <img key={src} src={src} alt="" className={i === on ? "on" : ""} loading="lazy" />
          ))}
          <span className="hm-photo-tag" key={on}>
            <b>{tees[on][1]}</b>
            <small>{tees[on][2]}</small>
          </span>
        </Link>
      </div>
    </section>
  );
}

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
            <p className="hm-eyebrow">{SHOPS.create.name}</p>
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
            <p className="hm-eyebrow">{SHOPS.shop.name}</p>
            <h2>Featured tees</h2>
          </div>
          <Link className="hm-btn outline" to={SHOPS.shop.to}>
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
export function HomeFinal({ photos }) {
  const half = Math.ceil(photos.length / 2);
  const a = photos.slice(0, half);
  const b = photos.slice(half).length ? photos.slice(half) : photos;
  const col = (list) => [...list, ...list, ...list].map((src, i) => <img key={src + i} src={imageUrl(src, 500)} alt="" loading="lazy" />);
  return (
    <section className="hm-sec hm-final" aria-label={SHOPS.create.name}>
      <div className="hm-wrap">
        <div data-reveal>
          <p className="hm-eyebrow">Your style, your story</p>
          <h2>
            Walk into the <em>design room.</em>
          </h2>
          <p>Drop in your artwork, place it, turn the tee around and see it exactly as it will be printed.</p>
          <Link className="hm-btn gold" to={SHOPS.create.to}>
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
