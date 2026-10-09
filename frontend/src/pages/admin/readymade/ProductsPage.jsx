// pages/admin/readymade/ProductsPage.jsx  —  Admin → Ready-made → All products
//
// One card per product (all its colours together): photo, shop place,
// price, stock. Search, filter by category and state (live / hidden /
// low stock), quick restock per size, hide or show in the shop, edit in
// the wizard, delete (only if never ordered — otherwise hide).
// ?status=low opens the low-stock list (linked from Admin → Home).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import productAdminService from "../../../services/productAdminService";
import { imageUrl } from "../../../utils/imageUrl";
import { AW } from "../garmentSetup/wizardStyles";
import { colourHex, RM_CSS } from "./readymadeUi";

const STATUSES = [
  ["all", "All"],
  ["live", "In the shop"],
  ["hidden", "Hidden"],
  ["low", "Low stock"],
];
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const CSS = `
  .rp-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 18px; }
  .rp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 14px; margin-top: 16px; }
  .rp-card { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 14px; padding: 14px; }
  .rp-card.is-off { background: #FBF8F1; }
  .rp-img { width: 96px; aspect-ratio: 4 / 5; border-radius: 10px; overflow: hidden; background: #F3EEE2; }
  .rp-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .rp-card.is-off .rp-img img { opacity: .55; }
  .rp-name { font-weight: 800; font-size: 15px; margin: 0; overflow-wrap: anywhere; }
  .rp-sub { font-size: 12.5px; color: #6B6355; margin: 2px 0 0; }
  .rp-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: 13px; }
  .rp-badge { font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
  .rp-badge.live { background: #E3F2E8; color: #24522F; }
  .rp-badge.off { background: #EEE8DA; color: #5C5547; }
  .rp-badge.low { background: #FCE8E0; color: #8A2E12; }
  .rp-badge.feat { background: #F4E7C4; color: #6B4E0E; }
  .rp-actions { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; border-top: 1px solid #EFE7D4; padding-top: 10px; }
  .rp-actions .aw-btn { min-height: 36px; padding: 6px 12px; font-size: 13px; }
  .rp-restock { grid-column: 1 / -1; background: #FBF8F1; border-radius: 12px; padding: 12px; }
  .rp-restock table { border-collapse: collapse; font-size: 12.5px; }
  .rp-restock td, .rp-restock th { padding: 4px 6px; text-align: left; white-space: nowrap; }
  .rp-restock input { width: 58px; min-height: 34px; padding: 4px 6px; }
  .rp-restock input.low { border-color: #E0A48C; background: #FFF4EF; }
  .rp-saved { background: #E3F2E8; color: #24522F; border-radius: 12px; padding: 10px 14px; font-size: 13.5px; font-weight: 600; margin-top: 14px; }
`;

