// Admin → Settings → AI designs
//
// Switch the Design Room's "Make a design" on or off, set its limits, and
// see what it has cost, this month and since the start — Google and Grok (xAI, used
// only for photos Google refuses) separately. The AI keys are not here: they live in the
// server's settings file (IDENTEE_GEMINI_API_KEY, XAI_API_KEY) and are never shown.
import { useEffect, useState } from "react";
import { THEME } from "../../../theme/theme";
import aiService from "../../../services/aiService";
import { imageUrl } from "../../../utils/imageUrl";
import { useReportUnsaved } from "../../../utils/unsavedChanges";

const FIELDS = [
  ["dailyPerUser", "Requests per customer per day", "How many times one customer can ask for designs in a day.", 1, 50, 1],
  ["imagesPerRequest", "Pictures per request", "How many options the customer sees each time (each one is paid for).", 1, 4, 1],
  ["monthlyCapInr", "Google: monthly spending cap (₹)", "When this month's Google spend reaches it, the feature pauses until next month. Keep it a little below the spend cap set in Google AI Studio. 0 = no cap.", 0, 1000000, 50],
  ["pricePerImageInr", "Cost of one Google picture (₹)", "Used only for the spending figures here. Include GST: Google’s spend page shows about ₹3.50 a picture.", 0, 100, 0.1],
  ["grokMonthlyCapInr", "Grok: monthly spending cap (₹)", "When this month's Grok spend reaches it, Grok stops standing in until next month: a picture Google refuses then gets a “couldn’t make this one” message, and Google keeps working. Keep it a little below your xAI credit. 0 = no cap.", 0, 1000000, 50],
  ["grokPricePerImageInr", "Cost of one Grok picture (₹)", "Grok redraws a customer's photo only when Google refuses it (well-known people). $5 of xAI credit ≈ 71 pictures ≈ ₹6 each — check console.x.ai → Billing.", 0, 100, 0.1],
  ["replicatePricePerImageInr", "Cost of one print-ready picture (₹)", "Orders → Designs & print files → Prepare for print: the picture is enlarged on Replicate's graphics cards (Real-ESRGAN). Replicate charges per run, about ₹0.20–₹1 — check replicate.com → Billing and put the real figure here.", 0, 100, 0.1],
  ["designAddOnInr", "Extra price per tee with a picture (₹)", "What the CUSTOMER pays on top of the garment's price for each tee whose design has an AI-made picture or their own upload. Once per tee, however many pictures. Pictures from the art library are free, and a text-only design costs just the garment's price.", 0, 5000, 10],
  ["chatPricePerMessageInr", "Cost of one smart Assistant message (₹)", "Used only for the spending figures here: Google's text AI reads each message a customer types. Check Google AI Studio's spend page after a few days and put the real figure here. It counts toward Google's monthly cap.", 0, 10, 0.05],
];
const WHY = {
  setup: "Not working yet: no AI key is set on the server (IDENTEE_GEMINI_API_KEY).",
  off: "Switched off. Customers see “coming soon”.",
  cap: "Paused: this month's Google spending cap has been reached.",
};
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthName = (key) => new Date(`${key}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" });

export default function AiSettingsPage() {
  const t = THEME;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [older, setOlder] = useState([]); // requests loaded with "Show older requests"
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderNote, setOlderNote] = useState("");

  const load = () =>
    aiService
      .getAdmin()
      .then((d) => {
        setData(d);
        setForm(d.settings);
        setOlder([]);
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

  const showOlder = async () => {
    setLoadingOlder(true);
    setOlderNote("");
    try {
      const rows = [...data.recent, ...older];
      const next = await aiService.getOlderRequests(rows[rows.length - 1].when);
      setOlder([...older, ...next]);
    } catch (err) {
      setOlderNote(err.response?.data?.message || "Could not load the older requests.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const card = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20 };
  const label = { fontSize: 13, fontWeight: 600, color: t.text };
  const help = { fontSize: 12, color: t.textMuted, margin: "2px 0 6px" };
  const input = { width: 140, padding: "9px 10px", border: `1px solid ${t.border}`, borderRadius: 8, font: "inherit", background: "#fff", color: t.text };

  // unsaved changes: the sidebar and the settings tabs ask before leaving; Reset puts the saved values back
  const dirty = Boolean(data && form && JSON.stringify(form) !== JSON.stringify(data.settings));
  useReportUnsaved(dirty, "AI designs");

  if (!form) return <p style={{ color: t.textMuted }}>{note || "Loading…"}</p>;
  // each service has its own cap
  const capLeft = form.monthlyCapInr > 0 ? Math.max(0, form.monthlyCapInr - (data.month.google?.cost || 0)) : null;
  const grokCapLeft = form.grokMonthlyCapInr > 0 ? Math.max(0, form.grokMonthlyCapInr - (data.month.grok?.cost || 0)) : null;
  const grokInCap = Number(form.grokPricePerImageInr) > 0 && Number(form.grokMonthlyCapInr) > 0 ? Math.floor(Number(form.grokMonthlyCapInr) / Number(form.grokPricePerImageInr)) : null;
  // what the numbers in the form add up to
  const perRequest = Number(form.imagesPerRequest || 0) * Number(form.pricePerImageInr || 0);
  const perChange = Number(form.pricePerImageInr || 0);
  const requestsInCap = perRequest > 0 && Number(form.monthlyCapInr) > 0 ? Math.floor(Number(form.monthlyCapInr) / perRequest) : null;
  const worstDay = Number(form.dailyPerUser || 0) * perRequest;
  const requests = [...data.recent, ...older];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18, maxWidth: 760 }}>
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
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: data.grok?.capped ? t.dangerBg : data.grok?.configured ? t.goldBg : t.surface2, border: `1px solid ${data.grok?.capped ? t.dangerBorder : data.grok?.configured ? t.goldBorder : t.border}` }}>
            {!data.grok?.configured ? "Not set up" : data.grok.capped ? "Paused — cap reached" : "Connected"}
          </span>
        </div>
        <div style={help}>
          {data.grok?.configured && data.grok.capped
            ? "This month's Grok spending cap has been reached. Until next month, photos Google refuses get the free art filters. Google keeps working."
            : data.grok?.configured
            ? `When Google refuses a customer's photo (usually a well-known person), Grok (${data.grok.model}) redraws it — one picture per request.`
            : "Not working yet: add XAI_API_KEY to the server's settings file (key from console.x.ai). Until then, refused photos get the free art filters."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {[
            ["Grok spend this month", rupees(data.month.grok?.cost)],
            ["Left before Grok's cap", grokCapLeft === null ? "No cap" : rupees(grokCapLeft)],
            ["Grok requests", data.month.grok?.requests || 0],
            ["Grok pictures", data.month.grok?.images || 0],
          ].map(([k, v]) => (
            <div key={k} style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <b style={{ fontSize: 14 }}>Enlarger for print files — Replicate</b>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: data.replicate?.configured ? t.goldBg : t.surface2, border: `1px solid ${data.replicate?.configured ? t.goldBorder : t.border}` }}>
            {data.replicate?.configured ? (data.replicate.model === "mock-resize" ? "Test mode (no real enlarging)" : "Connected") : "Not set up"}
          </span>
        </div>
        <div style={help}>
          {data.replicate?.configured
            ? "Orders → Designs & print files → Prepare for print: a picture is enlarged on Replicate's graphics cards (Real-ESRGAN, the enlarger that made the samples the print team approved), then given its vector edge for the .ai print file. Charged per picture by Replicate."
            : "Not working yet: add REPLICATE_API_TOKEN to the server's settings file (token from replicate.com → API tokens; add a card or prepaid credit under Billing). Until then, Prepare for print says it is not set up."}
        </div>
      </div>

      {/* the new Assistant's concept sheets (round 3, 7 Nov 2026): what customers pick */}
      {data.concepts && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 6 }}>Concept sheets (the new Assistant)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {[
              ["Sheets this month", data.concepts.month.sheets],
              ["Concepts picked", data.concepts.month.picks],
              ["Pick rate", data.concepts.month.pickRate == null ? "—" : `${data.concepts.month.pickRate}%`],
              ["Sheets, all time", data.concepts.allTime.sheets],
              ["Picked, all time", data.concepts.allTime.picks],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
              </div>
            ))}
          </div>
          {data.concepts.allTime.styles?.length > 0 && (
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 8 }}>
              Styles customers pick most: {data.concepts.allTime.styles.map((x) => `${x.style} (${x.count})`).join(" · ")}
            </div>
          )}
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>A sheet shows 3 concepts; the pick rate is concepts made real ÷ concepts shown. A low rate means the sheets miss what customers want — tell Claude which kinds of requests.</div>
          {data.concepts.ideaSheets?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 6 }}>Browse ideas — tick the concept sheets customers may start from (the Assistant shows them under “Browse ideas”; a pick from one is made real as usual).</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {data.concepts.ideaSheets.map((sh) => (
                  <label key={sh.id} style={{ display: "grid", gap: 6, padding: 8, border: `1px solid ${sh.featured ? "#C9A24A" : t.border}`, borderRadius: 10, background: sh.featured ? "#FBF4E0" : "#fff", cursor: "pointer" }}>
                    <img src={imageUrl(sh.url, 600)} alt="" style={{ width: "100%", borderRadius: 6, background: "#F1ECE1" }} />
                    <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{sh.brief || sh.titles.join(" · ")}</div>
                    <div style={{ fontSize: 11.5, color: t.textMuted }}>{sh.titles.join(" · ")}{sh.teeColour ? ` · ${sh.teeColour} tee` : ""}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                      <input
                        type="checkbox"
                        checked={sh.featured}
                        onChange={async (e) => {
                          const featured = e.target.checked;
                          setData((d) => ({ ...d, concepts: { ...d.concepts, ideaSheets: d.concepts.ideaSheets.map((x) => (x.id === sh.id ? { ...x, featured } : x)) } }));
                          try {
                            await aiService.setIdea(sh.id, featured);
                          } catch {
                            setData((d) => ({ ...d, concepts: { ...d.concepts, ideaSheets: d.concepts.ideaSheets.map((x) => (x.id === sh.id ? { ...x, featured: !featured } : x)) } }));
                          }
                        }}
                      />
                      Show in Browse ideas
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          {data.concepts.unfinished?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 4 }}>Started but not ordered (last 30 days) — customers who got concepts and placed no order since. Worth a WhatsApp.</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: t.textMuted, fontSize: 12 }}>
                      {["Customer", "Phone", "Asked for", "Sheets", "Picked", "Last"].map((h) => (
                        <th key={h} style={{ padding: "6px 12px 6px 0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.concepts.unfinished.map((u, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                        <td style={{ padding: "7px 12px 7px 0", whiteSpace: "nowrap" }}>{u.who}{u.email ? <div style={{ fontSize: 11.5, color: t.textMuted }}>{u.email}</div> : null}</td>
                        <td style={{ padding: "7px 12px 7px 0", whiteSpace: "nowrap" }}>{u.phone || "—"}</td>
                        <td style={{ padding: "7px 12px 7px 0", minWidth: 220, maxWidth: 360 }}>{u.asked || "—"}</td>
                        <td style={{ padding: "7px 12px 7px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{u.sheets}</td>
                        <td style={{ padding: "7px 12px 7px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{u.picks}</td>
                        <td style={{ padding: "7px 0", whiteSpace: "nowrap", color: t.textMuted }}>{new Date(u.last).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        {[
          ["Spent this month (all)", rupees(data.month.cost)],
          ["Google spend this month", rupees(data.month.google?.cost)],
          ["Left before Google's cap", capLeft === null ? "No cap" : rupees(capLeft)],
          ["Requests this month", data.month.requests],
          ["Pictures made", data.month.images],
          ["Smart Assistant messages", data.month.chat?.messages || 0],
        ].map(([k, v]) => (
          <div key={k} style={card}>
            <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* since the very first request: what every month cost. The month's figures above are what the caps use. */}
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div>
          <b style={{ fontSize: 14 }}>All usage, since the start</b>
          <div style={{ ...help, margin: "2px 0 0" }}>Worked out from the prices set below when each request was made. Google’s and xAI’s own bills are the exact figures.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {[
            ["Spent (all)", rupees(data.allTime.cost)],
            ["Google spend", rupees(data.allTime.google.cost)],
            ["Grok spend", rupees(data.allTime.grok.cost)],
            ["Requests", data.allTime.requests],
            ["Pictures made", data.allTime.images],
            ["Smart Assistant messages", data.allTime.chat.messages],
          ].map(([k, v]) => (
            <div key={k} style={{ background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: t.textMuted }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
        </div>
        {data.months.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "right", color: t.textMuted, fontSize: 12 }}>
                  <th style={{ padding: "6px 8px 6px 0", textAlign: "left" }}>Month</th>
                  {["Spent", "Google", "Grok", "Requests", "Pictures", "Messages"].map((h) => (
                    <th key={h} style={{ padding: "6px 0 6px 12px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={{ padding: "7px 8px 7px 0", whiteSpace: "nowrap" }}>{monthName(m.month)}</td>
                    {[rupees(m.cost), rupees(m.google.cost), rupees(m.grok.cost), m.requests, m.images, m.chat.messages].map((v, i) => (
                      <td key={i} style={{ padding: "7px 0 7px 12px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: i === 0 ? 700 : 400 }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={save} style={{ ...card, display: "grid", gap: 16 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center", ...label }}>
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          Customers can make designs with AI
        </label>
        {/* the smart Assistant (23 Oct 2026): off = the Assistant's fixed replies, exactly as before */}
        <label style={{ display: "grid", gap: 2 }}>
          <span style={{ display: "flex", gap: 10, alignItems: "center", ...label }}>
            <input type="checkbox" checked={form.smartChat !== false} onChange={(e) => setForm({ ...form, smartChat: e.target.checked })} style={{ width: 18, height: 18 }} />
            Smart Assistant (understands anything the customer types)
          </span>
          <span style={{ ...help, marginLeft: 28 }}>
            On: Google reads every message a customer types and answers like a chat — ideas, questions, changes, drawings (a picture is still only drawn when the customer presses Draw). Off: the Assistant’s fixed replies, as before. Taps on buttons never use it.
          </span>
        </label>
        {/* the new Assistant (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md): off = the older chat with plan cards, at once, no release */}
        <label style={{ display: "grid", gap: 2 }}>
          <span style={{ display: "flex", gap: 10, alignItems: "center", ...label }}>
            <input type="checkbox" checked={form.assistantV2 !== false} onChange={(e) => setForm({ ...form, assistantV2: e.target.checked })} style={{ width: 18, height: 18 }} />
            The new Assistant (concept sheets, picks by number, several moves per message)
          </span>
          <span style={{ ...help, marginLeft: 28 }}>
            On: a customer types what they want and gets three numbered tees to pick from; only signed-in customers can use it. Off: the older chat (one plan card at a time) comes back for everyone the moment you save — no release needed.
          </span>
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
          {requestsInCap !== null && <span>Google's monthly cap covers about <b>{requestsInCap}</b> new design requests</span>}
          {grokInCap !== null && <span>Grok's monthly cap covers about <b>{grokInCap}</b> Grok pictures</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={saving} style={{ padding: "10px 22px", border: 0, borderRadius: 999, background: t.ink, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          {dirty && !saving && (
            <button type="button" onClick={() => { setForm(data.settings); setNote(""); }} style={{ padding: "10px 18px", borderRadius: 999, border: `1px solid ${t.border}`, background: "#fff", color: t.text, fontWeight: 600, cursor: "pointer" }}>
              Reset
            </button>
          )}
          {note && <span role="status" style={{ fontSize: 13, color: t.textMuted }}>{note}</span>}
        </div>
      </form>

      <div style={card}>
        <b style={{ fontSize: 14 }}>Requests, newest first</b>
        {requests.length === 0 ? (
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
                {requests.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={{ padding: "7px 8px 7px 0", whiteSpace: "nowrap" }}>{new Date(r.when).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
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
        {requests.length > 0 && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12, fontSize: 13, color: t.textMuted }}>
            <span>Showing {requests.length} of {data.allTime.requests}</span>
            {requests.length < data.allTime.requests && (
              <button type="button" onClick={showOlder} disabled={loadingOlder} style={{ minHeight: 40, padding: "8px 18px", borderRadius: 999, border: `1px solid ${t.border}`, background: "#fff", color: t.text, fontWeight: 600, cursor: "pointer" }}>
                {loadingOlder ? "Loading…" : "Show older requests"}
              </button>
            )}
            {olderNote && <span role="status">{olderNote}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
