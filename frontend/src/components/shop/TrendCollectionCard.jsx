// components/shop/TrendCollectionCard.jsx — the GTA collection's card on Shop your IDENTEE's start page (24 Nov 2026)
// The owner: "we should change the front card of GTA style. The front itself should say they can make their own GTA
// version through the image. Make it attractive." — and then: "In shop we'll add many tees, I told you to change the
// four image card". So it keeps the size and shape of the other collection cards (it sits in the same grid), but the
// picture part says "your photo → GTA version" and the words say you can make your own.
import { Link } from "react-router-dom";
import { collectionLink } from "../../utils/shopRules";
import { imageUrl } from "../../utils/imageUrl";

const CSS = `
.tc-card{color:#fff;background:linear-gradient(160deg,#1a0f2e 0%,#3b1a5c 60%,#6b2a6e 100%)}
.tc-pics{position:relative;display:grid;place-items:center;aspect-ratio:5/4;overflow:hidden;
  background:radial-gradient(90% 80% at 100% 100%,#ff8a3d 0%,rgba(255,138,61,0) 60%),radial-gradient(80% 70% at 90% 0%,#e0407a 0%,rgba(224,64,122,0) 60%),linear-gradient(135deg,#24133d,#4a1f66)}
.tc-pics img.tc-main{height:84%;width:auto;max-width:70%;object-fit:contain;border-radius:14px;transform:rotate(2.5deg);box-shadow:0 14px 30px rgba(0,0,0,.45)}
.tc-chip{position:absolute;top:12px;left:12px;padding:4px 10px;border-radius:999px;background:#f6c453;color:#1a0f2e;font-size:11px;font-weight:800;letter-spacing:.1em}
.tc-flow{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:6px;padding:6px 10px 6px 6px;border-radius:999px;
  background:rgba(10,6,20,.72);border:1px solid rgba(255,255,255,.2);font-size:12px;font-weight:800;backdrop-filter:blur(4px)}
.tc-flow .tc-me{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fff;font-size:15px;overflow:hidden}
.tc-flow .tc-me img{width:100%;height:100%;object-fit:cover}
.tc-flow i{font-style:normal;color:#f6c453}
.tc-card .sh-collection-text > span:not(.sh-style-go){opacity:.9;color:#efe6f5}
.tc-card .tc-head{font-family:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;font-size:23px}
.tc-card .tc-head em{font-style:normal;background:linear-gradient(90deg,#ffd36e,#ff8a3d 55%,#ff5f9e);-webkit-background-clip:text;background-clip:text;color:transparent}
.tc-card .sh-collection-text .sh-style-go{background:linear-gradient(90deg,#f6c453,#ff9a3d);color:#1a0f2e;border:0;opacity:1;font-weight:800}
`;

/** trend: the public trend ({ key, name, example, before, backs }); c: the shop's collection ({ count, styles, photos }). */
export default function TrendCollectionCard({ trend, c }) {
  const pic = trend.example || c?.photos?.[0];
  return (
    <Link className="sh-collection tc-card" to={collectionLink(trend.key)} aria-label={`${trend.name}: make your own tee from your photo`}>
      <style>{CSS}</style>
      <span className="tc-pics" aria-hidden="true">
        {pic && <img className="tc-main" src={imageUrl(pic, 600)} alt="" loading="lazy" />}
        <span className="tc-chip">NEW · MAKE YOUR OWN</span>
        <span className="tc-flow">
          <span className="tc-me">{trend.before ? <img src={imageUrl(trend.before, 120)} alt="" loading="lazy" /> : "📸"}</span>
          Your photo <i>→</i> GTA version
        </span>
      </span>
      <span className="sh-collection-text">
        <b className="tc-head">
          Put <em>yourself</em> in GTA
        </b>
        <span>Send your photo. We redraw you in {trend.name} and print it on the back of your tee, with the GTA logo on the front.</span>
        {c?.count > 0 && (
          <span>
            Or pick a ready design · {c.count} tee{c.count === 1 ? "" : "s"}
            {c.styles?.length ? ` · ${c.styles.join(" & ")}` : ""}
          </span>
        )}
        <span className="sh-style-go">Make my GTA tee →</span>
      </span>
    </Link>
  );
}