export default function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some(([k]) => k === params.get("status")) ? params.get("status") : "all";
  const category = params.get("category") || "";
  const saved = params.get("saved");
  const savedState = params.get("state");

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced search
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(null); // groupId with restock open
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null); // { groupId, text, bad }

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("saved");
    next.delete("state");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    () =>
      productAdminService
        .listGroups({ status, category: category || undefined, search: query || undefined })
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((err) => setError(err.response?.data?.message || "Couldn't load the products.")),
    [status, category, query],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    productAdminService
      .options()
      .then((o) => setCategories(o.categories.map((c) => c.name)))
      .catch(() => {});
  }, []);

  const myId = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("userInfo") || "{}")._id;
    } catch {
      return null;
    }
  }, []);
  const savedName = useMemo(() => data?.groups.find((g) => g.groupId === saved)?.name, [data, saved]);

  const toggleHidden = async (g) => {
    setBusy(g.groupId);
    try {
      await productAdminService.setVisibility(g.groupId, !g.hidden);
      setNote({ groupId: g.groupId, text: g.hidden ? "Back in the shop." : "Hidden — customers can't see or buy it now." });
      await load();
    } catch (err) {
      setNote({ groupId: g.groupId, text: err.response?.data?.message || "Couldn't change it.", bad: true });
    } finally {
      setBusy("");
    }
  };

  const remove = async (g) => {
    setBusy(g.groupId);
    try {
      await productAdminService.deleteGroup(g.groupId);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setConfirmDelete(null);
      setNote({ groupId: g.groupId, text: err.response?.data?.message || "Couldn't delete it.", bad: true });
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={AW.page}>
      <style>{AW.css + RM_CSS + CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 style={AW.h1}>Ready-made products</h1>
          <p style={AW.lead}>Finished tees you keep in stock. Each card is one product with all its colours.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/admin/bulk-upload" className="aw-btn light">Add many (spreadsheet)</Link>
          <Link to="/admin/upload-product" className="aw-btn dark">+ Add a product</Link>
        </div>
      </div>

      {saved && (
        <p className="rp-saved" role="status">
          ✓ Saved{savedName ? ` “${savedName}”` : ""}
          {savedState === "hidden" ? " — hidden from the shop until you show it." : " — it's in the shop."}
        </p>
      )}

      <div className="rp-bar">
        <input className="aw-inp" style={{ maxWidth: 300 }} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, colour or code" aria-label="Search products" />
        <select className="aw-inp" style={{ maxWidth: 220 }} value={category} onChange={(e) => setParam("category", e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option value="none">Not in any category</option>
        </select>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Show">
          {STATUSES.map(([k, label]) => (
            <button key={k} type="button" className={`aw-chip${status === k ? " on" : ""}`} aria-pressed={status === k} onClick={() => setParam("status", k === "all" ? "" : k)}>
              {label}
              {data && ` · ${data.counts[k]}`}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rm-problems" style={{ marginTop: 14 }}>{error}</p>}
      {!data && !error && <p style={{ color: "#6B6559" }}>Loading…</p>}
      {data && data.groups.length === 0 && (
        <p className="rm-empty" style={{ marginTop: 16 }}>
          {data.counts.all === 0 && !query && !category ? (
            <>
              No ready-made products yet. <Link to="/admin/upload-product" className="aw-link">Add the first one →</Link>
            </>
          ) : (
            "Nothing matches — try another search or filter."
          )}
        </p>
      )}

      <div className="rp-grid">
        {data?.groups.map((g) => (
          <article key={g.groupId} className={`aw-card rp-card${g.hidden ? " is-off" : ""}`} style={g.groupId === saved ? { borderColor: "#9CC3A6" } : undefined}>
            <div className="rp-img">{g.image && <img src={imageUrl(g.image, 240)} alt="" loading="lazy" />}</div>
            <div style={{ minWidth: 0 }}>
              <p className="rp-name">{g.name}</p>
              <p className="rp-sub">
                {g.category ? `${g.category} → ${g.style}` : <span style={{ color: "#8A2E12" }}>“{g.style}” isn't in any category — customers can't find it</span>}
              </p>
              <div className="rp-row">
                <b>{g.priceMin === g.priceMax ? money(g.priceMin) : `${money(g.priceMin)}–${money(g.priceMax)}`}</b>
                <span style={{ color: "#6B6355" }}>· {g.totalStock} in stock</span>
              </div>
              <div className="rp-row">
                {g.colours.map((c) => (
                  <span key={c._id} className="aw-dot" title={c.color} style={{ background: colourHex(c.color), width: 16, height: 16 }} />
                ))}
                <span style={{ color: "#6B6355", fontSize: 12 }}>{g.sizes.join(" · ")}</span>
              </div>
              <div className="rp-row">
                <span className={`rp-badge ${g.hidden ? "off" : "live"}`}>{g.hidden ? "Hidden" : "In the shop"}</span>
                {g.lowStock && <span className="rp-badge low">Low stock</span>}
                {g.featured && <span className="rp-badge feat">Featured</span>}
                {g.owner && g.ownerId !== myId && <span style={{ fontSize: 11.5, color: "#6B6355" }}>by {g.owner}</span>}
              </div>
            </div>

            {open === g.groupId && <Restock group={g} lowAt={data.lowStockAt} onSaved={load} />}
            {note?.groupId === g.groupId && (
              <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 13, color: note.bad ? "#A3341F" : "#24522F" }} role="status">
                {note.text}
              </p>
            )}

            <div className="rp-actions">
              <Link to={`/admin/products/${g.groupId}/edit`} className="aw-btn dark">Edit</Link>
              <button type="button" className="aw-btn light" aria-expanded={open === g.groupId} onClick={() => setOpen(open === g.groupId ? null : g.groupId)}>
                {open === g.groupId ? "Close stock" : "Restock"}
              </button>
              <button type="button" className="aw-btn light" disabled={busy === g.groupId} onClick={() => toggleHidden(g)}>
                {g.hidden ? "Show in shop" : "Hide"}
              </button>
              {confirmDelete === g.groupId ? (
                <span className="rm-confirm">
                  Delete for good?
                  <button type="button" className="aw-btn light" style={{ color: "#A3341F" }} disabled={busy === g.groupId} onClick={() => remove(g)}>Delete</button>
                  <button type="button" className="aw-btn light" onClick={() => setConfirmDelete(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="rm-textbtn danger" style={{ marginLeft: "auto" }} onClick={() => setConfirmDelete(g.groupId)}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// Stock per colour × size, saved per colour.
function Restock({ group, lowAt, onSaved }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(group.colours.map((c) => [c._id, Object.fromEntries(c.stockBySize.map((s) => [s.size, s.stock]))])),
  );
  const [state, setState] = useState(""); // "" | "saving" | "saved" | error text
  const sizes = group.sizes;

  const save = async () => {
    setState("saving");
    try {
      for (const c of group.colours) {
        const before = Object.fromEntries(c.stockBySize.map((s) => [s.size, s.stock]));
        const now = values[c._id];
        if (Object.keys(now).some((k) => Number(now[k]) !== before[k])) {
          await productAdminService.setStock(c._id, Object.fromEntries(Object.entries(now).map(([k, v]) => [k, Number(v) || 0])));
        }
      }
      setState("saved");
      onSaved();
    } catch (err) {
      setState(err.response?.data?.message || "Couldn't save the stock.");
    }
  };

  return (
    <div className="rp-restock">
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Colour</th>
              {sizes.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.colours.map((c) => (
              <tr key={c._id}>
                <td>{c.color}</td>
                {sizes.map((s) => {
                  const has = c.stockBySize.some((x) => x.size === s);
                  const v = values[c._id][s];
                  return (
                    <td key={s}>
                      {has ? (
                        <input
                          className={`aw-inp${Number(v) <= lowAt ? " low" : ""}`}
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={v}
                          aria-label={`${c.color} ${s} stock`}
                          onChange={(e) => {
                            setState("");
                            setValues((all) => ({ ...all, [c._id]: { ...all[c._id], [s]: e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))) } }));
                          }}
                        />
                      ) : (
                        <span style={{ color: "#B3AA98" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <button type="button" className="aw-btn dark" style={{ minHeight: 36, padding: "6px 14px", fontSize: 13 }} disabled={state === "saving"} onClick={save}>
          {state === "saving" ? "Saving…" : "Save stock"}
        </button>
        {state === "saved" && <span style={{ color: "#24522F", fontSize: 13, fontWeight: 600 }}>Saved ✓</span>}
        {state && !["saving", "saved"].includes(state) && <span style={{ color: "#A3341F", fontSize: 13 }}>{state}</span>}
        <span className="aw-help" style={{ margin: 0 }}>Red boxes: {lowAt} or fewer left.</span>
      </div>
    </div>
  );
}
