// Admin → Settings → AI designs
//
// Switch the Design Room's "Make a design" on or off, set its limits, and
// see what it has cost this month — Google and Grok (xAI, used only for photos
// Google refuses) separately. The AI keys are not here: they live in the
// server's settings file (IDENTEE_GEMINI_API_KEY, XAI_API_KEY) and are never shown.
import { useEffect, useState } from "react";
import { THEME } from "../../../theme/theme";
import aiService from "../../../services/aiService";

const FIELDS = [
  ["dailyPerUser", "Requests per customer per day", "How many times one customer can ask for designs in a day.", 1, 50, 1],
  ["imagesPerRequest", "Pictures per request", "How many options the customer sees each time (each one is paid for).", 1, 4, 1],
  ["monthlyCapInr", "Monthly spending cap (₹)", "When this month's spend reaches it, the feature pauses until next month. Keep it a little below the spend cap set in Google AI Studio. 0 = no cap.", 0, 1000000, 50],
  ["pricePerImageInr", "Cost of one Google picture (₹)", "Used only for the spending figures here. Include GST: Google’s spend page shows about ₹3.50 a picture.", 0, 100, 0.1],
  ["grokPricePerImageInr", "Cost of one Grok picture (₹)", "Grok redraws a customer's photo only when Google refuses it (well-known people). grok-imagine-image-2.0 costs about ₹7 a picture — check console.x.ai → Billing.", 0, 100, 0.1],
];
const WHY = {
  setup: "Not working yet: no AI key is set on the server (IDENTEE_GEMINI_API_KEY).",
  off: "Switched off. Customers see “coming soon”.",
  cap: "Paused: this month's spending cap has been reached.",
};
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AiSettingsPage() {
  const t = THEME;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    aiService
      .getAdmin()
      .then((d) => {
        setData(d);
        setForm(d.settings);
      })
      .catch((e) => setNote(e.response?.data?.message || "Could not load the AI settings."));
  useEffect(() => {
    load();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNote("");
    try {
      await aiService.saveAdmin(form);
      await load();
      setNote("Saved.");
    } catch (err) {
      setNote(err.response?.data?.message || "Could not save. Only the main admin can change these.");
    } finally {
      setSaving(false);
    }
  };

  const card = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 };
  const label = { fontSize: 13, fontWeight: 600, color: t.text };
  const help = { fontSize: 12, color: t.textMuted, margin: "2px 0 6px" };
  const input = { width: 140, padding: "9px 10px", border: `1px solid ${t.border}`, borderRadius: 8, font: "inherit", background: "#fff", color: t.text };

  if (!form) return <p style={{ color: t.textMuted }}>{note || "Loading…"}</p>;
  const capLeft = form.monthlyCapInr > 0 ? Math.max(0, form.monthlyCapInr - data.month.cost) : null;
  // what the numbers in the form add up to
  const perRequest = Number(form.imagesPerRequest || 0) * Number(form.pricePerImageInr || 0);
  const perChange = Number(form.pricePerImageInr || 0);
  const requestsInCap = perRequest > 0 && Number(form.monthlyCapInr) > 0 ? Math.floor(Number(form.monthlyCapInr) / perRequest) : null;
  const worstDay = Number(form.dailyPerUser || 0) * perRequest;

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>AI designs</h2>
        <p style={{ ...help, fontSize: 13 }}>Customers describe a picture in the Design Room’s Assistant and the AI draws it for their tee.</p>
      </div>

      <div style={{ ...card, borderColor: data.reason ? t.dangerBorder : t.goldBorder, background: data.reason ? t.dangerBg : t.goldBg }}>
        <b style={{ fontSize: 14 }}>{data.reason ? WHY[data.reason] : "Working. Customers can make designs."}</b>
        <div style={help}>Image AI: {data.model}{data.configured ? "" : " · key missing"}</div>
      </div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <b style={{ fontSize: 14 }}>Grok — for photos Google refuses</b>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: data.grok?.configured ? t.goldBg : t.surface2, border: `1px solid ${data.grok?.configured ? t.goldBorder : t.border}` }}>
            {data.grok?.configured ? "Connected" : "Not set up"}
          </span>
        </div>
        <div style={help}>
          {data.grok?.configured
            ? `When Google refuses a customer's photo (usually a well-known person), Grok (${data.grok.model}) redraws it — one picture per request.`
            : "Not working yet: add XAI_API_KEY to the server's settings file (key from console.x.ai). Until then, refused photos get the free art filters."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {[
            ["Grok spend this month", rupees(data.month.grok?.cost)],
            ["Grok requests", data.month.grok?.requests || 0],
            ["Grok pictures", data.month.grok?.images || 0],
            ["Google spend this month", rupees(data.month.google?.cost)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          ["Spent this month (all)", rupees(data.month.cost)],
          ["Left before the cap", capLeft === null ? "No cap" : rupees(capLeft)],
          ["Requests this month", data.month.requests],
          ["Pictures made", data.month.images],
        ].map(([k, v]) => (
          <div key={k} style={card}>
            <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
          </div>
        ))}
      </div>

      <form onSubmit={save} style={{ ...card, display: "grid", gap: 16 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center", ...label }}>
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          Customers can make designs with AI
        </label>
        {FIELDS.map(([key, title, hint, min, max, step]) => (
          <label key={key} style={{ display: "grid" }}>
            <span style={label}>{title}</span>
            <span style={help}>{hint}</span>
            <input type="number" style={input} min={min} max={max} step={step} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required />
          </label>
        ))}
        <div style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, display: "grid", gap: 4 }}>
          <b>What this costs</b>
          <span>One new design request: <b>{rupees(perRequest)}</b> ({form.imagesPerRequest} pictures × {rupees(form.pricePerImageInr)})</span>
          <span>One “change it” request: <b>{rupees(perChange)}</b> (1 picture)</span>
          <span>One celebrity photo redrawn by Grok: <b>{rupees(form.grokPricePerImageInr)}</b> (1 picture)</span>
          <span>One customer using all {form.dailyPerUser} requests in a day: up to <b>{rupees(worstDay)}</b></span>
          {requestsInCap !== null && <span>The monthly cap covers about <b>{requestsInCap}</b> new design requests</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={saving} style={{ padding: "10px 22px", border: 0, borderRadius: 999, background: t.ink, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          {note && <span role="status" style={{ fontSize: 13, color: t.textMuted }}>{note}</span>}
        </div>
      </form>

      <div style={card}>
        <b style={{ fontSize: 14 }}>Latest requests</b>
        {data.recent.length === 0 ? (
          <p style={help}>Nothing yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
              <thead>
                <tr style={{ textAlign: "left", color: t.textMuted, fontSize: 12 }}>
                  <th style={{ padding: "6px 8px 6px 0" }}>When</th>
                  <th style={{ padding: "6px 8px" }}>Customer</th>
                  <th style={{ padding: "6px 8px" }}>Asked for</th>
                  <th style={{ padding: "6px 8px" }}>AI</th>
                  <th style={{ padding: "6px 0 6px 8px", textAlign: "right" }}>Pictures</th>
                  <th style={{ padding: "6px 0 6px 8px", textAlign: "right" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={{ padding: "7px 8px 7px 0", whiteSpace: "nowrap" }}>{new Date(r.when).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    <td style={{ padding: "7px 8px" }}>{r.who}</td>
                    <td style={{ padding: "7px 8px" }}>{r.kind === "change" ? "Change: " : ""}{r.prompt}</td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap", fontWeight: r.ai === "Grok" ? 700 : 400 }}>{r.ai || "Google"}</td>
                    <td style={{ padding: "7px 0 7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.images}</td>
                    <td style={{ padding: "7px 0 7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rupees(r.costInr)}</td>
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
