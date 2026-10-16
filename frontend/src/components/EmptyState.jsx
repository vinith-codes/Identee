// A calm "nothing here yet" block with a way forward (empty cart, favourites, checkout).
import { Link } from "react-router-dom";

const css = `
  .es { max-width: 460px; margin: 0 auto; padding: 64px 16px 72px; text-align: center; color: #15130F; }
  .es h1 { margin: 0 0 8px; font: 800 clamp(22px, 5vw, 28px)/1.15 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif;
    letter-spacing: -0.01em; text-wrap: balance; }
  .es p { margin: 0 0 24px; color: #71695B; font-size: 15px; line-height: 1.55; }
  .es-ways { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .es-ways a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px;
    border-radius: 999px; font-weight: 700; font-size: 14px; text-decoration: none; }
  .es-ways a.main { background: #15130F; color: #FFFFFF; }
  .es-ways a.alt { border: 1.5px solid #15130F; color: #15130F; }
  .es-ways a:focus-visible { outline: 2px solid #B8912F; outline-offset: 3px; }
  @media (max-width: 420px) { .es-ways a { flex: 1 1 100%; } }
`;

const WAYS = {
  design: { to: "/customizable", label: "Create your IDENTEE" },
  shop: { to: "/ready-made", label: "Shop your IDENTEE" },
};

export default function EmptyState({ title, text, first = "design" }) {
  const order = first === "shop" ? ["shop", "design"] : ["design", "shop"];
  return (
    <div className="es">
      <style>{css}</style>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="es-ways">
        {order.map((k, i) => (
          <Link key={k} to={WAYS[k].to} className={i === 0 ? "main" : "alt"}>
            {WAYS[k].label}
          </Link>
        ))}
      </div>
    </div>
  );
}
