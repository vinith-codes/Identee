// components/shop/TrendCollectionCard.jsx — the GTA collection's card on Shop your IDENTEE's start page (24 Nov 2026)
// The owner: "we should change the front card of GTA style. The front itself should say they can make their own GTA
// version through the image. Make it attractive." — "In shop we'll add many tees, I told you to change the four image
// card" — and then: "'Put yourself in GTA' is the only thing highlighted; the ready designs are not seen big".
// So it keeps the size of the other collection cards (four pictures on top, words under them), and both ways are on
// it: the four pictures are the ready designs, big, with one of them "your photo → GTA"; two buttons — the designs,
// or your own photo.
import { Link } from "react-router-dom";
import { collectionLink } from "../../utils/shopRules";
import { imageUrl } from "../../utils/imageUrl";

const CSS = `
.tc-card{color:#fff;background:linear-gradient(160deg,#1a0f2e 0%,#3b1a5c 60%,#6b2a6e 100%)}
.tc-pics{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;aspect-ratio:5/4;background:#1a0f2e;text-decoration:none}
.tc-pics img{width:100%;height:100%;object-fit:cover;display:block;min-height:0}
.tc-tile{position:relative;min-height:0;overflow:hidden}
.tc-tile .tc-label{position:absolute;left:8px;bottom:8px;padding:4px 9px;border-radius:999px;background:rgba(10,6,20,.78);font-size:11.5px;font-weight:800;color:#fff}
.tc-tile.you .tc-label{background:#f6c453;color:#1a0f2e}
.tc-chip{position:absolute;top:10px;left:10px;z-index:1;padding:4px 10px;border-radius:999px;background:#f6c453;color:#1a0f2e;font-size:11px;font-weight:800;letter-spacing:.1em}
.tc-card .sh-collection-text > span{opacity:.92;color:#efe6f5}
.tc-card .tc-head{font-family:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif;font-size:23px}
.tc-you{font-weight:800;color:#ffd36e}
.tc-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.tc-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;font-weight:800;font-size:14px;text-decoration:none}
.tc-btn.main{background:linear-gradient(90deg,#f6c453,#ff9a3d);color:#1a0f2e}
.tc-btn.alt{border:1.5px solid rgba(255,255,255,.7);color:#fff}
.tc-btn:focus-visible,.tc-pics:focus-visible{outline:3px solid #f6c453;outline-offset:2px}
`;

/** trend: the public trend ({ key, name, example, backs }); c: the shop's collection ({ count, styles, photos }). */
export default function TrendCollectionCard({ trend, c }) {
  const link = collectionLink(trend.key);
  const backs = (trend.backs || []).filter((b) => b.small || b.url);
  const designs = backs.slice(0, trend.example ? 3 : 4);
  return (
    <div className="sh-collection tc-card">
      <style>{CSS}</style>
      <Link className="tc-pics" to={`${link}#designs`} aria-label={`See the ${backs.length} ready ${trend.name} designs`}>
        <span className="tc-chip">NEW</span>
        {trend.example && (
          <span className="tc-tile you">
            <img src={imageUrl(trend.example, 400)} alt="" loading="lazy" />
            <span className="tc-label">📸 Your photo → GTA</span>
          </span>
        )}
        {designs.map((b, i) => (
          <span className="tc-tile" key={b.url || i}>
            <img src={imageUrl(b.small || b.url, 400)} alt="" loading="lazy" />
            {i === 0 && <span className="tc-label">Ready designs</span>}
          </span>
        ))}
      </Link>
      <span className="sh-collection-text">
        <b className="tc-head">{trend.name}</b>
        <span>
          {backs.length} ready GTA designs, printed big on the back — or put <span className="tc-you">yourself</span> in GTA with your photo.
        </span>
        <span>
          {c?.styles?.length ? `${c.styles.join(" & ")} · ` : ""}GTA logo on the front · Free shipping
        </span>
        <span className="tc-btns">
          <Link className="tc-btn main" to={`${link}#designs`}>
            See the {backs.length} designs →
          </Link>
          <Link className="tc-btn alt" to={link}>
            📸 Use my photo
          </Link>
        </span>
      </span>
    </div>
  );
}
