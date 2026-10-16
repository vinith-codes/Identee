// Phones only: a bar fixed to the bottom of every customer page — Home · Create · Team · Cart — so the ways to
// make a tee and the cart are always one tap away. (Not in the design room, which has its own tool bar.)
import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import { SHOPS } from "../utils/shopNames";

const css = `
  .mtb, .mtb-space { display: none; }
  @media (max-width: 760px) {
    .mtb { display: grid; grid-template-columns: repeat(4, 1fr); position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
      background: #fff; border-top: 1px solid #E2DED3; padding: 6px 4px calc(8px + env(safe-area-inset-bottom, 0px)); }
    .mtb-space { display: block; height: calc(62px + env(safe-area-inset-bottom, 0px)); }
    .mtb a { position: relative; display: grid; justify-items: center; gap: 3px; padding: 4px 0; color: #4A453C; text-decoration: none;
      font: 600 11px/1.1 Inter, "Helvetica Neue", Arial, sans-serif; }
    .mtb a.active { color: #9C7A2E; }
    .mtb svg { width: 23px; height: 23px; }
    .mtb .n { position: absolute; top: 0; left: calc(50% + 6px); min-width: 17px; padding: 1px 5px; border-radius: 999px;
      background: #C9A24B; color: #15130F; font-size: 10px; font-weight: 800; text-align: center; }
    .mtb a:focus-visible { outline: 2px solid #B8912F; outline-offset: -2px; border-radius: 8px; }
  }
`;

const Icon = {
  home: <path d="M3 11l9-7 9 7v9H3zM9 20v-6h6v6" />,
  create: <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a3 3 0 0 1-6 0Z" />,
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M15 15c2.5 0 4.5 1.5 5 4.5" />
    </>
  ),
  cart: <path d="M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0" />,
};

export default function MobileTabBar() {
  const count = useSelector((s) => s.cartWishlist?.cartItems?.length || 0);
  const tabs = [
    { to: "/", label: "Home", icon: Icon.home, end: true },
    { to: SHOPS.create.to, label: "Create", icon: Icon.create },
    { to: SHOPS.team.to, label: "Team", icon: Icon.team },
    { to: "/cart", label: "Cart", icon: Icon.cart, count },
  ];
  return (
    <>
      <style>{css}</style>
      <div className="mtb-space" aria-hidden="true" />
      <nav className="mtb" aria-label="Quick links">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.icon}
            </svg>
            {t.label}
            {t.count > 0 && <span className="n" aria-label={`${t.count} in cart`}>{t.count}</span>}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
