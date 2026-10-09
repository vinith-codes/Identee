// pages/Home.jsx
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { fetchCategories } from "../redux/slices/categorySlice";
import ShopChoices from "../components/ShopChoices";
import { coverPhoto, isSellable } from "../utils/garments";
import { fetchGarmentTypes } from "../redux/slices/garmentTypeSlice";
import { fetchAllGarmentImages } from "../redux/slices/garmentImageSlice";
import { getVideoBanner } from "../redux/slices/bannerSlice";
import homeBannerVideo from "../assets/videos/homebanner-video.mp4";
import customizeVideo from "../assets/videos/sub-video2.mp4";
import subVideo1 from "../assets/videos/sub-video1.mp4";
import subVideo7 from "../assets/videos/sub-video7.mp4";
import subVideo8 from "../assets/videos/sub-video8.mp4";
import subVideo9 from "../assets/videos/suv-video9.mp4";
import hoodieVideo from "../assets/videos/hoodie.mp4";
import polosVideo from "../assets/videos/polos.mp4";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";
import { imageUrl } from "../utils/imageUrl";

/* ------------------------------------------------------------------ */
/*  PALETTE — white base, yellow accent, black ink (NO dark bg)       */
/* ------------------------------------------------------------------ */
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
const PASTELS = [
  "#ECECEC",
  "#E7DEF3",
  "#D8ECE6",
  "#F6DCE3",
  "#FDEFD9",
  "#DDEAF6",
];
// color-morph themes for the hero "pick a color" widget
const HERO_COLOR_THEMES = [
  { name: "Amber Glow", dot: "#E3963B", from: "#F8CE86", to: "#D9843A" },
  { name: "Mystic Mauve", dot: "#8C6FE8", from: "#C3B2F8", to: "#6A54C8" },
  { name: "Fresh Moss", dot: "#6FA35A", from: "#BEDBA0", to: "#598F62" },
];
const HERO_PRODUCTS = ["Tees", "Hoodie", "Pants"];
// tiny flat garment glyphs, tinted with the active color
function GarmentIcon({ type, color }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: color };
  if (type === "Hoodie") {
    return (
      <svg {...common}>
        <path d="M12 2c-1.4 0-2.6.8-3.2 2L6 5.4C4.8 6 4 7.2 4 8.6V11l2-.6V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9.6l2 .6V8.6c0-1.4-.8-2.6-2-3.2l-2.8-1.4A3.6 3.6 0 0 0 12 2Zm0 2.2c.7 0 1.3.3 1.7.9l.4.6H9.9l.4-.6c.4-.6 1-.9 1.7-.9Z" />
      </svg>
    );
  }
  if (type === "Pants") {
    return (
      <svg {...common}>
        <path d="M6 2h12l.9 18.9a1 1 0 0 1-1 1.1h-2.4a1 1 0 0 1-1-.9L13.6 12h-1.2l-.9 9.1a1 1 0 0 1-1 .9H8.1a1 1 0 0 1-1-1.1L6 2Z" />
      </svg>
    );
  }
  // Tee
  return (
    <svg {...common}>
      <path d="M8 2 4 5v4l2.5-.9V21a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8.1L20 9V5l-4-3-1 1.6a2.8 2.8 0 0 1-6 0L8 2Z" />
    </svg>
  );
}

