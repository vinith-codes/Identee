// pages/admin/AdminHome.jsx
//
// The admin's first screen (as in the admin prototype):
//   1. "Set up your store" checklist — disappears when everything is done
//   2. "Needs your attention" — new orders, designs to print, reviews, low stock
//   3. Today's numbers (small strip) and quick actions
// All of it comes from GET /api/admin/home.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const C = {
  ink: "#141110",
  muted: "#6B6559",
  faint: "#A39C8C",
  border: "#E7DFCC",
  card: "#FFFFFF",
  cream: "#FFFBF1",
  gold: "#C9A24B",
  goldDeep: "#7A5B12",
  green: "#2E7D4F",
  greenBg: "#E3F2E8",
};

const TONES = {
  gold: { bg: "#FBEFD2", ink: "#7A5B12" },
  blue: { bg: "#E3ECF7", ink: "#21456F" },
  purple: { bg: "#EFE5F7", ink: "#5B2E7A" },
  red: { bg: "#F8E3DD", ink: "#8A2E17" },
};

const QUICK = [
  { to: "/admin/garment-types", label: "+ Customizable garment" },
  { to: "/admin/upload-product", label: "+ Ready-made product" },
  { to: "/admin/offers", label: "+ Coupon" },
];

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export default function AdminHome() {
  const { user } = useSelector((s) => s.auth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const [attempt, setAttempt] = useState(0); // bumped by "Try again"

  useEffect(() => {
    let alive = true;
    const token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    axios
      .get(`${BACKEND_URL}/api/admin/home`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setError("");
      })
      .catch((err) => {
        if (alive) setError(err.response?.data?.message || "Could not load the home page.");
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const firstName = (user?.name || "").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const steps = data?.steps || [];
  const required = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  const setupFinished = required.length > 0 && required.every((s) => s.done);
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const attention = data?.attention || [];

  const headline = !data
    ? ""
    : !setupFinished
      ? "Your store is almost ready. Start with the setup steps below."
      : attention.length
        ? "Here is what needs doing today."
        : "All caught up. Nothing needs you right now.";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", fontFamily: "'Inter', sans-serif", color: C.ink }}>
      <style>{`
        .ah-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; align-items: start; }
        .ah-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 960px) { .ah-grid { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 640px) { .ah-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .ah-row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 12px;
          border: 1px solid transparent; color: ${C.ink}; text-decoration: none; min-height: 44px; }
        a.ah-row:hover { background: ${C.cream}; border-color: ${C.border}; }
        .ah-todo { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px;
          border: 1px solid ${C.border}; background: #fff; color: ${C.ink}; text-decoration: none; min-height: 44px; }
        .ah-todo:hover { border-color: ${C.gold}; background: ${C.cream}; }
        .ah-pill { display: inline-flex; align-items: center; border: 1px solid #D7CCB3; background: #fff;
          border-radius: 999px; padding: 9px 16px; font-size: 13px; font-weight: 600; color: ${C.ink};
          text-decoration: none; min-height: 38px; box-sizing: border-box; }
        .ah-pill:hover { border-color: ${C.ink}; }
      `}</style>

      <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{today}</p>
      <h1 style={{ margin: "4px 0 6px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em" }}>
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p style={{ margin: "0 0 22px", color: C.muted, fontSize: 15 }}>{headline}</p>

      {error && (
        <div style={{ ...card, padding: 18, marginBottom: 20, borderColor: "#E8B4A8", background: "#FDF3F0" }}>
          {error}{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} style={linkBtn}>
            Try again
          </button>
        </div>
      )}

      {!data && !error && <p style={{ color: C.muted }}>Loading…</p>}

      {data && (
        <div className="ah-grid">
          {/* LEFT: setup checklist (until finished) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {!setupFinished && (
              <section style={{ ...card, padding: 22 }}>
                <h2 style={h2}>Set up your store</h2>
                <p style={{ margin: "4px 0 14px", color: C.muted, fontSize: 13 }}>
                  Finish these steps to start selling. This card disappears when you are done.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, height: 8, background: "#F0EADB", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: C.gold, borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {doneCount} of {steps.length} done
                  </span>
                </div>
                <div>
                  {steps.map((s, i) => (
                    <SetupStep key={s.key} step={s} num={i + 1} />
                  ))}
                </div>
              </section>
            )}

            <section style={{ ...card, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <h2 style={h2}>Today</h2>
                <Link to="/admin/reports" style={{ fontSize: 13, color: C.goldDeep, fontWeight: 600 }}>
                  See sales report
                </Link>
              </div>
              <div className="ah-stats">
                {data.today.map((k) => (
                  <div key={k.key} style={{ background: "#FBF8F1", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, color: C.muted }}>{k.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
                      {k.money ? rupees(k.value) : k.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* RIGHT: needs attention + quick actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <section style={{ ...card, padding: 22 }}>
              <h2 style={{ ...h2, marginBottom: 14 }}>Needs your attention</h2>
              {attention.length === 0 ? (
                <p style={{ margin: 0, color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
                  Nothing to do right now. New orders, reviews to approve and low stock will show up here.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {attention.map((t) => {
                    const tone = TONES[t.tone] || TONES.gold;
                    return (
                      <Link key={t.key} to={t.href} className="ah-todo">
                        <span
                          style={{
                            minWidth: 40,
                            height: 40,
                            borderRadius: 10,
                            background: tone.bg,
                            color: tone.ink,
                            fontWeight: 800,
                            fontSize: 17,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {t.count}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{t.title}</span>
                          <span style={{ display: "block", fontSize: 12.5, color: C.muted }}>{t.hint}</span>
                        </span>
                        <span style={{ color: C.faint, fontSize: 18 }}>›</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section style={{ ...card, padding: 22 }}>
              <h2 style={{ ...h2, marginBottom: 14 }}>Quick actions</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {QUICK.map((q) => (
                  <Link key={q.to} to={q.to} className="ah-pill">
                    {q.label}
                  </Link>
                ))}
                <a href="/" target="_blank" rel="noopener noreferrer" className="ah-pill">
                  View website ↗
                </a>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupStep({ step, num }) {
  const body = (
    <>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
          background: step.done ? C.greenBg : "#F0EADB",
          color: step.done ? C.green : C.ink,
        }}
      >
        {step.done ? "✓" : num}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontWeight: 700,
            fontSize: 14,
            color: step.done ? C.muted : C.ink,
          }}
        >
          {step.title}
          {step.optional && (
            <span style={{ fontWeight: 500, color: C.faint, fontSize: 12 }}> · optional</span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 12.5, color: C.muted }}>{step.hint}</span>
      </span>
      {step.href ? (
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: "7px 14px",
            borderRadius: 999,
            background: step.done ? "transparent" : C.ink,
            color: step.done ? C.goldDeep : "#fff",
            whiteSpace: "nowrap",
          }}
        >
          {step.done ? "Edit" : "Start"}
        </span>
      ) : (
        !step.done && (
          <span style={{ fontSize: 12, color: C.faint, whiteSpace: "nowrap" }}>Done by your developer</span>
        )
      )}
    </>
  );
  return step.href ? (
    <Link to={step.href} className="ah-row">
      {body}
    </Link>
  ) : (
    <div className="ah-row">{body}</div>
  );
}

const card = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
};

const h2 = { margin: 0, fontSize: 17, fontWeight: 800 };

const linkBtn = {
  background: "none",
  border: "none",
  padding: 0,
  color: C.goldDeep,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
};
