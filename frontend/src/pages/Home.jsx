// pages/Home.jsx — the storefront home page.
//
// Calm editorial layout (components/home): a hero where the customizable
// tee changes colour while a print is typed on it, two ways to shop, the
// Design Room steps, featured ready-made tees (Admin → Ready-made →
// "Feature it"), plain promises, the three Style outlook videos (Admin →
// Video banners) and a closing band. The footer is unchanged.
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCategories } from "../redux/slices/categorySlice";
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
  HomeFeatured,
  HomePromises,
  HomeOutlook,
  HomeFinal,
} from "../components/home/HomeSections";
import useReveal from "../components/home/useReveal";
import "../components/home/home.css";

const C = { 
  bg: "#FFFFFF", // primary page background
  bgAlt: "#FBF7EE", // soft warm cream for alternating sections
  yellow: "#F4C43C", // primary accent — bands, marquee, highlights
  yellowDeep: "#E3A72E", // hover / deeper accent
  yellowSoft: "#FCEFC7", // light wash for chips/badges
  gold: "#C9A24B", // brand gold, used sparingly for detail lines
  ink: "#15130F", // buttons, headlines, primary text
  text: "#221F1A",
  muted: "#71695B",
  border: "#ECE4D2",
  card: "#FFFFFF",
  shadow: "0 18px 36px -18px rgba(21,19,15,0.18)",
  navy: "#1B2340",
};

const FONT_DISPLAY = "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif";

// Hero colours, in this order when the garment has them.
const HERO_ORDER = ["black", "white", "maroon", "navy", "bottle-green", "lavender", "beige", "royal-blue"];

const FOOTER_LINKS = {
  "Customise Products": [
    "Women's Polo",
    "Acid Wash Oversize T-Shirt",
    "Pure Cotton V Neck T-Shirt",
    "Optic Wash Oversize T-Shirt",
    "Pure Cotton Oversized Roundneck T-shirt",
    "Pure Cotton Long Sleeve T-Shirt",
    "Dense Oversize T-Shirt",
    "Pure Cotton Round Neck T-Shirt",
  ],
  "About Us": [
    "Our Story",
    "Team",
    "Contact us",
    "Privacy policy",
    "Payment",
    "Return and Refunds",
    "Shipping Policy",
    "Terms and conditions",
  ],
  "Work With Us": [
    "Bulk & Custom Orders",
    "Become A Partner",
    "The Seller Academy",
  ],
};

function MailIcon({ size = 18, color = C.ink }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
    >
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M3 5.5l7 5.5 7-5.5" />
    </svg>
  );
}
function PhoneIcon({ size = 18, color = C.ink }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <path d="M6.6 2.6 4 3.9c-1 .5-1.4 1.7-.9 2.7C5 11 9 15 13.4 16.9c1 .4 2.2 0 2.7-.9l1.3-2.6a1.2 1.2 0 0 0-.5-1.6l-2.8-1.4a1.2 1.2 0 0 0-1.4.2l-1 1a10 10 0 0 1-4.3-4.3l1-1c.4-.4.5-1 .2-1.4L7.2 2.1a1.2 1.2 0 0 0-1.6.5Z" />
    </svg>
  );
}
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

