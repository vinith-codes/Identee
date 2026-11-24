// Admin → Shop your IDENTEE → Manage the shop (24 Nov 2026)
//
// The owner: "i want in the admin to remove the whole style, like that to manage shop your identee. I need all the
// required ones". In one page:
//   Collections     each collection's name and line of text, its place in the shop (↑ ↓), on the home page or not, and
//                   all its tees out / back / deleted for good
//   Quick switches  a whole style, Men / Women, or a colour out of the shop (or back) — for one collection or all
//   Prices          a new price (and struck "was" price) for a collection, or one style of it
//   Every tee       a list with search and filters; tick many, then take out / put back / price / delete for good
// "Take out" loses nothing: the tee stays here and goes back in one click. "Delete for good" takes it out of this
// admin too (orders already placed keep working). Every change is live on the website at once.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import studioService from "../../services/studioService";
import { imageUrl } from "../../utils/imageUrl";
import { money } from "../../utils/money";
import { collectionInfo } from "../../utils/shopRules";
import { shopHref } from "../../utils/siteUrls";
import { chunks, collectionRows, collectionsBody, colourGroups, filterTees, groupBy, inScope, priceGroups } from "../../utils/shopManage";
import "./shopManage.css";

const apiError = (err) => err?.response?.data?.message || err?.message || "That didn't work. Please try again.";
const PAGE = 60;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nameOf = (t) => String(t.name || "").replace(/^[^·]*·\s*/, "");

