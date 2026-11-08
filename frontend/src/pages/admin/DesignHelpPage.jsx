// Admin → Design Studio → Help requests (Assistant round 6, 8 Nov 2026)
// Customers who tapped "Ask the IDENTEE team to finish it" in the design room: their note, their tee as they left it
// (a picture of the front), the last part of their chat and how to reach them. The team finishes the tee in the Studio,
// gets in touch, and marks the request done here.
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import api from "../../../api.js";
import { THEME as theme } from "../../theme/theme";
import { imageUrl } from "../../utils/imageUrl";

const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const btn = (kind = "light") => ({
  minHeight: 38,
  padding: "0 16px",
  borderRadius: 999,
  border: kind === "light" ? `1.5px solid ${theme.ink}` : "none",
  background: kind === "dark" ? theme.ink : "#fff",
  color: kind === "dark" ? "#F0D585" : theme.ink,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: theme.fontBody,
});
const card = { minWidth: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: theme.shadow };

export default function DesignHelpPage() {
  const { user } = useSelector((s) => s.auth);
  const token = user?.token;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [openChat, setOpenChat] = useState(null); // the request whose chat is shown

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/ai/help", { headers: { Authorization: `Bearer ${token}` } });
      setRows(data.requests || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "The list couldn’t be loaded.");
    }
  }, [token]);
  useEffect(() => {
    const t = setTimeout(load, 0); // (the list loads once the page is up)
    return () => clearTimeout(t);
  }, [load]);

  const setStatus = async (r, status) => {
    try {
      await api.put(`/ai/help/${r._id}`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(status === "done" ? "Marked done." : "Back to open.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "That didn’t save.");
    }
  };

  const open = (rows || []).filter((r) => r.status === "new");
  const done = (rows || []).filter((r) => r.status !== "new");
  const Row = ({ r }) => (
    <div style={{ ...card, display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 16, opacity: r.status === "done" ? 0.7 : 1 }}>
      <a href={r.mockupUrl ? imageUrl(r.mockupUrl) : undefined} target="_blank" rel="noreferrer" style={{ display: "block", width: 120, height: 140, borderRadius: 10, overflow: "hidden", background: "#F1ECE1" }}>
        {r.mockupUrl ? <img src={imageUrl(r.mockupUrl, 400)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ padding: 10, fontSize: 12, color: theme.textMuted }}>No picture</div>}
      </a>
      <div style={{ minWidth: 0, display: "grid", gap: 6, alignContent: "start" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <strong style={{ fontSize: 15 }}>{r.name || "Customer"}</strong>
          {r.phone && <a href={`https://wa.me/${String(r.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{r.phone} (WhatsApp)</a>}
          {r.email && <span style={{ fontSize: 13, color: theme.textMuted }}>{r.email}</span>}
          <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: "auto" }}>{fmt(r.createdAt)}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.45 }}>“{r.note}”</div>
        <div style={{ fontSize: 12.5, color: theme.textMuted }}>
          {[r.garment, r.colour, r.size && `size ${r.size}`].filter(Boolean).join(" · ") || "—"} · {r.design?.elements?.length || 0} item{(r.design?.elements?.length || 0) === 1 ? "" : "s"} on the tee · {r.chat?.length || 0} chat lines
        </div>
        {openChat === r._id && (
          <div style={{ fontSize: 12.5, background: "#FBF8F1", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 10px", maxHeight: 220, overflow: "auto" }}>
            {(r.chat || []).map((m, i) => (
              <div key={i} style={{ margin: "2px 0" }}>
                <b>{m.who === "customer" ? "Customer" : "Assistant"}:</b> {m.text}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {r.chat?.length > 0 && <button type="button" style={btn()} onClick={() => setOpenChat(openChat === r._id ? null : r._id)}>{openChat === r._id ? "Hide the chat" : "Read the chat"}</button>}
          {r.status === "new" ? <button type="button" style={btn("dark")} onClick={() => setStatus(r, "done")}>Mark done</button> : <button type="button" style={btn()} onClick={() => setStatus(r, "new")}>Reopen</button>}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: theme.fontBody, color: theme.text }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontFamily: theme.fontHeading }}>Help requests</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: theme.textMuted, maxWidth: 720 }}>
          Customers who tapped “Ask the IDENTEE team to finish it” in the design room. Open the picture to see their tee, read the chat for what they wanted, finish it in the Studio and get in touch — then mark it done.
        </p>
      </div>
      {error && <div style={{ color: theme.danger }}>{error}</div>}
      {rows === null && !error && <div style={{ color: theme.textMuted }}>Loading…</div>}
      {rows && !rows.length && <div style={{ ...card, color: theme.textMuted }}>No requests yet.</div>}
      {open.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted, textTransform: "uppercase", letterSpacing: ".08em" }}>Open · {open.length}</div>}
      {open.map((r) => (
        <Row key={r._id} r={r} />
      ))}
      {done.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 8 }}>Done · {done.length}</div>}
      {done.map((r) => (
        <Row key={r._id} r={r} />
      ))}
    </div>
  );
}
