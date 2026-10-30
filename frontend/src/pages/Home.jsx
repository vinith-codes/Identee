// pages/Home.jsx — the storefront home page.
//
// Calm editorial layout (components/home): a hero where the customizable
// tee changes colour while a print is typed on it, two ways to shop, the
// Design Room steps, the SCENE Movie Products tees just before "Create your
// IDENTEE" (featured first: Admin → Ready-made → "Feature it"), plain promises, the three Style outlook videos (Admin →
// Video banners) and a closing band. The footer is components/SiteFooter.jsx (every page).
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import { getVideoBanner } from "../redux/slices/bannerSlice";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";
import { coverPhoto, isSellable } from "../utils/garments";
import { imageUrl } from "../utils/imageUrl";
import shopService from "../services/shopService";
import subVideo1 from "../assets/videos/sub-video1.mp4";
import hoodieVideo from "../assets/videos/hoodie.mp4";
import polosVideo from "../assets/videos/polos.mp4";
import {
  HomeHero,
  HomeMarquee,
  HomeWays,
  HomeSteps,
  HomeScene,
  HomeOutlook,
  HomeFinal,
  HomePhoto,
  HomeCreate,
} from "../components/home/HomeSections";
import useReveal from "../components/home/useReveal";
import "../components/home/home.css";



// Hero colours, in this order when the garment has them.
const HERO_ORDER = ["black", "white", "maroon", "navy", "bottle-green", "lavender", "beige", "royal-blue"];

function WhatsAppIcon({ size = 18, color = "#25D366" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.6.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5C10.3 9 9.8 7.8 9.6 7.3c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 5 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.2-.7.2-1.2.1-1.4-.1-.1-.3-.2-.6-.3Z" />
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.2-.4-4.5-1.3l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
    </svg>
  );
}

