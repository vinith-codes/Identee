// components/shop/TrendBanner.jsx — "Put yourself in GTA" at the top of the GTA collection page (24 Nov 2026)
// The owner: the front card should say they can make their own GTA version from their photo — the small card goes on
// Shop your IDENTEE's start page (TrendCollectionCard), and this big banner is kept for after they click GTA Style.
// It says what it does in one line, the three steps (your photo → the GTA version → your tee), the example picture,
// and a button per tee to start from (the collection's "Make your own" tees: Oversized, Round Neck Men / Women).
import { Link } from "react-router-dom";
import { imageUrl } from "../../utils/imageUrl";

const CSS = `
.tb-card{position:relative;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);align-items:center;gap:8px 28px;margin:0 0 24px;
  padding:34px 36px;border-radius:24px;overflow:hidden;color:#fff;isolation:isolate;
  background:radial-gradient(120% 90% at 100% 100%,#ff8a3d 0%,rgba(255,138,61,0) 55%),radial-gradient(90% 80% at 85% 0%,#e0407a 0%,rgba(224,64,122,0) 60%),linear-gradient(135deg,#1a0f2e 0%,#3b1a5c 55%,#6b2a6e 100%);
  box-shadow:0 18px 50px rgba(59,26,92,.35)}
.tb-text{display:grid;gap:14px;justify-items:start;min-width:0}
.tb-chip{padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);font-size:12px;font-weight:800;letter-spacing:.14em}
.tb-title{margin:0;font-family:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:clamp(30px,4.4vw,50px);line-height:1.02;letter-spacing:-.01em;text-wrap:balance}
.tb-title em{font-style:normal;background:linear-gradient(90deg,#ffd36e,#ff8a3d 55%,#ff5f9e);-webkit-background-clip:text;background-clip:text;color:transparent}
.tb-sub{margin:0;font-size:15.5px;line-height:1.55;color:#efe6f5;max-width:520px}
.tb-steps{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0}
.tb-step{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.16);font-size:13.5px;font-weight:700}
.tb-step span{font-size:18px}
.tb-arrow{color:#f6c453;font-weight:800}
.tb-pick{font-size:13px;font-weight:700;color:#f6c453;letter-spacing:.06em;text-transform:uppercase}
.tb-starts{display:flex;flex-wrap:wrap;gap:10px}
.tb-go{display:inline-flex;align-items:center;gap:8px;padding:13px 22px;border-radius:999px;background:linear-gradient(90deg,#f6c453,#ff9a3d);color:#1a0f2e;font-weight:800;font-size:15px;text-decoration:none;box-shadow:0 8px 22px rgba(255,154,61,.35);transition:transform .15s ease}
.tb-go:hover{transform:translateY(-2px)}
.tb-go:focus-visible{outline:3px solid #fff;outline-offset:3px}
.tb-more{font-size:13px;color:#e3d6ee}
.tb-pic{position:relative;justify-self:center;width:min(100%,330px);aspect-ratio:3/4}
.tb-pic img.tb-main{width:100%;height:100%;object-fit:cover;border-radius:18px;box-shadow:0 16px 40px rgba(0,0,0,.4);transform:rotate(2.5deg)}
.tb-before{position:absolute;left:-14px;bottom:18px;display:grid;justify-items:center;gap:4px;font-size:10.5px;font-weight:800;letter-spacing:.1em}
.tb-before img{width:86px;height:86px;object-fit:cover;border-radius:50%;border:3px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,.35)}
@media (max-width:720px){
  .tb-card{grid-template-columns:1fr;padding:24px 20px 26px;gap:18px}
  .tb-pic{width:min(78%,260px);order:-1}
  .tb-sub{font-size:14.5px}
  .tb-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%}
  .tb-arrow{display:none}
  .tb-step{flex-direction:column;justify-content:center;gap:4px;text-align:center;font-size:12px;padding:9px 6px}
  .tb-starts{display:grid;width:100%}
  .tb-go{justify-content:center}
}
@media (prefers-reduced-motion:reduce){.tb-go,.tb-go:hover{transition:none;transform:none}}
`;

/** trend: the public trend ({ key, name, example, before, backs }); starts: [{ label, to }] — the tees to start from. */
export default function TrendBanner({ trend, starts }) {
  const ready = (trend.backs || []).length;
  return (
    <section className="tb-card" aria-label={`Make your own ${trend.name} tee`}>
      <style>{CSS}</style>
      <div className="tb-text">
        <span className="tb-chip">NEW · {trend.name.toUpperCase()}</span>
        <h2 className="tb-title">
          Put <em>yourself</em> in GTA.
        </h2>
        <p className="tb-sub">Send us your photo. We redraw you in {trend.name} and print it big on the back of your tee, with the GTA logo on the front.</p>
        <div className="tb-steps" aria-hidden="true">
          <span className="tb-step"><span>📸</span>Your photo</span>
          <span className="tb-arrow">→</span>
          <span className="tb-step"><span>🎨</span>GTA version</span>
          <span className="tb-arrow">→</span>
          <span className="tb-step"><span>👕</span>Your tee</span>
        </div>
        <span className="tb-pick">Pick your tee to start</span>
        <div className="tb-starts">
          {starts.map((s) => (
            <Link key={s.to} className="tb-go" to={s.to}>
              {s.label} →
            </Link>
          ))}
        </div>
        {ready > 0 && <span className="tb-more">Or scroll down for our ready GTA designs · Free shipping</span>}
      </div>
      {trend.example && (
        <div className="tb-pic" aria-hidden="true">
          <img className="tb-main" src={imageUrl(trend.example, 700)} alt="" loading="lazy" />
          {trend.before && (
            <span className="tb-before">
              <img src={imageUrl(trend.before, 200)} alt="" loading="lazy" />
              YOUR PHOTO
            </span>
          )}
        </div>
      )}
    </section>
  );
}