function HeroColorWidget({ activeIdx, setActiveIdx, navigate }) {
  const active = HERO_COLOR_THEMES[activeIdx];
  return (
    <>
      {/* morphing silk gradient — crossfades between themes */}
      {HERO_COLOR_THEMES.map((theme, i) => (
        <div
          key={theme.name}
          style={{
            position: "absolute",
            inset: 0,
            opacity: activeIdx === i ? 1 : 0,
            transition: "opacity 0.7s ease",
            background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)`,
          }}
        />
      ))}

      {/* Buy Now pill */}
      <button
        className="identee-cta-btn"
        onClick={() => navigate("/shop")}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 18px",
          borderRadius: 999,
          border: "none",
          background: C.ink,
          color: C.bg,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          zIndex: 2,
        }}
      >
        Buy Now <span style={{ fontSize: 14 }}>↗</span>
      </button>

      {/* Tees / Hoodie / Pants cards with color dots */}
      <div
        style={{
          position: "absolute",
          bottom: 18,
          right: 18,
          display: "flex",
          gap: 10,
          zIndex: 2,
        }}
      >
        {HERO_PRODUCTS.map((label) => (
          <div
            key={label}
            style={{
              background: "rgba(255,255,255,0.94)",
              borderRadius: 14,
              padding: "10px 10px 12px",
              width: 76,
              textAlign: "center",
              boxShadow: C.shadow,
            }}
          >
            <div
              style={{
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GarmentIcon type={label} color={active.dot} />
            </div>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 11,
                fontWeight: 700,
                color: C.ink,
              }}
            >
              {label}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 5,
                marginTop: 7,
              }}
            >
              {HERO_COLOR_THEMES.map((theme, i) => (
                <button
                  key={theme.name}
                  onClick={() => setActiveIdx(i)}
                  aria-label={theme.name}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    padding: 0,
                    cursor: "pointer",
                    background: theme.dot,
                    border:
                      activeIdx === i
                        ? `2px solid ${C.ink}`
                        : "2px solid transparent",
                    boxSizing: "content-box",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const FONT_DISPLAY =
  "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

// Heading for the two home-page shopping sections.
function HomeSectionHeading({ eyebrow, title, text }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: "0.2em",
          color: C.gold,
          textTransform: "uppercase",
          fontWeight: 800,
        }}
      >
        {eyebrow}
      </p>
      <h2
        style={{
          margin: "6px 0 6px",
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: "clamp(24px, 3vw, 34px)",
          color: C.ink,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <p style={{ margin: 0, color: C.muted, fontSize: 15, maxWidth: 620 }}>{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CONTENT                                                            */
/* ------------------------------------------------------------------ */
const MARQUEE_WORDS = [
  "NEW ARRIVALS",
  "FREE SHIPPING",
  "SINGLE PIECE ORDERS",
  "360° CUSTOMISATION",
  "PAN INDIA DELIVERY",
  "ZERO PLASTIC PACKAGING",
];

const FAVOURITES = [
  { name: "Trending", tag: "Explore Now", video: subVideo9 },
  { name: "Trending", tag: "Explore Now", video: subVideo8 },
  { name: "Trending", tag: "Explore Now", video: subVideo1 },
];

/* ------------------------------------------------------------------ */
/*  SMALL HELPERS                                                      */
/* ------------------------------------------------------------------ */
function PastelCard({ item, bg, big }) {
  return (
    <div
      className="identee-pastel-card"
      style={{
        background: bg,
        borderRadius: 18,
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ aspectRatio: big ? "3/4" : "4/5", overflow: "hidden" }}>
        {item.video ? (
          <video
            autoPlay
            muted
            loop
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          >
            <source src={item.video} type="video/mp4" />
          </video>
        ) : (
          <img
            src={item.img}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
      <div
        style={{
          padding: "14px 16px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
          {item.name}
        </span>
        <span
          style={{
            fontSize: 12,
            color: C.muted,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {item.tag} →
        </span>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  STYLE OUTLOOK — big video + two side videos, editorial layout      */
/* ------------------------------------------------------------------ */
function StyleOutlookSection({ mainVideoSrc, side1VideoSrc, side2VideoSrc }) {
  return (
    <section style={{ background: C.ink, padding: "48px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(28px, 4vw, 44px)",
              color: "#FFF8EC",
            }}
          >
            Style Outlook
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: 320,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#C9C2B2",
              textAlign: "right",
            }}
          >
            Make simplicity your boldest statement, experience crafted
            essentials with an excellent purpose.
          </p>
        </div>
        <div className="identee-style-outlook-grid">
          <div className="identee-style-outlook-main">
            <video key={mainVideoSrc} autoPlay muted loop playsInline>
              <source src={mainVideoSrc} type="video/mp4" />
            </video>
          </div>
          <div className="identee-style-outlook-side">
            <div className="identee-style-outlook-side-item">
              <video key={side1VideoSrc} autoPlay muted loop playsInline>
                <source src={side1VideoSrc} type="video/mp4" />
              </video>
            </div>
            <div className="identee-style-outlook-side-item">
              <video key={side2VideoSrc} autoPlay muted loop playsInline>
                <source src={side2VideoSrc} type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    name: "Reo Raymond",
    role: "Radio Indigo 91.9FM",
    video: subVideo7,
    quote:
      "Total value for money — right from material and customising to the pricing. Very honest with the business.",
  },
  {
    name: "Vineeth Vincent",
    role: "Beat-boxer / MC",
    video: subVideo8,
    quote:
      "I've been ordering from this brand for years and haven't been dissatisfied a single time.",
  },
  {
    name: "Arushi Parashar",
    role: "Amazon India",
    video: subVideo9,
    quote:
      "They are the kind of people I love working with — solution finders, not problem highlighters.",
  },
  {
    name: "Jayanth Joseph",
    role: "Ernst & Young",
    video: subVideo7,
    quote:
      "Great quality merchandise and amazing design suggestions. Recommended for corporate gifting.",
  },
];

/* ------------------------------------------------------------------ */
/*  FOOTER — contact band, link columns, map, matching reference       */
/* ------------------------------------------------------------------ */
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
  const [heroColorIdx, setHeroColorIdx] = useState(0);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items: categories } = useSelector(
    (s) => s.categories,
  );
  const { items: garmentTypes } = useSelector((s) => s.garmentType);
  const { items: garmentImages } = useSelector((s) => s.garmentImage);
  const { videoBanners } = useSelector((s) => s.banner);
  const { values: publicSettings, isLoaded: settingsLoaded } = useSelector(
    (s) => s.publicSettings,
  );

  // Helper: find the admin-uploaded video for a given section, e.g. "hero"
  const getSectionVideoUrl = (section) => {
    const match = (videoBanners || []).find((v) => v.section === section);
    return match?.videoUrl ? imageUrl(match.videoUrl) : null;
  };

  // Each section falls back to its bundled local clip if no admin
  // video has been uploaded yet for that section.
  const heroVideoSrc = getSectionVideoUrl("hero") || homeBannerVideo;
  const styleOutlookMainSrc =
    getSectionVideoUrl("styleOutlookMain") || subVideo1;
  const styleOutlookSide1Src =
    getSectionVideoUrl("styleOutlookSide1") || hoodieVideo;
  const styleOutlookSide2Src =
    getSectionVideoUrl("styleOutlookSide2") || polosVideo;
  // Summaries for the two "how would you like to shop?" cards.
  const sellable = garmentTypes.filter((g) => isSellable(g, garmentImages));
  const customizableSummary = {
    count: sellable.length,
    fromPrice: sellable.length ? Math.min(...sellable.map((g) => g.basePrice)) : null,
    image: sellable.length ? coverPhoto(sellable[0], garmentImages) : null,
  };
  const liveCategories = categories.filter((c) => !c.comingSoon);
  const readyMadeSummary = {
    categoryCount: liveCategories.length,
    productCount: liveCategories.reduce((n, c) => n + (c.productCount || 0), 0),
    image: liveCategories.find((c) => c.image)?.image || null,
  };

  const designYourOwnVideoSrc =
    getSectionVideoUrl("designYourOwn") || customizeVideo;

  useEffect(() => {
    dispatch(fetchCategories());
    dispatch(fetchGarmentTypes()); // live customizable garments only
    dispatch(fetchAllGarmentImages());
    dispatch(getVideoBanner());
    if (!settingsLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, settingsLoaded]);

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        fontFamily: FONT_BODY,
        overflowX: "hidden",
      }}
    >
      <style>{`
        @keyframes identee-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .identee-pastel-card { transition: transform 0.4s cubic-bezier(.2,.8,.2,1), box-shadow 0.4s ease; }
        .identee-pastel-card:hover { transform: translateY(-6px); box-shadow: 0 20px 34px -18px rgba(21,19,15,0.22); }
        .identee-pastel-card img { transition: transform 0.6s ease; }
        .identee-pastel-card:hover img { transform: scale(1.06); }
        .identee-cta-btn { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .identee-cta-btn:hover { transform: translateY(-2px); }
        .identee-testimonial-avatar { position: relative; width: 56px; height: 56px; border-radius: 50%; overflow: hidden; margin-bottom: 14px; border: 1px solid ${C.border}; background: ${C.bg}; }
        .identee-testimonial-avatar video { position: absolute; top: 50%; left: 50%; width: 100%; height: 100%; min-width: 100%; min-height: 100%; transform: translate(-50%, -50%); object-fit: cover; object-position: center; }

       /* ---- style outlook editorial grid ---- */
        .identee-style-outlook-grid {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          grid-template-rows: 560px;
          gap: 18px;
        }
        .identee-style-outlook-main, .identee-style-outlook-side-item {
          border-radius: 18px;
          overflow: hidden;
          height: 100%;
        }
        .identee-style-outlook-side { display: flex; flex-direction: column; gap: 14px; height: 100%; }
        .identee-style-outlook-side-item { min-height: 0; }
        .identee-style-outlook-side-item:nth-child(1) { flex: 1.6; }
        .identee-style-outlook-side-item:nth-child(2) { flex: 1; }
        .identee-style-outlook-main video, .identee-style-outlook-side-item video {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

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
          .hero-color-widget { display: none !important; }
          .identee-floating-social { left: 10px; gap: 10px; }
          .identee-floating-btn { width: 38px; height: 38px; }

          /* single column, uniform cards on mobile — bento pattern off */
          .identee-cat-banner-grid {
            grid-template-columns: 1fr;
            grid-auto-rows: 220px;
          }
          .identee-cat-banner-grid > * {
            grid-column: span 1 !important;
            grid-row: span 1 !important;
          }

         .identee-style-outlook-grid {
            grid-template-columns: 1fr;
            grid-template-rows: 420px 220px;
          }
          .identee-style-outlook-side { flex-direction: row; }
          .identee-style-outlook-side-item:nth-child(1),
          .identee-style-outlook-side-item:nth-child(2) { flex: 1; }
        }
      `}</style>

      <FloatingSocial settings={publicSettings} />

      {/* ================= HERO — full-bleed video background (unchanged) ================= */}
      <section
        style={{
          position: "relative",
          minHeight: "82vh",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <video
          key={heroVideoSrc}
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
          }}
        >
          <source src={heroVideoSrc} type="video/mp4" />
        </video>

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, rgba(21,19,15,0.82) 0%, rgba(21,19,15,0.55) 45%, rgba(21,19,15,0.28) 100%)",
            zIndex: 1,
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1280,
            width: "100%",
            margin: "0 auto",
            padding: "40px 24px",
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                letterSpacing: "0.24em",
                color: C.yellow,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              IDENTEE — SIGNATURE STREETWEAR
            </p>
            <h1
              style={{
                margin: "22px 0 0",
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: "clamp(40px, 6vw, 64px)",
                lineHeight: 1.05,
                color: "#FFF8EC",
              }}
            >
              LET&apos;S EXPLORE
              <br />
              <span
                style={{
                  background: C.yellow,
                  color: C.ink,
                  padding: "2px 10px",
                  borderRadius: 8,
                }}
              >
                UNIQUE
              </span>
              <br />
              CLOTHES.
            </h1>
            <p
              style={{
                margin: "24px 0 0",
                maxWidth: 380,
                fontSize: 15,
                lineHeight: 1.7,
                color: "#E4D9C4",
              }}
            >
              Custom-built apparel for brands, teams and individuals —
              single-piece orders, 360° design preview, delivered pan India in
              days, not weeks.
            </p>
            <button
              className="identee-cta-btn"
              onClick={() => navigate("/shop")}
              style={{
                marginTop: 32,
                padding: "15px 34px",
                borderRadius: 10,
                border: "none",
                background: C.yellow,
                color: C.ink,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Shop Now
            </button>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            zIndex: 3,
            bottom: 32,
            right: 32,
            width: 320,
            height: 210,
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 24px 48px -20px rgba(0,0,0,0.45)",
          }}
          className="hero-color-widget"
        >
          <HeroColorWidget
            activeIdx={heroColorIdx}
            setActiveIdx={setHeroColorIdx}
            navigate={navigate}
          />
        </div>
      </section>

      {/* ================= MARQUEE STRIP (unchanged) ================= */}
      <div
        style={{
          background: C.yellow,
          overflow: "hidden",
          whiteSpace: "nowrap",
          padding: "16px 0",
          marginTop: 60,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            animation: "identee-marquee 22s linear infinite",
          }}
        >
          {[...MARQUEE_WORDS, ...MARQUEE_WORDS, ...MARQUEE_WORDS].map(
            (w, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 18,
                  color: C.ink,
                  margin: "0 26px",
                  letterSpacing: "0.02em",
                }}
              >
                {w}
                <span style={{ margin: "0 26px", fontSize: 13 }}>✦</span>
              </span>
            ),
          )}
        </div>
      </div>

      {/* ================= TWO WAYS TO SHOP =================
          Customizable → /customizable (Admin → Customizable garments)
          Ready-made   → /ready-made   (Admin → Storefront → Categories) */}
      <section id="shop" style={{ padding: "56px 24px", maxWidth: 1280, margin: "0 auto" }}>
        <HomeSectionHeading
          eyebrow="Shop"
          title="How would you like to shop?"
          text="Design your own tee, or pick from our ready-made collections."
        />
        <ShopChoices customizable={customizableSummary} readyMade={readyMadeSummary} />
      </section>

      {/* ================= STYLE OUTLOOK — VIDEO EDITORIAL ================= */}
      <StyleOutlookSection
        mainVideoSrc={styleOutlookMainSrc}
        side1VideoSrc={styleOutlookSide1Src}
        side2VideoSrc={styleOutlookSide2Src}
      />

      {/* ================= DESIGN YOUR OWN — replaces Bulk Order band ================= */}
      <section
        style={{
          margin: "24px 24px 48px",
          maxWidth: 1280,
          marginLeft: "auto",
          marginRight: "auto",
          background: C.yellow,
          borderRadius: 28,
          padding: "56px 48px",
          display: "grid",
          gridTemplateColumns: "0.9fr 1.1fr",
          gap: 40,
          alignItems: "stretch",
          overflow: "visible",
          boxShadow: "0 30px 60px -30px rgba(21,19,15,0.28)",
        }}
      >
        <div style={{ position: "relative", aspectRatio: "1/1" }}>
          <div
            style={{
              position: "absolute",
              top: 14,
              right: -14,
              width: "100%",
              height: "100%",
              background: C.ink,
              borderRadius: 20,
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              borderRadius: 20,
              overflow: "hidden",
              height: "100%",
              boxShadow: "0 18px 36px -16px rgba(21,19,15,0.35)",
            }}
          >
            <video
              key={designYourOwnVideoSrc}
              autoPlay
              muted
              loop
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            >
              <source src={designYourOwnVideoSrc} type="video/mp4" />
            </video>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            textAlign: "center",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(20px, 2.6vw, 28px)",
              color: C.ink,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
            }}
          >
            Your Style,
            <br />
            Your Story,
            <br />
            <span
              style={{
                background: C.ink,
                color: C.yellow,
                padding: "2px 10px",
                display: "inline-block",
              }}
            >
              Your Identee
            </span>
          </h3>
          <h2
            style={{
              margin: "22px 0 0",
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(30px, 4.4vw, 48px)",
              color: C.ink,
              lineHeight: 1.08,
            }}
          >
            DESIGN YOUR
            <br />
            OWN
          </h2>
          <p
            style={{
              margin: "18px 0 0",
              fontSize: 14.5,
              color: C.ink,
              maxWidth: 400,
              lineHeight: 1.65,
              opacity: 0.85,
            }}
          >
            Drop your own artwork, pick placement and preview it live on the
            garment — our 360° customiser lets you build a piece that's entirely
            yours before you order.
          </p>
          <button
            className="identee-cta-btn"
            onClick={() => navigate("/customize")}
            style={{
              marginTop: 26,
              padding: "15px 32px",
              borderRadius: 10,
              border: "none",
              background: C.ink,
              color: C.bg,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "0 12px 24px -8px rgba(21,19,15,0.4)",
            }}
          >
            Start Customising
          </button>
          <div
            style={{
              display: "flex",
              gap: 36,
              marginTop: 34,
              justifyContent: "center",
            }}
          >
            {[
              ["Drag & Drop", "Your artwork"],
              ["Live Preview", "360° view"],
              ["Pan India", "Shipping"],
            ].map(([val, label]) => (
              <div key={label}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.ink,
                  }}
                >
                  {val}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 10.5,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: C.ink,
                    opacity: 0.65,
                  }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <Footer settings={publicSettings} />
    </div>
  );
}
