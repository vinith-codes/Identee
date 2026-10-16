// pages/ContactUs.jsx
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";

/* ------------------------------------------------------------------ */
/*  Same palette + fonts as Home.jsx                                   */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#FFFFFF",
  bgAlt: "#FBF7EE",
  yellow: "#C9A24B", // the site gold (was a brighter yellow, #F4C43C)
  yellowDeep: "#B8912F",
  ink: "#15130F",
  text: "#221F1A",
  muted: "#71695B",
  border: "#ECE4D2",
  shadow: "0 18px 36px -18px rgba(21,19,15,0.18)",
};

const FONT_DISPLAY =
  "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/* ------------------------------------------------------------------ */
/*  Icons — same set as Footer in Home.jsx                             */
/* ------------------------------------------------------------------ */
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
function PinIcon({ size = 18, color = C.ink }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
    >
      <path d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18Z" />
      <circle cx="10" cy="8.4" r="2.2" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact info row                                                   */
/* ------------------------------------------------------------------ */
function InfoRow({ icon, label, value, href }) {
  return (
    <a
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "18px 0",
        borderBottom: `1px solid ${C.border}`,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: C.bgAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: C.muted,
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 15,
            fontWeight: 600,
            color: C.ink,
          }}
        >
          {value}
        </p>
      </div>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact form                                                       */
/* ------------------------------------------------------------------ */
const FIELD_STYLE = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontSize: 14,
  fontFamily: FONT_BODY,
  color: C.ink,
  background: "#FFF",
  outline: "none",
  boxSizing: "border-box",
};

function ContactForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [status, setStatus] = useState("idle"); // idle | sending | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setStatus("error");
      setErrorMsg("Please fill in your name, email and message.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      setForm({ name: "", email: "", phone: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        "Something went wrong sending your message. Please try again or reach us directly.",
      );
    }
  };

  if (status === "success") {
    return (
      <div
        style={{
          background: C.bgAlt,
          borderRadius: 16,
          padding: "40px 28px",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 22,
            color: C.ink,
          }}
        >
          Message sent.
        </h3>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: C.muted }}>
          Thanks for reaching out — our team will get back to you shortly.
        </p>
        <button
          onClick={() => setStatus("idle")}
          style={{
            marginTop: 22,
            padding: "12px 26px",
            borderRadius: 10,
            border: "none",
            background: C.ink,
            color: "#FFF8EC",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
        className="identee-contact-grid"
      >
        <div>
          <label style={labelStyle}>Full Name</label>
          <input
            style={FIELD_STYLE}
            value={form.name}
            onChange={update("name")}
            placeholder="Your name"
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            style={FIELD_STYLE}
            value={form.email}
            onChange={update("email")}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Phone (optional)</label>
        <input
          style={FIELD_STYLE}
          value={form.phone}
          onChange={update("phone")}
          placeholder="+91 00000 00000"
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Message</label>
        <textarea
          style={{ ...FIELD_STYLE, resize: "vertical", minHeight: 130 }}
          value={form.message}
          onChange={update("message")}
          placeholder="Tell us about your order, quantity, and timeline..."
        />
      </div>

      {status === "error" && (
        <p style={{ marginTop: 12, fontSize: 13, color: "#C0392B" }}>
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        style={{
          marginTop: 20,
          padding: "15px 32px",
          borderRadius: 999,
          border: "none",
          background: status === "sending" ? C.yellowDeep : C.yellow,
          color: C.ink,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: status === "sending" ? "default" : "pointer",
          opacity: status === "sending" ? 0.75 : 1,
        }}
      >
        {status === "sending" ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: 7,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.muted,
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function ContactUs() {
  const dispatch = useDispatch();
  const { values: publicSettings, isLoaded: settingsLoaded } = useSelector(
    (s) => s.publicSettings,
  );

  useEffect(() => {
    if (!settingsLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, settingsLoaded]);

  // only what Admin → Settings → General says (nothing until it loads — no old fallback numbers)
  const email =
    publicSettings["general.storeEmail"] ||
    publicSettings["general.supportEmail"] ||
    "";
  const phone = publicSettings["general.phoneNumber"];
  const whatsapp = publicSettings["general.whatsappNumber"] || phone || "";
  const address = publicSettings["general.businessAddress"] || "";
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  const whatsappDigits = String(whatsapp).replace(/\D/g, "");
  const waDigits = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;
  const mapQuery = encodeURIComponent(address);
  const storeName = publicSettings["general.storeName"] || "Identee";

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
        @media (max-width: 900px) {
          .identee-contact-layout { grid-template-columns: 1fr !important; }
          .identee-contact-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ================= HERO ================= */}
      <section style={{ background: C.ink, padding: "72px 24px 56px" }}>
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
            Get In Touch
          </p>
          <h1
            style={{
              margin: "18px 0 0",
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: "clamp(32px, 4.6vw, 52px)",
              lineHeight: 1.08,
              color: "#FFF8EC",
              maxWidth: 640,
            }}
          >
            Let's build something that's entirely yours.
          </h1>
          <p
            style={{
              margin: "18px 0 0",
              maxWidth: 520,
              fontSize: 15,
              lineHeight: 1.75,
              color: "#C9C2B2",
            }}
          >
            Whether it's a single custom piece or a bulk order for your team,
            school, or event — tell us what you need and we'll get back to you.
          </p>
        </div>
      </section>

      {/* ================= FORM + INFO ================= */}
      <section
        style={{ padding: "56px 24px", maxWidth: 1280, margin: "0 auto" }}
      >
        <div
          className="identee-contact-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 48,
          }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 22px",
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: "clamp(20px, 2.6vw, 26px)",
                color: C.ink,
              }}
            >
              Send us a message
            </h2>
            <ContactForm />
          </div>

          <div>
            <h2
              style={{
                margin: "0 0 6px",
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: "clamp(20px, 2.6vw, 26px)",
                color: C.ink,
              }}
            >
              Reach us directly
            </h2>
            <p style={{ margin: "0 0 6px", fontSize: 13.5, color: C.muted }}>
              Prefer a call or a chat? We're around most business days.
            </p>

            {email && (
              <InfoRow
                icon={<MailIcon />}
                label="Email"
                value={email}
                href={`mailto:${email}`}
              />
            )}
            {phone && (
              <InfoRow
                icon={<PhoneIcon />}
                label="Phone"
                value={phone}
                href={`tel:+${phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits}`}
              />
            )}
            {whatsapp && (
              <InfoRow
                icon={<WhatsAppIcon color={C.ink} />}
                label="WhatsApp"
                value={whatsapp}
                href={`https://wa.me/${waDigits}`}
              />
            )}
            {address && <InfoRow icon={<PinIcon />} label="Address" value={address} />}

            {/* (the footer below leaves its own map out on this page) */}
            {address && <div
              style={{
                marginTop: 22,
                borderRadius: 14,
                overflow: "hidden",
                border: `1px solid ${C.border}`,
                height: 220,
              }}
            >
              <iframe
                title={`${storeName} location`}
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                width="100%"
                height="100%"
                style={{ border: 0, display: "block" }}
                loading="lazy"
              />
            </div>}
          </div>
        </div>
      </section>
    </div>
  );
}
