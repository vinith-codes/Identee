// "Shop your IDENTEE" while it is closed (utils/shopOpen.js): the shop page, its category pages and product
// pages show this instead, with the two ways that are open.
import { Link } from "react-router-dom";
import { SHOPS } from "../utils/shopNames";

const css = `
  .scs { max-width: 640px; margin: 0 auto; padding: 72px 16px 88px; text-align: center; color: #15130F; }
  .scs-eyebrow { margin: 0; font: 800 12px/1 Inter, sans-serif; letter-spacing: .22em; text-transform: uppercase; color: #B8912F; }
  .scs h1 { margin: 12px 0 10px; font: 800 clamp(30px, 6vw, 46px)/1.05 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -0.02em; text-wrap: balance; }
  .scs p { margin: 0 auto 28px; max-width: 46ch; color: #6B6559; font-size: 15.5px; line-height: 1.6; }
  .scs-ways { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .scs-ways a { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 22px; border-radius: 999px; font-weight: 700; font-size: 14px; text-decoration: none; }
  .scs-ways a.main { background: #15130F; color: #fff; }
  .scs-ways a.alt { border: 1.5px solid #15130F; color: #15130F; }
  .scs-ways a:focus-visible { outline: 2px solid #B8912F; outline-offset: 3px; }
  @media (max-width: 460px) { .scs-ways a { flex: 1 1 100%; } }
`;

export default function ShopComingSoon() {
  return (
    <div className="scs">
      <style>{css}</style>
      <p className="scs-eyebrow">{SHOPS.shop.name}</p>
      <h1>Coming soon</h1>
      <p>Finished IDENTEE designs, ready to wear, are on their way. Until then, create a tee that’s all yours, or one for your whole team.</p>
      <div className="scs-ways">
        <Link to={SHOPS.create.to} className="main">{SHOPS.create.name}</Link>
        <Link to={SHOPS.team.to} className="alt">{SHOPS.team.name}</Link>
      </div>
    </div>
  );
}
