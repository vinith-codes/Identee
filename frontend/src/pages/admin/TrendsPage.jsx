// Admin → Design Studio → Trends ("Trending now", 23 Nov 2026)
// The looks a customer's photo can be redrawn in — "GTA style" is the first. The shop's home page shows a card for
// each trend that is switched on; tapping it opens the trend's own assistant in the Design Room (pick the tee, send a
// photo, choose one of three tees made from it). A new trend needs no release: add it here, then switch it on.
//   Name      what the customer sees
//   The look  the art look in words — this is what the picture AI is told (describe it; a picture AI can refuse a
//             request that only names a game or a film)
//   The scene what is put behind the people in the poster pictures (leave empty: the people alone, no poster)
//   Example   the picture on the home page card
// (23 Nov 2026, the owner: "only the black and [white] colours should be given. In the front side of the t-shirt the
// logo I am giving is fixed for all tees. In the back either they can make the GTA version of their photo or we should
// provide many options for the back.")
//   Tee colours   the colours offered in this trend's studio (names, with commas; empty: every colour)
//   Front logo    the picture put on the front of every tee of this trend (the customer may still change it)
//   Ready backs   pictures for the back, to pick instead of sending a photo
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import aiService from "../../services/aiService";
import { THEME as theme } from "../../theme/theme";
import { imageUrl } from "../../utils/imageUrl";

const btn = (kind = "light", off = false) => ({
  minHeight: 40,
  padding: "0 16px",
  borderRadius: 999,
  border: kind === "light" ? `1.5px solid ${theme.ink}` : kind === "danger" ? `1.5px solid ${theme.danger}` : "none",
  background: kind === "dark" ? theme.ink : "#fff",
  color: kind === "dark" ? "#F0D585" : kind === "danger" ? theme.danger : theme.ink,
  fontWeight: 600,
  fontSize: 13,
  cursor: off ? "default" : "pointer",
  opacity: off ? 0.5 : 1,
  fontFamily: theme.fontBody,
});
const card = { minWidth: 0, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "16px 18px", boxShadow: theme.shadow };
const field = { width: "100%", boxSizing: "border-box", border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, fontFamily: theme.fontBody, color: theme.text, background: "#fff" };
const label = { display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600, color: theme.textMuted };
const why = (err) => err?.response?.data?.message || err?.message || "That didn’t save.";
const BLANK = { name: "", look: "", setting: "" };
const coloursText = (row) => (row.colours || []).join(", ");
const thumb = { width: "100%", aspectRatio: "3 / 4", objectFit: "contain", borderRadius: 8, background: "#2A2622" };

