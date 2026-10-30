// pages/CollectionPage.jsx  —  /ready-made/:collection  (e.g. /ready-made/scene)
//
// One collection of Shop your IDENTEE (the client, 30 Oct 2026): a card per style (Oversized, Round Neck), then that
// style's tees with Unisex / Men / Women to filter by (components/shop/ShopGrid). The heading says what every tee
// here comes with: it can be customized, and it ships free.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import shopService from "../services/shopService";
import ShopGrid from "../components/shop/ShopGrid";
import ShopComingSoon from "../components/ShopComingSoon";
import { SHOP_CSS } from "../components/shop/shopStyles";
import { useShopOpen } from "../utils/shopOpen";
import { SHOPS } from "../utils/shopNames";
import { collectionInfo } from "../utils/shopRules";

const C = { ink: "#15130F", gold: "#C9A24B" };

export default function CollectionPage() {
  const key = String(useParams().collection || "").toLowerCase();
  const shop = useShopOpen();
  const [found, setFound] = useState(null); // the collection from the shop's list; false = not in the shop
  const info = collectionInfo(key, found?.name);

  useEffect(() => {
    if (!shop.open) return undefined;
    let alive = true;
    shopService
      .listProducts({ limit: 1 })
      .then((d) => alive && setFound(d.facets?.collections?.find((c) => c.key === key) || false))
      .catch(() => alive && setFound(false));
    return () => {
      alive = false;
    };
  }, [key, shop.open]);

  if (!shop.open) return <div style={{ minHeight: "70vh", background: "#fff" }}>{shop.known && <ShopComingSoon />}</div>;

  if (found === false) {
    return (
      <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", background: "#fff" }}>
        <div>
          <h1 style={{ color: C.ink, margin: "0 0 8px" }}>This collection isn't in the shop</h1>
          <Link to="/ready-made" style={{ color: "#7A5B12", fontWeight: 700 }}>
            ← All of {SHOPS.shop.name}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ background: `linear-gradient(120deg, ${C.ink} 0%, #2A2620 60%, ${C.gold} 140%)` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 20px 28px", color: "#fff" }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, opacity: 0.85 }}>
            <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Home</Link> /{" "}
            <Link to="/ready-made" style={{ color: "inherit", textDecoration: "none" }}>{SHOPS.shop.name}</Link>
          </nav>
          <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>{found ? info.name : "…"}</h1>
          {info.text && <p style={{ margin: 0, fontSize: 14.5, opacity: 0.88, maxWidth: 620 }}>{info.text}</p>}
        </div>
      </div>

      <div className="sh-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 64px" }}>
        <style>{SHOP_CSS}</style>
        <p className="sh-perks">
          <span>✎ Every tee can be customized: change the words, add your name or a photo.</span>
          <span>Free shipping on {SHOPS.shop.name} tees</span>
        </p>
        {found && <ShopGrid key={key} collection={key} collectionName={info.name} />}
      </div>
    </div>
  );
}
