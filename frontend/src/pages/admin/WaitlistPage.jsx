// Admin → Customers → Notify me list (22 Oct 2026): the emails left in the "We're under development · Notify me"
// strip at the top of the site, and one button that tells them all when the new designs are here. Each person
// gets that email once (notifiedAt); the server sends 40 per click so the mail service isn't overloaded.
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import waitlistService from "../../services/waitlistService";
import { THEME as theme, getInputStyle, getLabelStyle } from "../../theme/theme";

const DEFAULT_SUBJECT = "It's here: new IDENTEE designs are live";
const DEFAULT_MESSAGE =
  "You asked us to tell you when the new IDENTEE designs arrive. They're here now. Come and have a look, and make one that's all yours.";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Stat({ label, value }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "14px 18px", flex: "1 1 140px", minWidth: 0, boxShadow: theme.shadow }}>
      <p style={{ ...getLabelStyle(theme), margin: 0 }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 600, color: theme.goldDeep, fontFamily: theme.fontDisplay }}>{value}</p>
    </div>
  );
}

const btn = (dark) => ({
  minHeight: 40,
  padding: "0 18px",
  borderRadius: 999,
  border: dark ? "none" : `1.5px solid ${theme.ink}`,
  background: dark ? theme.ink : "#fff",
  color: dark ? "#F0D585" : theme.ink,
  fontWeight: 600,
  fontSize: 13.5,
  cursor: "pointer",
  fontFamily: theme.fontBody,
});

