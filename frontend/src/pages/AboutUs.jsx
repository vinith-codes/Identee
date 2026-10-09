// pages/AboutUs.jsx
import { useNavigate } from "react-router-dom";

// Client logos — same asset paths used in the other Identee build
import ohaaLogo from "../assets/clients/ohaa.png";
import shaheenLogo from "../assets/clients/shaheen.png";
import casagrandLogo from "../assets/clients/casagrand.png";
import avpTrustLogo from "../assets/clients/avp-trust.png";
import vidyaMandirLogo from "../assets/clients/vidya-mandir.png";
import bullRageLogo from "../assets/clients/bull-rage.png";
import equitasLogo from "../assets/clients/equitas.png";
import avisLogo from "../assets/clients/avis.png";
import smartModernSchoolLogo from "../assets/clients/smart-modern-school.png";
import vivekalayaLogo from "../assets/clients/vivekalaya-prakriya.png";

/* ------------------------------------------------------------------ */
/*  Same palette + fonts as Home.jsx — keep every page on one system  */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#FFFFFF",
  bgAlt: "#FBF7EE",
  yellow: "#F4C43C",
  yellowDeep: "#E3A72E",
  yellowSoft: "#FCEFC7",
  gold: "#C9A24B",
  ink: "#15130F",
  text: "#221F1A",
  muted: "#71695B",
  border: "#ECE4D2",
  card: "#FFFFFF",
  shadow: "0 18px 36px -18px rgba(21,19,15,0.18)",
  navy: "#1B2340",
};

const FONT_DISPLAY =
  "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */
const VALUES = [
  {
    title: "Made For You",
    body: "Every order starts as a blank canvas — your artwork, your placement, your fit. Nothing ships off a rack.",
  },
  {
    title: "Single Piece, No Minimums",
    body: "One t-shirt or a thousand — the same care and the same pricing logic apply either way.",
  },
  {
    title: "Finished By Hand",
    body: "Every print is checked and finished by a person in our workshop, not just a machine that ran once.",
  },
  {
    title: "Pan India, Fast",
    body: "From our cutting table to your doorstep anywhere in the country, without the usual weeks-long wait.",
  },
];

const JOURNEY = [
  {
    stage: "One Cutting Table",
    detail:
      "IDENTEE started small — a single table, a handful of designs, and a refusal to believe custom had to mean compromise.",
  },
  {
    stage: "In-House Printing",
    detail:
      "We brought printing and finishing under our own roof, so every piece is checked by hand before it leaves the building.",
  },
  {
    stage: "Pan India Delivery",
    detail:
      "Single-piece orders now reach customers, teams and colleges across the country — no bulk minimums required.",
  },
];

const CLIENTS = [
  { name: "Shaheen Group of Institutions", logo: shaheenLogo },
  { name: "A.V.P. Trust Public School", logo: avpTrustLogo },
  { name: "Vidya Mandir", logo: vidyaMandirLogo },
  { name: "Bull Rage", logo: bullRageLogo },
  { name: "Smart Modern School", logo: smartModernSchoolLogo },
  { name: "AVIS International School", logo: avisLogo },
  { name: "Vivekalaya's Prakriya", logo: vivekalayaLogo },
  { name: "Casagrand", logo: casagrandLogo },
  { name: "Equitas Small Finance Bank", logo: equitasLogo },
  { name: "OHAA", logo: ohaaLogo },
];

/* ------------------------------------------------------------------ */
/*  Client logo tile — renders the actual client logo image            */
/* ------------------------------------------------------------------ */
function ClientTile({ name, logo }) {
  return (
    <div
      className="identee-client-tile"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "18px 16px",
        height: 96,
      }}
    >
      <img
        src={logo}
        alt={name}
        title={name}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */
