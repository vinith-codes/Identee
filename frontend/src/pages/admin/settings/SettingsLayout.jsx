import { useState } from "react";
import { THEME } from "../../../theme/theme";
import GeneralSettingsPage from "./GeneralSettingsPage";
import ProfileSettingsPage from "./ProfileSettingsPage";
import AiSettingsPage from "./AiSettingsPage";
import WhatsappSettingsPage from "./WhatsappSettingsPage";

const ICONS = {
  profile: (
    <svg viewBox="0 0 20 20" fill="currentColor" width={17} height={17}>
      <path d="M10 9a4 4 0 100-8 4 4 0 000 8zM10 11c-4.4 0-8 2.24-8 5v1a1 1 0 001 1h14a1 1 0 001-1v-1c0-2.76-3.6-5-8-5z" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 20 20" fill="currentColor" width={17} height={17}>
      <path d="M10 1l2.2 5.6L18 8.8l-5.8 2.2L10 17l-2.2-6L2 8.8l5.8-2.2L10 1z" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 20 20" fill="currentColor" width={17} height={17}>
      <path d="M10 2a8 8 0 00-6.9 12.04L2 18l4.06-1.07A8 8 0 1010 2zm0 1.6a6.4 6.4 0 11-3.3 11.88l-.24-.14-2.1.55.56-2.04-.16-.25A6.4 6.4 0 0110 3.6zm-2.6 3.1c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.13.17 1.75 2.8 4.33 3.8 2.14.84 2.58.67 3.04.63.47-.04 1.5-.61 1.71-1.2.21-.6.21-1.1.15-1.2-.06-.11-.23-.17-.48-.3-.25-.12-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.12-.17.25-.65.82-.8.99-.15.17-.29.19-.54.06-.25-.12-1.06-.39-2.01-1.24-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.5.11-.11.25-.29.38-.44.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.55-1.37-.77-1.87-.2-.48-.4-.42-.56-.43h-.48z" />
    </svg>
  ),
  general: (
    <svg viewBox="0 0 20 20" fill="currentColor" width={17} height={17}>
      <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5.586l-1.707-1.707A1 1 0 007 4H4z" />
    </svg>
  ),
};

// "Security" (change password) and "Appearance" (light/dark) were removed:
// login is by email code only, and the light theme was never wired up.
const SECTIONS = [
  { key: "general", label: "Store Branding", desc: "Name, logo, contact, socials" },
  { key: "ai", label: "AI designs", desc: "On / off, limits, spending" },
  { key: "whatsapp", label: "WhatsApp", desc: "Order updates to customers" },
  { key: "profile", label: "Profile", desc: "Name, email, photo" },
];

const PAGES = {
  general: GeneralSettingsPage,
  profile: ProfileSettingsPage,
  ai: AiSettingsPage,
  whatsapp: WhatsappSettingsPage,
};

export default function SettingsLayout() {
  const [active, setActive] = useState("general");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const theme = THEME; // was: const { theme } = useTheme();
  const ActivePage = PAGES[active];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        fontFamily: "'Inter', sans-serif",
        padding: "36px 44px",
      }}
      className="settings-shell"
    >
      {/* Mobile nav */}
      <div className="settings-mobile-nav" style={{ display: "none" }}>
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            fontSize: 13,
            fontWeight: 600,
            textAlign: "left",
            borderRadius: 10,
          }}
        >
          {SECTIONS.find((s) => s.key === active)?.label} ▾
        </button>
        {mobileNavOpen && (
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              marginTop: 6,
              overflow: "hidden",
            }}
          >
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setActive(s.key);
                  setMobileNavOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  background: active === s.key ? theme.goldBg : "transparent",
                  border: "none",
                  color: active === s.key ? theme.goldBright : theme.textMuted,
                  fontSize: 13,
                }}
              >
                {ICONS[s.key]}
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="settings-grid">
        {/* Desktop sidebar — elevated card */}
        <aside
          className="settings-sidebar"
          style={{
            background: `linear-gradient(160deg, ${theme.surface} 0%, ${theme.surface2} 100%)`,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: "26px 16px",
            boxShadow: theme.shadow,
            height: "fit-content",
          }}
        >
          <div style={{ padding: "0 10px", marginBottom: 22 }}>
            <p
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 600,
                color: theme.text,
                margin: 0,
              }}
            >
              Settings
            </p>
            <div
              style={{
                width: 34,
                height: 3,
                borderRadius: 2,
                marginTop: 8,
                background: `linear-gradient(90deg, ${theme.gold}, ${theme.goldBright})`,
              }}
            />
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SECTIONS.map((s) => {
              const isActive = active === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className="settings-nav-item"
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: isActive
                      ? `linear-gradient(135deg, ${theme.goldBg}, transparent)`
                      : "transparent",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.18s ease, transform 0.12s ease",
                    overflow: "hidden",
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 3,
                        height: "62%",
                        borderRadius: "0 3px 3px 0",
                        background: `linear-gradient(180deg, ${theme.gold}, ${theme.goldBright})`,
                      }}
                    />
                  )}
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isActive
                        ? `linear-gradient(135deg, ${theme.gold}, ${theme.goldBright})`
                        : theme.surface,
                      border: isActive ? "none" : `1px solid ${theme.border}`,
                      color: isActive ? theme.ink : theme.textMuted,
                      boxShadow: isActive
                        ? `0 3px 10px ${theme.goldBorder}`
                        : "none",
                      transition: "all 0.18s ease",
                    }}
                  >
                    {ICONS[s.key]}
                  </span>
                  <span
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? theme.goldBright : theme.text,
                        letterSpacing: "0.01em",
                      }}
                    >
                      {s.label}
                    </span>
                    <span style={{ fontSize: 11, color: theme.textFaint }}>
                      {s.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main style={{ minWidth: 0 }}>
          <div style={{ maxWidth: 760 }}>
            <ActivePage />
          </div>
        </main>
      </div>

      <style>{`
        .settings-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 28px;
          align-items: start;
        }
        .settings-nav-item:hover {
          background: ${theme.surface2} !important;
          transform: translateX(2px);
        }
        @media (max-width: 860px) {
          .settings-shell { padding: 20px !important; }
          .settings-grid { grid-template-columns: 1fr; }
          .settings-sidebar { display: none !important; }
          .settings-mobile-nav { display: block !important; margin-bottom: 16px; }
        }
      `}</style>
    </div>
  );
}
