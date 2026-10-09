// Heading for the two shopping pages (/customizable and /ready-made),
// with a link to switch to the other one.
import { Link } from "react-router-dom";

export default function ShopPageHeader({ eyebrow, title, text, switchTo }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.2em", color: "#C9A24B", textTransform: "uppercase", fontWeight: 800 }}>
          {eyebrow}
        </p>
        <h1
          style={{
            margin: "6px 0",
            fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(26px, 3.4vw, 38px)",
            color: "#15130F",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, color: "#71695B", fontSize: 15, maxWidth: 620 }}>{text}</p>
      </div>
      {switchTo && (
        <Link to={switchTo.to} style={{ color: "#7A5B12", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
          {switchTo.label}
        </Link>
      )}
    </header>
  );
}
