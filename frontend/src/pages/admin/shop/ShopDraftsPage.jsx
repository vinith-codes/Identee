// Admin → Shop your IDENTEE → Check and show (25 Nov 2026)
//
// The tees made by Add a tee, Add many tees and "+ Add to a style" wait here as drafts (pictures made, not in the
// shop). The admin looks at each one big, then puts the good ones in the shop — nothing reaches customers before.
// A design made in several styles is one card (its family). Fix opens the tee in the Studio; Throw away deletes the draft.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import studioService from "../../../services/studioService";
import { imageUrl } from "../../../utils/imageUrl";
import { styleLabel } from "../../../studio/shopTeeBuilder";
import { why } from "./useTeeMaker";
import "../shopManage.css";
import "./shopEasy.css";

const isDraft = (d) => d.status === "ready" && !d.publishedAt;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function ShopDraftsPage() {
  const [designs, setDesigns] = useState(null);
  const [garments, setGarments] = useState([]);
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState(() => new Set());
  const [busy, setBusy] = useState(null); // { label, done, total }
  const [big, setBig] = useState(null); // a tee shown big

  const load = useCallback(
    () =>
      Promise.all([studioService.listDesigns(), studioService.getSetup()])
        .then(([list, setup]) => {
          setDesigns(list.filter(isDraft));
          setGarments(setup.garments || []);
          setError("");
        })
        .catch((err) => setError(why(err))),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  // one card per design: its tees in every style, newest first
  const groups = useMemo(() => {
    const map = new Map();
    for (const d of designs || []) {
      const k = d.family || `name:${d.name.trim().toLowerCase()}`;
      if (!map.has(k)) map.set(k, { key: k, name: d.name, at: d.createdAt, tees: [] });
      const g = map.get(k);
      g.tees.push(d);
      if (d.createdAt > g.at) g.at = d.createdAt;
    }
    return [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [designs]);
  const garmentOf = (d) => garments.find((g) => g.key === d.garmentType);
  const labelOf = (d) => (garmentOf(d) ? styleLabel(garmentOf(d)) : d.garmentType);
  const allIds = groups.flatMap((g) => g.tees.map((t) => t._id));
  const tick = (ids, on) =>
    setTicked((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const each = async (label, ids, fn) => {
    if (!ids.length || busy) return;
    setBusy({ label, done: 0, total: ids.length });
    const bad = [];
    for (const [i, id] of ids.entries()) {
      try {
        await fn(id);
      } catch (err) {
        bad.push(`${designs.find((d) => d._id === id)?.name || id}: ${why(err)}`);
      }
      setBusy({ label, done: i + 1, total: ids.length });
    }
    setBusy(null);
    setTicked(new Set());
    if (bad.length) toast.error(`${label}: ${bad.length} didn't work — ${bad.slice(0, 3).join(" · ")}`);
    else toast.success(`${label}: done (${plural(ids.length, "tee")}).`);
    await load();
  };
  const show = (ids) => each("Putting in the shop", ids, (id) => studioService.publish(id));
  const throwAway = (ids) => {
    if (!window.confirm(`Throw away ${plural(ids.length, "draft tee")}? They are deleted — this can't be undone.`)) return;
    each("Throwing away", ids, (id) => studioService.removeDesign(id));
  };

  if (error && !designs) return <p className="sm-error">{error}</p>;
  if (!designs) return <p className="sm-note">Loading the drafts…</p>;

  return (
    <div className="sm-page">
      <header className="sm-head">
        <p className="sm-kicker">Shop your IDENTEE</p>
        <h1>Check and show</h1>
        <p className="sm-lead">
          New tees wait here until you put them in the shop. Click a picture to see it big. <b>Show in the shop</b> puts it live at once;{" "}
          <b>Fix</b> opens it in the Studio to move or resize a print.
        </p>
      </header>

      {busy && (
        <div className="sm-busy" role="status">
          {busy.label}… {busy.done} / {busy.total}
          <span style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} />
        </div>
      )}

      {!groups.length ? (
        <section className="sm-card">
          <h2>No drafts waiting</h2>
          <p className="sm-note">
            Make some with <Link to="/admin/shop-add">Add a tee</Link> or <Link to="/admin/shop-add-many">Add many tees</Link>. Tees already in the shop are in{" "}
            <Link to="/admin/shop-manage">Manage the shop</Link>.
          </p>
        </section>
      ) : (
        <>
          <div className="sm-card sd-bar">
            <label className="sm-check">
              <input type="checkbox" checked={ticked.size === allIds.length} onChange={(e) => tick(allIds, e.target.checked)} disabled={Boolean(busy)} />
              Tick all ({plural(allIds.length, "tee")} in {plural(groups.length, "design")})
            </label>
            <span className="sm-gap" />
            <button type="button" className="sm-btn sm-btn-danger" onClick={() => throwAway([...ticked])} disabled={!ticked.size || Boolean(busy)}>
              Throw away ticked
            </button>
            <button type="button" className="sm-btn sm-btn-dark" onClick={() => show([...ticked])} disabled={!ticked.size || Boolean(busy)}>
              Show ticked in the shop ({ticked.size})
            </button>
          </div>

          <div className="sd-list">
            {groups.map((g) => {
              const ids = g.tees.map((t) => t._id);
              const all = ids.every((id) => ticked.has(id));
              const issues = [...new Set(g.tees.flatMap((t) => t.issues || []))];
              return (
                <section key={g.key} className="sm-card sd-group" aria-label={g.name}>
                  <div className="sd-head">
                    <label className="sm-check">
                      <input type="checkbox" checked={all} onChange={(e) => tick(ids, e.target.checked)} disabled={Boolean(busy)} />
                      <b>{g.name}</b>
                    </label>
                    <small className="sm-note">
                      {plural(g.tees.length, "style")} · made {new Date(g.at).toLocaleString()}
                    </small>
                    <span className="sm-gap" />
                    <button type="button" className="sm-btn" onClick={() => show(ids)} disabled={Boolean(busy)}>
                      Show all {g.tees.length} in the shop
                    </button>
                  </div>
                  {issues.length > 0 && (
                    <ul className="se-problems">
                      {issues.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                  <div className="sd-tees">
                    {g.tees.map((t) => (
                      <article key={t._id} className={`sd-tee${ticked.has(t._id) ? " is-ticked" : ""}`}>
                        <button type="button" className="sd-pics" onClick={() => setBig(t)} aria-label={`See ${labelOf(t)} big`}>
                          {t.mockups?.front && <img src={imageUrl(t.mockups.front)} alt="" loading="lazy" />}
                          {t.mockups?.back && <img src={imageUrl(t.mockups.back)} alt="" loading="lazy" />}
                        </button>
                        <label className="sm-check sd-tee-name">
                          <input type="checkbox" checked={ticked.has(t._id)} onChange={(e) => tick([t._id], e.target.checked)} disabled={Boolean(busy)} />
                          {labelOf(t)}
                        </label>
                        <div className="sd-swatches" aria-label="Colours">
                          {(t.colours || []).map((c) => {
                            const colour = garmentOf(t)?.colours.find((x) => x.slug === c.slug);
                            return <i key={c.slug} title={colour?.name || c.slug} style={{ background: colour?.hex || "#999" }} />;
                          })}
                          <small>{plural((t.colours || []).length, "colour")}</small>
                        </div>
                        <div className="sd-actions">
                          <button type="button" className="sm-btn sm-btn-dark" onClick={() => show([t._id])} disabled={Boolean(busy)}>
                            Show
                          </button>
                          <Link className="sm-btn" to={`/admin/studio/${t._id}`}>
                            Fix
                          </Link>
                          <button type="button" className="sm-btn sm-btn-link" onClick={() => throwAway([t._id])} disabled={Boolean(busy)}>
                            Throw away
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {big && <BigTee tee={big} label={labelOf(big)} garment={garmentOf(big)} onClose={() => setBig(null)} />}
    </div>
  );
}

/** One draft big: front and back, in each of its colours. */
function BigTee({ tee, label, garment, onClose }) {
  const [at, setAt] = useState(0);
  const colours = tee.colours?.length ? tee.colours : [{ slug: tee.color, mockups: tee.mockups }];
  const c = colours[at] || colours[0];
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="sd-big" role="dialog" aria-modal="true" aria-label={`${tee.name} — ${label}`} onClick={onClose}>
      <div className="sd-big-box" onClick={(e) => e.stopPropagation()}>
        <div className="sd-big-head">
          <b>
            {tee.name} — {label}
          </b>
          <button type="button" className="sm-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sd-big-pics">
          {["front", "back"].map((side) => c.mockups?.[side] && <img key={side} src={imageUrl(c.mockups[side])} alt={`${side} — ${c.slug}`} />)}
        </div>
        <div className="se-swatches">
          {colours.map((x, i) => {
            const colour = garment?.colours.find((g) => g.slug === x.slug);
            return (
              <button key={x.slug} type="button" className={`se-swatch${i === at ? " is-on" : ""}`} aria-pressed={i === at} onClick={() => setAt(i)}>
                <i style={{ background: colour?.hex || "#999" }} aria-hidden="true" />
                {colour?.name || x.slug}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
