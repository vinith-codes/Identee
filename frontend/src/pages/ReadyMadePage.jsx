// pages/ReadyMadePage.jsx  —  /ready-made  (old /products links come here too)
//
// Shop your IDENTEE's start page: a card per collection (the client, 30 Oct 2026: "SCENE MOVIE PRODUCTS", no
// Men / Women split). A card opens the collection's page (CollectionPage): Oversized and Round Neck, then the tees
// with Unisex / Men / Women to filter by.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import shopService from "../services/shopService";
import ShopPageHeader from "../components/ShopPageHeader";
import { SHOPS } from "../utils/shopNames";
import { useShopOpen } from "../utils/shopOpen";
import ShopComingSoon from "../components/ShopComingSoon";
import ReadyDesignGrid from "../components/shop/ReadyDesignGrid";
import { SHOP_CSS } from "../components/shop/shopStyles";
import { imageUrl } from "../utils/imageUrl";
import { collectionInfo, collectionLink } from "../utils/shopRules";

// one collection: four of its tees, its name, how many tees and in which styles
function CollectionCard({ c }) {
  const info = collectionInfo(c.key, c.name);
  return (
    <Link className="sh-collection" to={collectionLink(c.key)} aria-label={`${info.name}: ${c.count} tees`}>
      <span className={`sh-collection-pics${c.photos.length < 4 ? " n1" : ""}`} aria-hidden="true">
        {(c.photos.length < 4 ? c.photos.slice(0, 1) : c.photos).map((src) => (
          <img key={src} src={imageUrl(src, 400)} alt="" loading="lazy" />
        ))}
      </span>
      <span className="sh-collection-text">
        <b>{info.name}</b>
        {info.text && <span>{info.text}</span>}
        <span>
          {c.count} tee{c.count === 1 ? "" : "s"}
          {c.styles.length ? ` · ${c.styles.join(" & ")}` : ""}
        </span>
        <span className="sh-style-go">Shop now →</span>
      </span>
    </Link>
  );
}

export default function ReadyMadePage() {
  const shop = useShopOpen();
  const [collections, setCollections] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shop.open) return undefined;
    let alive = true;
    shopService
      .listProducts({ limit: 1 })
      .then((d) => alive && setCollections(d.facets?.collections || []))
      .catch(() => alive && setError("Couldn't load the collections. Please try again."));
    return () => {
      alive = false;
    };
  }, [shop.open]);

  if (!shop.open) return <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>{shop.known && <ShopComingSoon />}</div>;

  return (
    <div style={{ background: "#FFFFFF", minHeight: "70vh" }}>
      <main className="sh-wrap" style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 20px 64px" }}>
        <style>{SHOP_CSS}</style>
        <ShopPageHeader
          eyebrow="Ready to wear"
          title={SHOPS.shop.name}
          text="Finished designs, ready to wear. Every tee can be customized, and they all ship free."
          switchTo={{ to: SHOPS.create.to, label: `${SHOPS.create.name} instead →` }}
        />
        {/* the IDENTEE designs that have no category yet (26 Oct 2026); nothing shows while there are none */}
        <ReadyDesignGrid category="none" />
        {error && <p className="sh-error">{error}</p>}
        <div className="sh-collections">
          {collections === null && !error
            ? [0, 1].map((i) => <div key={i} className="sh-skel" style={{ aspectRatio: "5 / 5.4", borderRadius: 20 }} />)
            : (collections || []).map((c) => <CollectionCard key={c.key} c={c} />)}
        </div>
        {collections?.length === 0 && <p style={{ color: "#71695B" }}>New collections are coming soon.</p>}
      </main>
    </div>
  );
}