function InstagramIcon({ size = 18, color = "#fff" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill={color} stroke="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  FLOATING SOCIAL — WhatsApp + Instagram, fixed on the left edge     */
/* ------------------------------------------------------------------ */
function FloatingSocial({ settings = {} }) {
  // Admin → Settings → General (WhatsApp number, else the phone number); nothing until it loads
  const whatsappDigits = String(settings["general.whatsappNumber"] || settings["general.phoneNumber"] || "").replace(/\D/g, "");
  if (!whatsappDigits) return null;
  const waDigits = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;

  const instagramRaw = settings["general.instagramUrl"];
  const instagramHref = instagramRaw
    ? instagramRaw.startsWith("http")
      ? instagramRaw
      : `https://instagram.com/${instagramRaw.replace(/^@/, "")}`
    : "https://instagram.com";

  return (
    <div className="identee-floating-social">
      <a
        href={`https://wa.me/${waDigits}`}
        target="_blank"
        rel="noreferrer"
        className="identee-floating-btn identee-floating-whatsapp"
        aria-label="Chat on WhatsApp"
      >
        <WhatsAppIcon color="#fff" size={22} />
      </a>
      <a
        href={instagramHref}
        target="_blank"
        rel="noreferrer"
        className="identee-floating-btn identee-floating-instagram"
        aria-label="Follow on Instagram"
      >
        <InstagramIcon size={20} />
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */
export default function Home() {
  const dispatch = useDispatch();
  const { items: garmentTypes } = useSelector((s) => s.garmentType);
  const { items: garmentImages } = useSelector((s) => s.garmentImage);
  const { videoBanners } = useSelector((s) => s.banner);
  const { values: publicSettings, isLoaded: settingsLoaded } = useSelector((s) => s.publicSettings);
  // "Shop your IDENTEE" open (Admin → Settings → General), else Coming soon: no featured products, the card says so
  const shopOpen = publicSettings?.["general.shopOpen"] === true;
  const [scene, setScene] = useState([]); // SCENE Movie Products: featured first, topped up with the newest
  const [collections, setCollections] = useState([]); // Shop your IDENTEE's collections (SCENE Movie Products…)
  const root = useRef(null);

  useEffect(() => {
    dispatch(fetchGarmentTypes()); // live customizable garments only
    dispatch(fetchAllGarmentImages());
    dispatch(getVideoBanner());
    if (!settingsLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, settingsLoaded]);

  // the SCENE tees: featured ones first, then the newest; Oversized, men's and women's Round Neck take turns so all show
  useEffect(() => {
    let alive = true;
    Promise.all([
      shopService.listProducts({ collection: "scene", featured: 1, limit: 12 }).catch(() => ({ items: [] })),
      shopService.listProducts({ collection: "scene", limit: 48 }).catch(() => ({ items: [] })),
      shopService.listProducts({ limit: 1 }).catch(() => ({ items: [] })),
    ]).then(([f, n, all]) => {
      if (!alive) return;
      setCollections(all.facets?.collections || []);
      // only tees whose photos are stored online (old local paths are broken)
      const pool = [...f.items, ...n.items].filter((p, i, a) => /^https?:\/\//.test(p.images?.[0] || "") && a.findIndex((x) => x.key === p.key) === i);
      const byStyle = Object.values(pool.reduce((m, p) => ((m[`${p.garmentStyle}|${p.gender}`] ||= []).push(p), m), {}));
      const mixed = [];
      for (let i = 0; mixed.length < 10 && byStyle.some((l) => l[i]); i++) for (const l of byStyle) if (l[i] && mixed.length < 10) mixed.push(l[i]);
      setScene(mixed);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Admin → Video banners, falling back to the bundled clips
  const video = (section, fallback) => {
    const match = (videoBanners || []).find((v) => v.section === section);
    return match?.videoUrl ? imageUrl(match.videoUrl) : fallback;
  };

  // the customizable garment (the Oversized Tee) and its colour photos
  const sellable = garmentTypes.filter((g) => isSellable(g, garmentImages));
  const garment = sellable[0] || null;
  const colours = (() => {
    if (!garment) return [];
    const list = (garment.colors || [])
      .map((c) => {
        const doc = garmentImages.find((p) => p.garmentType === garment.key && p.colorSlug === c.slug);
        return doc?.front?.imageUrl ? { slug: c.slug, name: c.name, hex: c.hex, front: doc.front.imageUrl } : null;
      })
      .filter(Boolean);
    const rank = (c) => (HERO_ORDER.indexOf(c.slug) === -1 ? 99 : HERO_ORDER.indexOf(c.slug));
    return list.sort((a, b) => rank(a) - rank(b));
  })();
  const centre = garment?.printAreas?.find((a) => a.key === "centre-front");
  const printCm = centre?.width && centre?.height ? [centre.width, centre.height] : [28, 32];

  const custom = {
    count: sellable.length,
    fromPrice: sellable.length ? Math.min(...sellable.map((g) => g.basePrice)) : null,
  };
  // "Shop your IDENTEE: 1 collection · 45 tees" (its collections, 30 Oct 2026 — no Men / Women split)
  const ready = {
    collectionCount: collections.length,
    productCount: collections.reduce((n, c) => n + (c.count || 0), 0),
  };
  // the ready-made card shows three garment photos (always clean, same backdrop)
  const stackPhotos = colours.slice(2, 5).map((c) => c.front);

  useReveal(root, [scene.length, colours.length]);
  const sceneTotal = collections.find((c) => c.key === "scene")?.count || 0;

  return (
    <div className="hm" ref={root}>
      <style>{`
        /* ---- footer link grid ---- */
        .identee-footer-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
        }

        /* ---- floating social icons (fixed, left edge) ---- */
        .identee-floating-social {
          position: fixed;
          left: 20px;
          bottom: 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          z-index: 60;
        }
        .identee-floating-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 22px -8px rgba(21,19,15,0.35);
          transition: transform 0.2s ease;
        }
        .identee-floating-btn:hover { transform: scale(1.08); }
        .identee-floating-whatsapp { background: #25D366; }
        .identee-floating-instagram {
          background: radial-gradient(circle at 30% 110%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%);
        }

        @media (max-width: 900px) {
          .identee-footer-grid { grid-template-columns: repeat(2, 1fr); }
        }
        /* phones: on the left the buttons covered the start of every line of text — the corner on the
           right only touches the ends of a few lines, like a chat button */
        @media (max-width: 760px) {
          /* above the phones' bottom bar (MobileTabBar) */
          .identee-floating-social { left: auto; right: 10px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); gap: 10px; }
          .identee-floating-btn { width: 44px; height: 44px; }
          /* one bubble only, so less of the page is covered (Instagram is in the footer) */
          .identee-floating-instagram { display: none; }
        }
      `}</style>
      <FloatingSocial settings={publicSettings} />

      <HomeHero garment={garment} colours={colours.slice(0, 6)} printCm={printCm} shopOpen={shopOpen} />
      <HomeMarquee shopOpen={shopOpen} />
      {shopOpen && <HomeScene products={scene} total={sceneTotal} />}
      <HomeCreate colours={colours} />
      <HomePhoto />
      <HomeWays garment={garment} customPhoto={garment ? coverPhoto(garment, garmentImages) : null} stackPhotos={stackPhotos} custom={custom} ready={ready} shopOpen={shopOpen} />
      <HomeSteps />
      {/* "Why IDENTEE" (HomePromises) was taken off: the same four points as the hero's line under the tee.
          "Style outlook" shows finished hoodies and polos, so it waits until Shop your IDENTEE opens. */}
      {shopOpen && <HomeOutlook main={video("styleOutlookMain", subVideo1)} side1={video("styleOutlookSide1", hoodieVideo)} side2={video("styleOutlookSide2", polosVideo)} />}
      <HomeFinal garment={garment} photos={colours.map((c) => c.front)} />

    </div>
  );
}