function Footer({ settings = {} }) {
  const email =
    settings["general.storeEmail"] ||
    settings["general.supportEmail"] ||
    "work@yourdesignstore.in";
  const phone = settings["general.phoneNumber"] || "+91 636 652 6449";
  const whatsapp = settings["general.whatsappNumber"] || "+91 994 590 0292";
  const phoneDigits = phone.replace(/\D/g, "");
  const whatsappDigits = whatsapp.replace(/\D/g, "");
  const storeName = settings["general.storeName"] || "Identee";
  const address =
    settings["general.businessAddress"] || "Coimbatore, Tamil Nadu";
  const mapQuery = encodeURIComponent(address);

  return (
    <footer style={{ background: C.bg }}>
      {/* ---- contact band ---- */}
      <div style={{ background: "#F3F1EC", padding: "48px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(26px, 3.4vw, 36px)",
              color: C.ink,
            }}
          >
            Contact Us
          </h2>
          <div
            style={{
              display: "flex",
              gap: 36,
              flexWrap: "wrap",
              marginTop: 22,
            }}
          >
            <a
              href={`mailto:${email}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: C.ink,
                textDecoration: "none",
                fontSize: 15,
              }}
            >
              <MailIcon /> {email}
            </a>
            <a
              href={`tel:+${phoneDigits}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: C.ink,
                textDecoration: "none",
                fontSize: 15,
              }}
            >
              <PhoneIcon /> {phone}
            </a>
            <a
              href={`https://wa.me/${whatsappDigits}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: C.ink,
                textDecoration: "none",
                fontSize: 15,
              }}
            >
              <WhatsAppIcon color={C.ink} /> {whatsapp}
            </a>
          </div>
        </div>
      </div>

      {/* ---- link columns + map ---- */}
      <div
        style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px 60px" }}
      >
        <div className="identee-footer-grid">
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 800,
                  color: C.ink,
                }}
              >
                {heading}
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {links.map((link) => (
                  <li key={link} style={{ marginBottom: 10 }}>
                    <a
                      href="#"
                      style={{
                        fontSize: 13.5,
                        color: C.muted,
                        textDecoration: "none",
                      }}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 800,
                color: C.ink,
              }}
            >
              Location
            </p>
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: `1px solid ${C.border}`,
                height: 200,
              }}
            >
              <iframe
                title="Store location"
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                width="100%"
                height="100%"
                style={{ border: 0, display: "block" }}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: "18px 24px",
          textAlign: "center",
          fontSize: 12,
          color: C.muted,
        }}
      >
        © {new Date().getFullYear()} {storeName}. All rights reserved.
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  FLOATING SOCIAL — WhatsApp + Instagram, fixed on the left edge     */
/* ------------------------------------------------------------------ */
function FloatingSocial({ settings = {} }) {
  const whatsapp = settings["general.whatsappNumber"] || "+91 994 590 0292";
  const whatsappDigits = whatsapp.replace(/\D/g, "");

  const instagramRaw = settings["general.instagramUrl"];
  const instagramHref = instagramRaw
    ? instagramRaw.startsWith("http")
      ? instagramRaw
      : `https://instagram.com/${instagramRaw.replace(/^@/, "")}`
    : "https://instagram.com";

  return (
    <div className="identee-floating-social">
      <a
        href={`https://wa.me/${whatsappDigits}`}
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
  const { items: categories } = useSelector((s) => s.categories);
  const { items: garmentTypes } = useSelector((s) => s.garmentType);
  const { items: garmentImages } = useSelector((s) => s.garmentImage);
  const { videoBanners } = useSelector((s) => s.banner);
  const { values: publicSettings, isLoaded: settingsLoaded } = useSelector((s) => s.publicSettings);
  const [products, setProducts] = useState([]); // featured (topped up with newest)
  const root = useRef(null);

  useEffect(() => {
    dispatch(fetchCategories());
    dispatch(fetchGarmentTypes()); // live customizable garments only
    dispatch(fetchAllGarmentImages());
    dispatch(getVideoBanner());
    if (!settingsLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, settingsLoaded]);

  // featured ready-made tees; fewer than 4 → add the newest ones
  useEffect(() => {
    let alive = true;
    Promise.all([
      shopService.listProducts({ featured: 1, limit: 8 }).catch(() => ({ items: [] })),
      shopService.listProducts({ limit: 8 }).catch(() => ({ items: [] })),
    ]).then(([f, n]) => {
      if (!alive) return;
      const list = [...f.items];
      for (const p of n.items) if (list.length < 8 && !list.some((x) => x.groupId === p.groupId)) list.push(p);
      // only products whose photos are stored online (old local paths are broken)
      setProducts(list.filter((p) => /^https?:\/\//.test(p.images?.[0] || "")));
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
  const liveCategories = categories.filter((c) => !c.comingSoon);
  const ready = {
    categoryCount: liveCategories.length,
    productCount: liveCategories.reduce((n, c) => n + (c.productCount || 0), 0),
  };
  // the ready-made card shows three garment photos (always clean, same backdrop)
  const stackPhotos = colours.slice(2, 5).map((c) => c.front);

  useReveal(root, [products.length, colours.length]);

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
        @media (max-width: 720px) {
          .identee-floating-social { left: 10px; gap: 10px; }
          .identee-floating-btn { width: 38px; height: 38px; }
        }
      `}</style>
      <FloatingSocial settings={publicSettings} />

      <HomeHero garment={garment} colours={colours.slice(0, 6)} printCm={printCm} />
      <HomeMarquee />
      <HomeWays garment={garment} customPhoto={garment ? coverPhoto(garment, garmentImages) : null} stackPhotos={stackPhotos} custom={custom} ready={ready} />
      <HomeSteps />
      <HomeFeatured products={products} />
      <HomePromises tight={products.length < 3} />
      <HomeOutlook main={video("styleOutlookMain", subVideo1)} side1={video("styleOutlookSide1", hoodieVideo)} side2={video("styleOutlookSide2", polosVideo)} />
      <HomeFinal garment={garment} photos={colours.map((c) => c.front)} />

      <Footer settings={publicSettings} />
    </div>
  );
}