export default function WaitlistPage() {
  const { user } = useSelector((s) => s.auth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [link, setLink] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [removing, setRemoving] = useState(null); // the row asking "Remove?"

  const load = () =>
    waitlistService
      .list(user?.token)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.response?.data?.message || "Couldn't load the list."));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    setSending(true);
    setResult("");
    try {
      const r = await waitlistService.notify({ subject, message, link }, user?.token);
      setResult(r.message);
      toast.success(r.message);
      await load();
    } catch (e) {
      const m = e.response?.data?.message || "Couldn't send the emails.";
      setResult(m);
      toast.error(m);
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  const remove = async (id) => {
    try {
      await waitlistService.remove(id, user?.token);
      toast.success("Removed from the list");
      setRemoving(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Couldn't remove it.");
    }
  };

  const downloadCsv = () => {
    const rows = [["Email", "Name", "Joined", "Told"], ...data.entries.map((e) => [e.email, e.name, fmt(e.createdAt), e.notifiedAt ? fmt(e.notifiedAt) : ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "identee-notify-me-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const waiting = data?.waiting || 0;
  const nextBatch = Math.min(waiting, 40);

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, padding: "32px 40px", fontFamily: theme.fontBody, color: theme.text }}>
      <h1 style={{ fontFamily: theme.fontDisplay, fontSize: 26, margin: "0 0 6px" }}>Notify me list</h1>
      <p style={{ margin: "0 0 22px", color: theme.textMuted, fontSize: 14, maxWidth: 640, lineHeight: 1.55 }}>
        People who pressed <b>Notify me</b> in the “under development” strip at the top of the site. When the new designs
        are ready, send them one email below. The strip itself is turned on/off in Settings → General.
      </p>

      {error && <p style={{ color: theme.danger, margin: "0 0 16px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <Stat label="On the list" value={data ? data.total : "…"} />
        <Stat label="Waiting" value={data ? data.waiting : "…"} />
        <Stat label="Already told" value={data ? data.notified : "…"} />
      </div>

      <section style={{ background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, marginBottom: 26, maxWidth: 720 }}>
        <h2 style={{ fontFamily: theme.fontDisplay, fontSize: 18, margin: "0 0 4px" }}>Send the “it's here” email</h2>
        <p style={{ margin: "0 0 14px", color: theme.textMuted, fontSize: 13, lineHeight: 1.5 }}>
          Goes only to people not told yet, {40} at a time. Each person gets it once.
        </p>
        <label style={{ ...getLabelStyle(theme), display: "block", marginBottom: 6 }} htmlFor="wl-subject">Subject</label>
        <input id="wl-subject" style={{ ...getInputStyle(theme), fontSize: 14, marginBottom: 12 }} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
        <label style={{ ...getLabelStyle(theme), display: "block", marginBottom: 6 }} htmlFor="wl-message">Message</label>
        <textarea id="wl-message" rows={4} style={{ ...getInputStyle(theme), fontSize: 14, marginBottom: 12, resize: "vertical", lineHeight: 1.5 }} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
        <label style={{ ...getLabelStyle(theme), display: "block", marginBottom: 6 }} htmlFor="wl-link">Button link (optional)</label>
        <input id="wl-link" style={{ ...getInputStyle(theme), fontSize: 14, marginBottom: 4 }} value={link} placeholder="https://identee.co.in/ready-made" onChange={(e) => setLink(e.target.value)} />
        <p style={{ margin: "0 0 14px", color: theme.textFaint, fontSize: 12 }}>Empty: the email's “Visit IDENTEE” button opens the home page.</p>

        {confirming ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Send it now to {nextBatch} {nextBatch === 1 ? "person" : "people"}?</span>
            <button type="button" style={btn(true)} onClick={send} disabled={sending}>{sending ? "Sending…" : "Yes, send now"}</button>
            <button type="button" style={btn(false)} onClick={() => setConfirming(false)} disabled={sending}>Cancel</button>
          </div>
        ) : (
          <button
            type="button"
            style={{ ...btn(true), opacity: waiting && subject.trim() && message.trim() ? 1 : 0.55 }}
            onClick={() => {
              if (!waiting) return toast.info("Nobody is waiting — everyone on the list has been told.");
              if (!subject.trim() || !message.trim()) return toast.error("Write the subject and the message first.");
              setConfirming(true);
            }}
          >
            {waiting ? `Send to ${nextBatch} ${nextBatch === 1 ? "person" : "people"}` : "Nobody waiting"}
          </button>
        )}
        {result && <p style={{ margin: "12px 0 0", fontSize: 13.5, color: theme.inkSoft }}>{result}</p>}
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, maxWidth: 900 }}>
        <h2 style={{ fontFamily: theme.fontDisplay, fontSize: 18, margin: 0 }}>Everyone on the list</h2>
        {data?.entries.length > 0 && (
          <button type="button" style={btn(false)} onClick={downloadCsv}>Download list (CSV)</button>
        )}
      </div>

      {!data ? (
        <p style={{ color: theme.textMuted }}>Loading…</p>
      ) : data.entries.length === 0 ? (
        <p style={{ color: theme.textMuted }}>Nobody has pressed Notify me yet.</p>
      ) : (
        <div style={{ overflowX: "auto", maxWidth: 900, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 520 }}>
            <thead>
              <tr style={{ background: theme.surface2, textAlign: "left" }}>
                {["Email", "Name", "Joined", "Told", ""].map((h) => (
                  <th key={h} style={{ ...getLabelStyle(theme), padding: "10px 12px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e._id} style={{ borderTop: `1px solid ${theme.border}` }}>
                  <td style={{ padding: "10px 12px", wordBreak: "break-all" }}>{e.email}</td>
                  <td style={{ padding: "10px 12px", color: e.name ? theme.text : theme.textFaint }}>{e.name || "Not logged in"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmt(e.createdAt)}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: e.notifiedAt ? "#27500A" : theme.textMuted }}>
                    {e.notifiedAt ? `✓ ${fmt(e.notifiedAt)}` : "Waiting"}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {removing === e._id ? (
                      <>
                        <button type="button" onClick={() => remove(e._id)} style={{ ...btn(true), minHeight: 32, padding: "0 12px", marginRight: 6 }}>Remove</button>
                        <button type="button" onClick={() => setRemoving(null)} style={{ ...btn(false), minHeight: 32, padding: "0 12px" }}>Keep</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setRemoving(e._id)} style={{ background: "none", border: "none", color: theme.danger, cursor: "pointer", fontSize: 13, padding: "6px 4px" }}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
