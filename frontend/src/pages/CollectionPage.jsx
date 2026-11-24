// pages/CollectionPage.jsx  —  /ready-made/:collection  (e.g. /ready-made/scene)
//
// One collection of Shop your IDENTEE (the client, 30 Oct 2026): a card per style (Oversized, Round Neck), then that
// style's tees with Unisex / Men / Women to filter by (components/shop/ShopGrid). The heading says what every tee
// here comes with: it can be customized, and it ships free.
// (24 Nov 2026, the owner: "think as a user and implement proper navigation") the tees show straight away, with
// All styles · Oversized · Round Neck tabs over them (no card per style to tap through first), and a chip per
// collection under the heading goes to another collection in one tap.
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import shopService from "../services/shopService";
import ShopGrid from "../components/shop/ShopGrid";
import ShopComingSoon from "../components/ShopComingSoon";
import { SHOP_CSS } from "../components/shop/shopStyles";
import { useShopOpen } from "../utils/shopOpen";
import { SHOPS } from "../utils/shopNames";
import { collectionInfo } from "../utils/shopRules";
import TrendBanner from "../components/shop/TrendBanner";
import useTrend from "../utils/useTrend";
import { Crumbs, CollectionSwitch } from "../components/shop/ShopTrail";

const C = { ink: "#15130F", gold: "#C9A24B" };

export default function CollectionPage() {
  const key = String(useParams().collection || "").toLowerCase();
  const shop = useShopOpen();
  const { hash } = useLocation();
  const [found, setFound] = useState(null); // the collection from the shop's list; false = not in the shop
  const info = collectionInfo(key, found?.name);
  // a trend's collection (GTA, 23 Nov 2026): "Make your own" first — which tee to start from (its "Make your own" tees)
  const trend = useTrend(key);
  const [starts, setStarts] = useState(null);
  useEffect(() => {
    if (!trend || !shop.open) return undefined;
    let alive = true;
    shopService
      .listProducts({ collection: key, q: "make your own", limit: 12 })
      .then((d) => {
        if (!alive) return;
        const own = (d.items || []).filter((p) => /·\s*make your own\s*$/i.test(p.brandname || "") && p.readyDesignSlug);
        const label = (p) => (p.garmentStyle === "Oversized" ? "Oversized tee" : `${p.garmentStyle || "Tee"}${p.gender && p.gender !== "Unisex" ? ` · ${p.gender}` : ""}`);
        const order = (p) => (p.garmentStyle === "Oversized" ? 0 : p.gender === "Men" ? 1 : 2);
        setStarts([...own].sort((a, b) => order(a) - order(b)).map((p) => ({ label: label(p), to: `/ready-made/design/${p.readyDesignSlug}` })));
      })
      .catch(() => alive && setStarts([]));
    return () => {
      alive = false;
    };
  }, [trend, key, shop.open]);

  // /ready-made/gta#designs (the shop card's "See the designs"): straight to the ready designs once they are there
  useEffect(() => {
    if (hash !== "#designs" || !found) return undefined;
    const t = setTimeout(() => document.getElementById("designs")?.scrollIntoView({ block: "start" }), 400);
    return () => clearTimeout(t);
  }, [hash, found]);

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
          <Crumbs
            dark
            items={[
              { label: "Home", to: "/" },
              { label: SHOPS.shop.name, to: "/ready-made" },
              { label: found ? info.name : "…" },
            ]}
          />
          <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>{found ? info.name : "…"}</h1>
          {info.text && <p style={{ margin: 0, fontSize: 14.5, opacity: 0.88, maxWidth: 620 }}>{info.text}</p>}
          <div style={{ marginTop: 18 }}>
            <CollectionSwitch current={key} dark />
          </div>
        </div>
      </div>

      <div className="sh-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 64px" }}>
        <style>{SHOP_CSS}</style>
        <p className="sh-perks">
          <span>✎ Every tee can be customized: change the words, add your name or a photo.</span>
          <span>Free shipping on {SHOPS.shop.name} tees</span>
        </p>
        {found && trend && starts?.length > 0 && <TrendBanner trend={trend} starts={starts} />}
        {found && trend ? (
          // a trend's collection (GTA, 24 Nov 2026): the ready designs show straight away, big, a tab per tee
          <ShopGrid
            key={key}
            collection={key}
            collectionName={info.name}
            defaultStyle={(found.styles || []).includes("Oversized") ? "Oversized" : found.styles?.[0] || ""}
            hideOwn
            heading={
              <div id="designs" className="sh-ready-head">
                <h2>Ready {trend.name} designs</h2>
                <p>
                  {(trend.backs || []).length} designs, printed big on the back with the GTA logo on the front. Tap one to see it — you can still add
                  your name or change it.
                </p>
              </div>
            }
          />
        ) : (
          found && <ShopGrid key={key} collection={key} collectionName={info.name} allTab />
        )}
      </div>
    </div>
  );
}