function ValueCard({ title, body }) {
  return (
    <div
      className="identee-value-card"
      style={{
        background: C.bgAlt,
        borderRadius: 18,
        padding: "26px 24px",
        border: `1px solid ${C.border}`,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 17,
          color: C.ink,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 13.5,
          lineHeight: 1.65,
          color: C.muted,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function JourneyRow({ stage, detail, index, total }) {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: C.yellow,
            border: `2px solid ${C.ink}`,
            flexShrink: 0,
          }}
        />
        {index < total - 1 && (
          <span
            style={{
              width: 2,
              flex: 1,
              background: C.border,
              marginTop: 4,
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: 36 }}>
        <p
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 18,
            color: C.ink,
          }}
        >
          {stage}
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            lineHeight: 1.7,
            color: C.muted,
            maxWidth: 480,
          }}
        >
          {detail}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  (the footer is components/SiteFooter.jsx, shown on every page)    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function AboutUs() {
  const navigate = useNavigate();

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
        .identee-value-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .identee-value-card:hover { transform: translateY(-4px); box-shadow: ${C.shadow}; }
        .identee-client-tile { transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease; }
        .identee-client-tile:hover { transform: translateY(-3px); box-shadow: ${C.shadow}; border-color: ${C.yellowDeep}; }

        @media (max-width: 900px) {
          .identee-about-values { grid-template-columns: repeat(2, 1fr) !important; }
          .identee-about-hero-grid { grid-template-columns: 1fr !important; }
          .identee-clients-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .identee-about-values { grid-template-columns: 1fr !important; }
          .identee-clients-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ================= HERO ================= */}
      <section style={{ background: C.ink, padding: "88px 24px 72px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
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
            The Identee Story
          </p>
          <h1
            style={{
              margin: "20px 0 0",
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(34px, 5vw, 56px)",
              lineHeight: 1.08,
              color: "#FFF8EC",
              maxWidth: 720,
            }}
          >
            Fashion that's made for you, not picked off a rack.
          </h1>
          <p
            style={{
              margin: "22px 0 0",
              maxWidth: 560,
              fontSize: 15,
              lineHeight: 1.75,
              color: "#C9C2B2",
            }}
          >
            IDENTEE began with a simple idea: everyone deserves clothing that
            feels like their own. We work with individuals, teams, colleges,
            startups, creators and businesses who want their fashion to say
            something real — one piece or a hundred. We're part of the{" "}
            <span style={{ color: C.yellow, fontWeight: 700 }}>
              VAST Group of Companies
            </span>
            , building trusted businesses since 2020.
          </p>
        </div>
      </section>

      {/* ================= VALUES ================= */}
      <section
        style={{ padding: "64px 24px", maxWidth: 1280, margin: "0 auto" }}
      >
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 12,
            letterSpacing: "0.2em",
            color: C.muted,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          What We Stand For
        </p>
        <div
          className="identee-about-values"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
          }}
        >
          {VALUES.map((v) => (
            <ValueCard key={v.title} {...v} />
          ))}
        </div>
      </section>

      {/* ================= JOURNEY ================= */}
      <section
        style={{
          background: C.bgAlt,
          padding: "64px 24px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p
            style={{
              margin: "0 0 30px",
              fontSize: 12,
              letterSpacing: "0.2em",
              color: C.muted,
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Our Journey
          </p>
          {JOURNEY.map((j, i) => (
            <JourneyRow key={j.stage} {...j} index={i} total={JOURNEY.length} />
          ))}
        </div>
      </section>

      {/* ================= CLIENTS ================= */}
      <section
        style={{ padding: "64px 24px", maxWidth: 1280, margin: "0 auto" }}
      >
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 12,
            letterSpacing: "0.2em",
            color: C.muted,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Trusted By
        </p>
        <h2
          style={{
            margin: "0 0 26px",
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: "clamp(22px, 3vw, 32px)",
            color: C.ink,
          }}
        >
          Schools, corporates & event brands who wear us.
        </h2>
        <div
          className="identee-clients-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 14,
          }}
        >
          {CLIENTS.map((c) => (
            <ClientTile key={c.name} name={c.name} logo={c.logo} />
          ))}
        </div>
      </section>

      {/* ================= CTA BAND ================= */}
      <section
        style={{
          margin: "8px 24px 48px",
          maxWidth: 1280,
          marginLeft: "auto",
          marginRight: "auto",
          background: C.yellow,
          borderRadius: 24,
          padding: "44px 40px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: "clamp(20px, 2.6vw, 28px)",
            color: C.ink,
            maxWidth: 520,
          }}
        >
          Got an idea? Let's put it on fabric.
        </h3>
        <button
          onClick={() => navigate("/contact-us")}
          style={{
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
          }}
        >
          Talk To Us
        </button>
      </section>

    </div>
  );
}