export default function ShopManagePage() {
  const [data, setData] = useState(null); // { tees, collections, defaultHome }
  const [version, setVersion] = useState(0); // each load: the Collections box starts again from what is saved
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // { label, done, total }
  const [failed, setFailed] = useState([]);

  const load = useCallback(
    () =>
      studioService
        .shopTees()
        .then((d) => {
          setData(d);
          setVersion((v) => v + 1);
          setError("");
        })
        .catch((err) => setError(apiError(err))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  // one action on many tees, a few at a time, then the list again
  const run = async (label, ids, body, sure = null) => {
    if (!ids.length || busy) return false;
    if (sure && !window.confirm(sure)) return false;
    setBusy({ label, done: 0, total: ids.length });
    setFailed([]);
    let done = 0;
    const bad = [];
    for (const part of chunks(ids)) {
      try {
        const r = await studioService.shopBulk({ ...body, ids: part });
        done += r.done;
        bad.push(...(r.failed || []));
      } catch (err) {
        bad.push({ name: `${part.length} tees`, message: apiError(err) });
      }
      setBusy({ label, done: Math.min(ids.length, done + bad.length), total: ids.length });
    }
    setBusy(null);
    setFailed(bad);
    if (bad.length) toast.error(`${label}: ${bad.length} didn't work — see the list at the top.`);
    else toast.success(`${label}: done (${plural(done, "tee")}).`);
    await load();
    return true;
  };

  if (error && !data) return <p className="sm-error">{error}</p>;
  if (!data) return <p className="sm-note">Loading the shop's tees…</p>;

  return (
    <div className="sm-page">
      <header className="sm-head">
        <p className="sm-kicker">Shop your IDENTEE</p>
        <h1>Manage the shop</h1>
        <p className="sm-lead">
          Take tees out of the shop — a whole style, a colour, Men / Women, or the tees you tick — and put them back, change prices, and set
          how the collections show. <b>Take out</b> loses nothing: the tees stay here and go back in one click. Every change is live on the
          website at once.
        </p>
      </header>

      {busy && (
        <div className="sm-busy" role="status">
          {busy.label}… {busy.done} / {busy.total}
          <span style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} />
        </div>
      )}
      {failed.length > 0 && (
        <div className="sm-failed" role="alert">
          <b>These didn't work:</b>
          <ul>
            {failed.slice(0, 20).map((f, i) => (
              <li key={i}>
                {f.name}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Collections key={version} data={data} busy={Boolean(busy)} run={run} onSaved={load} />
      <Switches tees={data.tees} collections={data.collections} busy={Boolean(busy)} run={run} />
      <Prices tees={data.tees} busy={Boolean(busy)} run={run} />
      <TeeList tees={data.tees} busy={Boolean(busy)} run={run} />
    </div>
  );
}

// a collection's own words on the website (the admin's, else the built-in ones)
const shownName = (row) => row.name || collectionInfo(row.key, row.title).name;

function Collections({ data, busy, run, onSaved }) {
  const start = useMemo(() => collectionRows(data.tees, data.collections, data.defaultHome), [data]);
  const [rows, setRows] = useState(start);
  const [saving, setSaving] = useState(false);
  const [gone, setGone] = useState(null); // the collection asked to be deleted for good
  const changed = JSON.stringify(collectionsBody(rows)) !== JSON.stringify(collectionsBody(start));
  const set = (key, patch) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i, by) =>
    setRows((cur) => {
      const next = [...cur];
      const j = i + by;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const save = async () => {
    setSaving(true);
    try {
      await studioService.saveShopCollections(collectionsBody(rows));
      toast.success("Saved — the shop, the menu and the home page show it now.");
      await onSaved();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="sm-card" aria-labelledby="sm-coll">
      <h2 id="sm-coll">Collections</h2>
      <p className="sm-note">The order here is the order in the shop, the menu and the collection chips. Ticked ones show on the home page's “Pick your story”.</p>
      <ol className="sm-colls">
        {rows.map((r, i) => (
          <li key={r.key} className="sm-coll">
            <div className="sm-coll-move">
              <button type="button" aria-label={`Move ${shownName(r)} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${shownName(r)} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
            </div>
            <div className="sm-coll-pic">{r.picture ? <img src={imageUrl(r.picture, 200)} alt="" loading="lazy" /> : <span>—</span>}</div>
            <div className="sm-coll-body">
              <div className="sm-coll-top">
                <b>{shownName(r)}</b>
                <small>
                  {r.inShop} in the shop{r.out ? ` · ${r.out} taken out` : ""}
                </small>
              </div>
              <label className="sm-field">
                <span>Name on the website</span>
                <input value={r.name} maxLength={40} placeholder={collectionInfo(r.key, r.title).name} onChange={(e) => set(r.key, { name: e.target.value })} />
              </label>
              <label className="sm-field">
                <span>Its line of text</span>
                <input value={r.text} maxLength={200} placeholder={collectionInfo(r.key, r.title).text || "(none)"} onChange={(e) => set(r.key, { text: e.target.value })} />
              </label>
              <div className="sm-coll-foot">
                {r.key !== "none" && (
                  <label className="sm-check">
                    <input type="checkbox" checked={r.home} onChange={(e) => set(r.key, { home: e.target.checked })} /> On the home page
                  </label>
                )}
                <span className="sm-gap" />
                {r.inShop > 0 && (
                  <button type="button" className="sm-btn" disabled={busy} onClick={() => run(`Take ${shownName(r)} out`, r.ids, { action: "out" }, `Take all ${r.inShop} ${shownName(r)} tees out of the shop? They stay here and can be put back.`)}>
                    Take all out
                  </button>
                )}
                {r.out > 0 && (
                  <button type="button" className="sm-btn sm-btn-dark" disabled={busy} onClick={() => run(`Put ${shownName(r)} back`, r.ids, { action: "back" }, `Put all ${r.out} taken-out ${shownName(r)} tees back in the shop?`)}>
                    Put all back
                  </button>
                )}
                <button type="button" className="sm-btn sm-btn-danger" disabled={busy} onClick={() => setGone(r)}>
                  Delete for good…
                </button>
              </div>
              {gone?.key === r.key && (
                <DeleteBox
                  count={r.ids.length}
                  what={`all ${r.ids.length} ${shownName(r)} tees`}
                  onCancel={() => setGone(null)}
                  onDelete={async () => {
                    setGone(null);
                    await run(`Delete ${shownName(r)}`, r.ids, { action: "delete" });
                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="sm-row">
        <button type="button" className="sm-btn sm-btn-dark" disabled={!changed || saving} onClick={save}>
          {saving ? "Saving…" : "Save names, order and home page"}
        </button>
        {changed && (
          <button type="button" className="sm-btn sm-btn-link" onClick={() => setRows(start)}>
            Undo changes
          </button>
        )}
      </div>
    </section>
  );
}

// "type DELETE": nothing goes by a slip of the finger
function DeleteBox({ count, what, onCancel, onDelete }) {
  const [word, setWord] = useState("");
  return (
    <div className="sm-delete" role="alertdialog" aria-label="Delete for good">
      <p>
        <b>Delete {what} for good?</b> {count === 1 ? "It leaves" : "They leave"} the shop <b>and this admin</b>, and can't be put back (make{" "}
        {count === 1 ? "it" : "them"} again from the Studio if needed). Orders already placed keep working. To take them out for a while, use{" "}
        <i>Take out</i> instead.
      </p>
      <label className="sm-field">
        <span>Type DELETE to confirm</span>
        <input value={word} onChange={(e) => setWord(e.target.value)} autoFocus />
      </label>
      <div className="sm-row">
        <button type="button" className="sm-btn sm-btn-danger-solid" disabled={word.trim() !== "DELETE"} onClick={onDelete}>
          Delete {plural(count, "tee")} for good
        </button>
        <button type="button" className="sm-btn sm-btn-link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScopePicker({ tees, value, onChange, id }) {
  const keys = collectionRows(tees);
  return (
    <label className="sm-field sm-scope" htmlFor={id}>
      <span>For</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">The whole shop</option>
        {keys.map((c) => (
          <option key={c.key} value={c.key}>
            {collectionInfo(c.key, c.title).name}
          </option>
        ))}
      </select>
    </label>
  );
}

// a whole style, Men / Women, or a colour: out of the shop or back, in one click
function Switches({ tees, busy, run }) {
  const [scope, setScope] = useState("");
  const list = inScope(tees, scope);
  const where = scope ? collectionInfo(scope, list[0]?.collectionName).name : "the whole shop";
  const line = (g, label, field) => (
    <li key={g.name} className="sm-switch">
      <span className="sm-switch-name">{label}</span>
      <small>
        {g.inShop} in the shop{g.out ? ` · ${g.out} out` : ""}
      </small>
      <span className="sm-gap" />
      <button type="button" className="sm-btn" disabled={busy || !g.inShop} onClick={() => run(`Take ${label} out`, list.filter((t) => t[field] === g.name && t.inShop).map((t) => t._id), { action: "out" }, `Take ${plural(g.inShop, `${label} tee`)} (${where}) out of the shop? They stay here and can be put back.`)}>
        Take out
      </button>
      <button type="button" className="sm-btn sm-btn-dark" disabled={busy || !g.out} onClick={() => run(`Put ${label} back`, list.filter((t) => t[field] === g.name && !t.inShop).map((t) => t._id), { action: "back" }, `Put ${plural(g.out, `${label} tee`)} (${where}) back in the shop?`)}>
        Put back
      </button>
    </li>
  );
  return (
    <section className="sm-card" aria-labelledby="sm-sw">
      <h2 id="sm-sw">Quick switches</h2>
      <p className="sm-note">Take a whole style, Men's or Women's, or a colour out of the shop — or put it back.</p>
      <ScopePicker tees={tees} value={scope} onChange={setScope} id="sm-sw-scope" />
      <div className="sm-switch-grid">
        <div>
          <h3>Styles</h3>
          <ul className="sm-switches">
            {groupBy(list, "style").map((g) => line(g, g.name, "style"))}
          </ul>
        </div>
        <div>
          <h3>Men / Women</h3>
          <ul className="sm-switches">
            {groupBy(list, "gender").map((g) => line(g, g.name === "Unisex" ? "Unisex" : `${g.name}'s`, "gender"))}
          </ul>
        </div>
        <div>
          <h3>Colours</h3>
          <ul className="sm-switches">
            {colourGroups(list).map((c) => (
              <li key={c.slug} className="sm-switch">
                <span className="sm-dot" style={{ background: c.hex }} />
                <span className="sm-switch-name">{c.name}</span>
                <small>
                  {c.shown} on sale{c.hidden ? ` · ${c.hidden} taken out` : ""}
                </small>
                <span className="sm-gap" />
                <button type="button" className="sm-btn" disabled={busy || !c.shown} onClick={() => run(`Take ${c.name} out`, list.filter((t) => t.colours.some((x) => x.slug === c.slug && !x.hidden)).map((t) => t._id), { action: "colourOut", colour: c.slug }, `Stop selling ${c.name} on ${plural(c.shown, "tee")} (${where})? The tees stay in the shop in their other colours; a tee sold only in ${c.name} disappears until ${c.name} is put back.`)}>
                  Take out
                </button>
                <button type="button" className="sm-btn sm-btn-dark" disabled={busy || !c.hidden} onClick={() => run(`Put ${c.name} back`, list.filter((t) => t.colours.some((x) => x.slug === c.slug && x.hidden)).map((t) => t._id), { action: "colourBack", colour: c.slug }, `Sell ${c.name} again on ${plural(c.hidden, "tee")} (${where})?`)}>
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PriceInputs({ busy, count, onApply }) {
  const [price, setPrice] = useState("");
  const [was, setWas] = useState("");
  const p = Math.round(Number(price));
  const w = Math.round(Number(was) || 0);
  const bad = !(p >= 1) ? "Give the new price." : w && w <= p ? "The “was” price must be more than the price." : "";
  return (
    <div className="sm-row sm-price-row">
      <label className="sm-field">
        <span>New price ₹</span>
        <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="449" />
      </label>
      <label className="sm-field">
        <span>Struck “was” price ₹ (optional)</span>
        <input inputMode="numeric" value={was} onChange={(e) => setWas(e.target.value.replace(/[^0-9]/g, ""))} placeholder="799" />
      </label>
      <button type="button" className="sm-btn sm-btn-dark" disabled={busy || !count || Boolean(bad)} title={bad} onClick={() => onApply(p, w)}>
        Set for {plural(count, "tee")}
      </button>
    </div>
  );
}

function Prices({ tees, busy, run }) {
  const [scope, setScope] = useState("");
  const [style, setStyle] = useState("");
  const inCollection = inScope(tees, scope);
  const list = style ? inCollection.filter((t) => t.style === style) : inCollection;
  const styles = groupBy(inCollection, "style").map((g) => g.name);
  return (
    <section className="sm-card" aria-labelledby="sm-pr">
      <h2 id="sm-pr">Prices</h2>
      <p className="sm-note">A new price for a collection, or one style of it. The struck “was” price shows crossed out next to it.</p>
      <div className="sm-row">
        <ScopePicker tees={tees} value={scope} onChange={(v) => (setScope(v), setStyle(""))} id="sm-pr-scope" />
        <label className="sm-field sm-scope">
          <span>Style</span>
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="">Every style</option>
            {styles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="sm-now">
        Now:{" "}
        {priceGroups(list).map((g, i) => (
          <span key={i}>
            {plural(g.count, "tee")} at <b>{money(g.price)}</b>
            {g.oldPrice > g.price ? <s>{money(g.oldPrice)}</s> : null}
          </span>
        ))}
      </p>
      <PriceInputs busy={busy} count={list.length} onApply={(price, oldPrice) => run("New price", list.map((t) => t._id), { action: "price", price, oldPrice }, `Sell ${plural(list.length, "tee")} at ${money(price)}${oldPrice ? ` (was ${money(oldPrice)})` : ""}?`)} />
    </section>
  );
}

// every shop tee: search, filters, tick many, act on them
function TeeList({ tees, busy, run }) {
  const [f, setF] = useState({ q: "", collection: "", style: "", gender: "", colour: "", status: "" });
  const [ticked, setTicked] = useState(() => new Set());
  const [shown, setShown] = useState(PAGE);
  const [panel, setPanel] = useState(""); // "price" | "delete"
  const list = useMemo(() => filterTees(tees, f), [tees, f]);
  // (a tee deleted or no longer there leaves the ticks)
  const ids = new Set(tees.map((t) => t._id));
  const picked = [...ticked].filter((id) => ids.has(id));
  const all = list.length > 0 && list.every((t) => ticked.has(t._id));
  const setFilter = (k, v) => {
    setF((cur) => ({ ...cur, [k]: v }));
    setShown(PAGE);
  };
  const tick = (id) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tickAll = () => setTicked(all ? new Set() : new Set([...ticked, ...list.map((t) => t._id)]));
  const act = async (label, body, sure) => {
    const ok = await run(label, picked, body, sure);
    if (ok) {
      setPanel("");
      if (body.action === "delete") setTicked(new Set());
    }
  };
  const colls = collectionRows(tees);
  const styles = groupBy(tees, "style").map((g) => g.name);
  const genders = groupBy(tees, "gender").map((g) => g.name);
  const colours = colourGroups(tees);
  return (
    <section className="sm-card" aria-labelledby="sm-list">
      <h2 id="sm-list">Every tee ({tees.length})</h2>
      <div className="sm-filters">
        <input className="sm-search" type="search" value={f.q} onChange={(e) => setFilter("q", e.target.value)} placeholder="Search names, colours…" aria-label="Search the tees" />
        <select value={f.collection} onChange={(e) => setFilter("collection", e.target.value)} aria-label="Collection">
          <option value="">Every collection</option>
          {colls.map((c) => (
            <option key={c.key} value={c.key}>
              {collectionInfo(c.key, c.title).name}
            </option>
          ))}
        </select>
        <select value={f.style} onChange={(e) => setFilter("style", e.target.value)} aria-label="Style">
          <option value="">Every style</option>
          {styles.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={f.gender} onChange={(e) => setFilter("gender", e.target.value)} aria-label="Men or Women">
          <option value="">Men, Women, Unisex</option>
          {genders.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={f.colour} onChange={(e) => setFilter("colour", e.target.value)} aria-label="Colour">
          <option value="">Every colour</option>
          {colours.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={f.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="In the shop or taken out">
          <option value="">In the shop + taken out</option>
          <option value="in">In the shop</option>
          <option value="out">Taken out</option>
        </select>
      </div>

      <div className="sm-listbar">
        <label className="sm-check">
          <input type="checkbox" checked={all} onChange={tickAll} disabled={!list.length} /> Tick all {list.length} shown
        </label>
        {picked.length > 0 && (
          <button type="button" className="sm-btn sm-btn-link" onClick={() => setTicked(new Set())}>
            Clear ticks
          </button>
        )}
      </div>

      <ul className="sm-tees">
        {list.slice(0, shown).map((t) => (
          <li key={t._id} className={`sm-tee${t.inShop ? "" : " is-out"}${ticked.has(t._id) ? " on" : ""}`}>
            <label className="sm-tee-tick">
              <input type="checkbox" checked={ticked.has(t._id)} onChange={() => tick(t._id)} aria-label={`Tick ${t.name}`} />
            </label>
            <div className="sm-tee-pic">{t.picture ? <img src={imageUrl(t.picture, 160)} alt="" loading="lazy" /> : null}</div>
            <div className="sm-tee-body">
              <b>{nameOf(t)}</b>
              <small>
                {collectionInfo(t.collection, t.collectionName).name} · {t.style || "—"} · {t.gender}
              </small>
              <span className="sm-tee-colours">
                {t.colours.map((c) => (
                  <span key={c.slug} className={`sm-dot${c.hidden ? " off" : ""}`} style={{ background: c.hex }} title={`${c.name}${c.hidden ? " (taken out)" : ""}`} />
                ))}
              </span>
            </div>
            <div className="sm-tee-end">
              <span className="sm-tee-price">
                {money(t.price)}
                {t.oldPrice > t.price && <s>{money(t.oldPrice)}</s>}
              </span>
              <span className={`sm-badge${t.inShop ? " in" : ""}`}>{t.inShop ? "In the shop" : "Taken out"}</span>
              {t.inShop && t.slug && (
                <a className="sm-see" href={shopHref(`/ready-made/design/${t.slug}`)} target="_blank" rel="noreferrer">
                  See it ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!list.length && <p className="sm-note">No tees match.</p>}
      {list.length > shown && (
        <button type="button" className="sm-btn sm-more" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({list.length - shown} left)
        </button>
      )}

      {picked.length > 0 && (
        <div className="sm-actions" role="region" aria-label="Ticked tees">
          <b>{plural(picked.length, "tee")} ticked</b>
          <div className="sm-row">
            <button type="button" className="sm-btn" disabled={busy} onClick={() => act("Take out", { action: "out" }, `Take ${plural(picked.length, "tee")} out of the shop? They stay here and can be put back.`)}>
              Take out
            </button>
            <button type="button" className="sm-btn sm-btn-dark" disabled={busy} onClick={() => act("Put back", { action: "back" }, `Put ${plural(picked.length, "tee")} back in the shop?`)}>
              Put back
            </button>
            <button type="button" className={`sm-btn${panel === "price" ? " sm-btn-dark" : ""}`} disabled={busy} onClick={() => setPanel(panel === "price" ? "" : "price")}>
              Set price…
            </button>
            <button type="button" className="sm-btn sm-btn-danger" disabled={busy} onClick={() => setPanel(panel === "delete" ? "" : "delete")}>
              Delete for good…
            </button>
          </div>
          {panel === "price" && <PriceInputs busy={busy} count={picked.length} onApply={(price, oldPrice) => act("New price", { action: "price", price, oldPrice }, `Sell ${plural(picked.length, "tee")} at ${money(price)}${oldPrice ? ` (was ${money(oldPrice)})` : ""}?`)} />}
          {panel === "delete" && <DeleteBox count={picked.length} what={`the ${plural(picked.length, "ticked tee")}`} onCancel={() => setPanel("")} onDelete={() => act("Delete for good", { action: "delete" })} />}
        </div>
      )}
    </section>
  );
}
