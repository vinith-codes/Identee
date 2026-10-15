// Admin → Settings → WhatsApp
//
// Order updates to customers on WhatsApp (server: utils/orderWhatsapp.js): is it set up, on / off, the
// messages it sends (each is a template that must be approved in Meta's WhatsApp Manager under exactly this
// name), the latest messages and a test message. The keys are not here: they live in the server's settings
// file (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) and are never shown.
import { useEffect, useState } from "react";
import { THEME } from "../../../theme/theme";
import whatsappService from "../../../services/whatsappService";

const fill = (body, sample) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => sample[Number(n) - 1] ?? `{{${n}}}`);

export default function WhatsappSettingsPage() {
  const t = THEME;
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testNote, setTestNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    whatsappService
      .getAdmin()
      .then(setData)
      .catch((e) => setNote(e.response?.data?.message || "Could not load the WhatsApp settings."));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (enabled) => {
    setNote("");
    try {
      await whatsappService.saveAdmin(enabled);
      await load();
      setNote(enabled ? "Order updates on WhatsApp are on." : "Order updates on WhatsApp are off.");
    } catch (err) {
      setNote(err.response?.data?.message || "Could not save. Only the main admin can change this.");
    }
  };
  const test = async (e) => {
    e.preventDefault();
    setBusy(true);
    setTestNote("");
    try {
      const r = await whatsappService.sendTest(testTo);
      setTestNote(r.message);
    } catch (err) {
      setTestNote(err.response?.data?.message || "The test message didn’t go.");
    } finally {
      setBusy(false);
      load();
    }
  };

  const card = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 };
  const help = { fontSize: 12, color: t.textMuted, margin: "2px 0 6px" };
  if (!data) return <p style={{ color: t.textMuted }}>{note || "Loading…"}</p>;
  const live = data.configured && data.enabled;

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>WhatsApp</h2>
        <p style={{ ...help, fontSize: 13 }}>Order updates to customers on WhatsApp, next to the emails — only for customers who keep “Send my order updates on WhatsApp” ticked at checkout.</p>
      </div>

      <div style={{ ...card, borderColor: live ? t.goldBorder : t.dangerBorder, background: live ? t.goldBg : t.dangerBg, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <b style={{ fontSize: 14 }}>
            {!data.configured ? "Not set up yet" : data.enabled ? "Working. Customers get their order updates on WhatsApp." : "Switched off."}
          </b>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#fff", border: `1px solid ${data.configured ? t.goldBorder : t.border}` }}>
            {data.configured ? "Connected" : "Not connected"}
          </span>
        </div>
        {!data.configured && (
          <div style={help}>
            Add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to the server's settings file (from Meta: WhatsApp Manager and a
            system user's permanent token), and create the five message templates below in WhatsApp Manager. Until then
            nothing is sent and orders work as before.
          </div>
        )}
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, fontWeight: 600, marginTop: 4 }}>
          <input type="checkbox" checked={data.enabled} onChange={(e) => toggle(e.target.checked)} style={{ width: 18, height: 18 }} />
          Send order updates on WhatsApp
        </label>
        {note && <span role="status" style={{ fontSize: 13, color: t.textMuted }}>{note}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          ["Sent (last 30 days)", data.last30.sent],
          ["Failed (last 30 days)", data.last30.failed],
          ["Template language", data.language],
        ].map(([k, v]) => (
          <div key={k} style={card}>
            <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div>
          <b style={{ fontSize: 14 }}>The messages</b>
          <p style={help}>Each one is a template. Create it in WhatsApp Manager with exactly this name, category “Utility”, language English, and this text. {"{{1}}"}, {"{{2}}"}… are filled in from the order.</p>
        </div>
        {data.templates.map((tp) => (
          <div key={tp.event} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 12px", display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 13 }}>{tp.step}</b>
              <code style={{ fontSize: 12, background: t.surface2, borderRadius: 6, padding: "1px 6px" }}>{tp.name}</code>
            </div>
            <div style={{ fontSize: 13 }}>{tp.body}</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>Example: {fill(tp.body, tp.sample)}</div>
          </div>
        ))}
      </div>

      <form onSubmit={test} style={{ ...card, display: "grid", gap: 8 }}>
        <b style={{ fontSize: 14 }}>Send a test message</b>
        <p style={help}>Sends Meta's “hello world” test template to this number, to check the connection.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value.replace(/[^\d+ ]/g, ""))}
            placeholder="98765 43210"
            inputMode="tel"
            aria-label="Mobile number for the test"
            style={{ width: 180, padding: "9px 10px", border: `1px solid ${t.border}`, borderRadius: 8, font: "inherit", background: "#fff", color: t.text }}
          />
          <button type="submit" disabled={busy || !data.configured} style={{ padding: "10px 22px", border: 0, borderRadius: 999, background: t.ink, color: "#fff", fontWeight: 700, cursor: data.configured ? "pointer" : "default", opacity: data.configured ? 1 : 0.5 }}>
            {busy ? "Sending…" : "Send test"}
          </button>
          {!data.configured && <span style={{ fontSize: 12, color: t.textMuted }}>Works once WhatsApp is connected.</span>}
        </div>
        {testNote && <span role="status" style={{ fontSize: 13 }}>{testNote}</span>}
      </form>

      <div style={card}>
        <b style={{ fontSize: 14 }}>Latest messages</b>
        {data.recent.length === 0 ? (
          <p style={help}>Nothing sent yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: "left", color: t.textMuted, fontSize: 12 }}>
                  <th style={{ padding: "6px 8px 6px 0" }}>When</th>
                  <th style={{ padding: "6px 8px" }}>Order</th>
                  <th style={{ padding: "6px 8px" }}>Message</th>
                  <th style={{ padding: "6px 8px" }}>To</th>
                  <th style={{ padding: "6px 0 6px 8px" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={{ padding: "7px 8px 7px 0", whiteSpace: "nowrap" }}>{new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{r.orderNumber || "—"}</td>
                    <td style={{ padding: "7px 8px" }}>{data.templates.find((x) => x.event === r.event)?.step || (r.event === "TEST" ? "Test" : r.event)}</td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{r.to || "—"}</td>
                    <td style={{ padding: "7px 0 7px 8px", color: r.ok ? "#1F6B35" : "#9A2C1F" }}>{r.ok ? "Sent ✓" : r.error || "Failed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