function TrendCard({ row, first, last, onChanged, onMove }) {
  const [form, setForm] = useState({ name: row.name, look: row.look, setting: row.setting || "", colours: coloursText(row) });
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const frontRef = useRef(null);
  const backsRef = useRef(null);
  const dirty = form.name !== row.name || form.look !== row.look || form.setting !== (row.setting || "") || form.colours !== coloursText(row);
  const backs = row.backs || [];
  // the front logo: one picture (a see-through PNG prints best — it is put on Centre Front as it is)
  const uploadFront = async (file) => {
    if (!file) return;
    setBusy("front");
    try {
      const { path } = await aiService.trendPicture(file);
      await aiService.saveTrend(row._id, { front: path });
      toast.success("Front logo saved.");
      onChanged();
    } catch (err) {
      toast.error(why(err));
    }
    setBusy("");
  };
  // ready-made backs: several pictures at once; each is named after its file (the name can be changed below it)
  const uploadBacks = async (files) => {
    if (!files.length) return;
    setBusy("backs");
    try {
      const added = [];
      for (const file of files) {
        const { path } = await aiService.trendPicture(file);
        added.push({ url: path, name: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 40) });
      }
      await aiService.saveTrend(row._id, { backs: [...backs, ...added] });
      toast.success(added.length === 1 ? "Ready design added." : `${added.length} ready designs added.`);
      onChanged();
    } catch (err) {
      toast.error(why(err));
    }
    setBusy("");
  };
  const saveBacks = (next, done) => save({ backs: next }, done);
  const save = async (body, done) => {
    setBusy("save");
    try {
      await aiService.saveTrend(row._id, body);
      toast.success(done);
      onChanged();
    } catch (err) {
      toast.error(why(err));
    }
    setBusy("");
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy("picture");
    try {
      const { path } = await aiService.trendPicture(file);
      await aiService.saveTrend(row._id, { example: path });
      toast.success("Example picture saved.");
      onChanged();
    } catch (err) {
      toast.error(why(err));
    }
    setBusy("");
  };
  const remove = async () => {
    if (!window.confirm(`Delete the trend “${row.name}”? Designs already made with it stay as they are.`)) return;
    setBusy("delete");
    try {
      await aiService.dropTrend(row._id);
      toast.success("Trend deleted.");
      onChanged();
    } catch (err) {
      toast.error(why(err));
    }
    setBusy("");
  };
  return (
    <div style={{ ...card, display: "grid", gridTemplateColumns: "minmax(0, 150px) minmax(0, 1fr)", gap: 18, opacity: row.active ? 1 : 0.78 }} className="trend-card">
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <div style={{ aspectRatio: "3 / 4", borderRadius: 10, overflow: "hidden", background: "#F1ECE1", display: "grid", placeItems: "center", fontSize: 12, color: theme.textMuted, textAlign: "center", padding: row.example ? 0 : 8 }}>
          {row.example ? <img src={imageUrl(row.example, 500)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "No example picture yet"}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />
        <button type="button" style={btn("light", Boolean(busy))} disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
          {busy === "picture" ? "Uploading…" : row.example ? "Change picture" : "Add picture"}
        </button>
        {row.example && (
          <button type="button" style={{ ...btn("light", Boolean(busy)), border: "none", minHeight: 30, textDecoration: "underline" }} disabled={Boolean(busy)} onClick={() => save({ example: "" }, "Example picture removed.")}>
            Remove picture
          </button>
        )}
      </div>
      <div style={{ minWidth: 0, display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: row.active ? "#E4F3E7" : "#F1ECE1", color: row.active ? "#1F6B34" : theme.textMuted }}>{row.active ? "ON — customers see it" : "OFF — only the team can try it"}</span>
          <button type="button" style={btn(row.active ? "light" : "dark", Boolean(busy))} disabled={Boolean(busy)} onClick={() => save({ active: !row.active }, row.active ? "Switched off." : "Switched on.")}>
            {row.active ? "Switch off" : "Switch on"}
          </button>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button type="button" aria-label="Move up" style={btn("light", first || Boolean(busy))} disabled={first || Boolean(busy)} onClick={() => onMove(-1)}>↑</button>
            <button type="button" aria-label="Move down" style={btn("light", last || Boolean(busy))} disabled={last || Boolean(busy)} onClick={() => onMove(1)}>↓</button>
          </span>
        </div>
        <label style={label}>
          Name (what the customer sees)
          <input style={field} maxLength={40} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label style={label}>
          The look — told to the picture AI. Describe it in words.
          <textarea style={{ ...field, minHeight: 86, resize: "vertical" }} maxLength={600} value={form.look} onChange={(e) => setForm((f) => ({ ...f, look: e.target.value }))} />
        </label>
        <label style={label}>
          The scene behind the people in the poster pictures (leave empty: the people alone, no poster)
          <textarea style={{ ...field, minHeight: 66, resize: "vertical" }} maxLength={600} value={form.setting} onChange={(e) => setForm((f) => ({ ...f, setting: e.target.value }))} />
        </label>
        <label style={label}>
          Tee colours offered in this trend (names with commas, as in the garment’s colours — empty: every colour)
          <input style={field} maxLength={300} value={form.colours} onChange={(e) => setForm((f) => ({ ...f, colours: e.target.value }))} placeholder="Black, White" />
        </label>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ ...label, display: "block" }}>Front logo — on the front of every tee of this trend (the customer can still change it). Use a large, sharp picture; a see-through PNG prints best.</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {row.front ? <img src={imageUrl(row.front, 300)} alt="" style={{ ...thumb, width: 96, aspectRatio: "1" }} /> : <span style={{ fontSize: 12.5, color: theme.textMuted }}>No front logo yet — the front is left empty.</span>}
            <input ref={frontRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadFront(f); }} />
            <button type="button" style={btn("light", Boolean(busy))} disabled={Boolean(busy)} onClick={() => frontRef.current?.click()}>
              {busy === "front" ? "Uploading…" : row.front ? "Change logo" : "Add logo"}
            </button>
            {row.front && (
              <button type="button" style={{ ...btn("light", Boolean(busy)), border: "none", minHeight: 30, textDecoration: "underline" }} disabled={Boolean(busy)} onClick={() => save({ front: "" }, "Front logo removed.")}>
                Remove logo
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ ...label, display: "block" }}>Ready designs for the back ({backs.length}) — the customer can pick one instead of sending a photo. Large, sharp pictures; they go on Full Back as they are.</span>
          {backs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10 }}>
              {backs.map((b, n) => (
                <div key={b.url} style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <img src={imageUrl(b.url, 300)} alt="" style={thumb} />
                  <input style={{ ...field, padding: "5px 7px", fontSize: 12 }} maxLength={40} defaultValue={b.name} aria-label="Name" placeholder="Name" onBlur={(e) => e.target.value.trim() !== (b.name || "") && saveBacks(backs.map((x, k) => (k === n ? { ...x, name: e.target.value.trim() } : x)), "Name saved.")} />
                  <button type="button" style={{ ...btn("light", Boolean(busy)), border: "none", minHeight: 26, fontSize: 12, textDecoration: "underline", padding: 0 }} disabled={Boolean(busy)} onClick={() => saveBacks(backs.filter((_, k) => k !== n), "Ready design removed.")}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div>
            <input ref={backsRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { const list = [...(e.target.files || [])]; e.target.value = ""; uploadBacks(list); }} />
            <button type="button" style={btn("light", Boolean(busy))} disabled={Boolean(busy)} onClick={() => backsRef.current?.click()}>
              {busy === "backs" ? "Uploading…" : "Add ready designs"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={btn("dark", !dirty || Boolean(busy))} disabled={!dirty || Boolean(busy)} onClick={() => save({ name: form.name, look: form.look, setting: form.setting, colours: form.colours.split(",") }, "Saved.")}>
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          <button type="button" style={btn("danger", Boolean(busy))} disabled={Boolean(busy)} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrendsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [add, setAdd] = useState(BLANK);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await aiService.trendsAll();
      setRows(data.trends || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "The trends couldn’t be loaded.");
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0); // (the list loads once the page is up)
    return () => clearTimeout(t);
  }, [load]);

  // moving a trend up or down: the two swap places (every trend is given its place number, so old rows sort right too)
  const move = async (i, by) => {
    const next = [...rows];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    try {
      await Promise.all(next.map((r, n) => (r.order === n ? null : aiService.saveTrend(r._id, { order: n }))));
    } catch (err) {
      toast.error(why(err));
    }
    load();
  };
  const create = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await aiService.addTrend({ ...add, active: false });
      toast.success("Trend added — it is OFF until you switch it on.");
      setAdd(BLANK);
      load();
    } catch (err) {
      toast.error(why(err));
    }
    setAdding(false);
  };

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: theme.fontBody, color: theme.text }}>
      <style>{`@media (max-width: 640px) { .trend-card { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontFamily: theme.fontHeading }}>Trends</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: theme.textMuted, maxWidth: 760, lineHeight: 1.5 }}>
          The looks a customer’s photo can be redrawn in. Each trend that is ON shows as a card on the shop’s home page (“Trending now”). Tapping it opens the trend’s own assistant: the customer picks the tee
          (only the trend’s colours), the trend’s logo is on the front, and for the back they send a photo — three designs are made from it and they pick one — or pick one of the ready designs. The mockup and each
          picture made from a photo cost the same as the Assistant’s and count in the customer’s daily pictures; a ready design costs nothing.
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: theme.textMuted, maxWidth: 760, lineHeight: 1.5 }}>
          Describe the look and the scene in plain words — that is exactly what the picture AI is told. Changes here are used from the next mockup on. A trend that is OFF is not shown to customers.
        </p>
      </div>
      {error && <div style={{ color: theme.danger }}>{error}</div>}
      {rows === null && !error && <div style={{ color: theme.textMuted }}>Loading…</div>}
      {rows && !rows.length && <div style={{ ...card, color: theme.textMuted }}>No trends yet. Add one below.</div>}
      {(rows || []).map((r, i) => (
        <TrendCard key={`${r._id}:${r.updatedAt}`} row={r} first={i === 0} last={i === rows.length - 1} onChanged={load} onMove={(by) => move(i, by)} />
      ))}
      <form onSubmit={create} style={{ ...card, display: "grid", gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Add a trend</strong>
        <label style={label}>
          Name (what the customer sees)
          <input style={field} maxLength={40} required value={add.name} onChange={(e) => setAdd((f) => ({ ...f, name: e.target.value }))} placeholder="for example: Comic cover" />
        </label>
        <label style={label}>
          The look — told to the picture AI. Describe it in words.
          <textarea style={{ ...field, minHeight: 86, resize: "vertical" }} maxLength={600} required value={add.look} onChange={(e) => setAdd((f) => ({ ...f, look: e.target.value }))} placeholder="for example: a classic superhero comic-book cover with bold ink outlines, halftone dots and bright primary colours" />
        </label>
        <label style={label}>
          The scene behind the people (optional)
          <textarea style={{ ...field, minHeight: 66, resize: "vertical" }} maxLength={600} value={add.setting} onChange={(e) => setAdd((f) => ({ ...f, setting: e.target.value }))} placeholder="for example: a city rooftop at night with a full moon and searchlights" />
        </label>
        <div>
          <button type="submit" style={btn("dark", adding)} disabled={adding}>
            {adding ? "Adding…" : "Add trend (switched off)"}
          </button>
        </div>
      </form>
    </div>
  );
}
