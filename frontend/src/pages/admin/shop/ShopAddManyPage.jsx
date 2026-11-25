// Admin → Shop your IDENTEE → Add many tees (25 Nov 2026)
//
// A whole collection at once. The settings are chosen once (collection, where it prints, styles, colours, prices),
// then all the pictures are dropped in together. Files named "tiger-front.png" and "tiger-back.png" become one tee
// "Tiger"; a file without -front / -back waits in the loose tray until the admin says what it is. Every name can be
// changed in the list. "Make all" makes each tee in each ticked style as drafts — Check and show puts them in the shop.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import studioService from "../../../services/studioService";
import { BACK_SPOTS, FRONT_SPOTS, fullName, printDpi, shopSize, shopStyles, styleLabel } from "../../../studio/shopTeeBuilder";
import useTeeMaker, { familyFor, why } from "./useTeeMaker";
import { SpotPicker, StylesPicker } from "./shopAddParts";
import { collectionTitles, pairPictures, readPicture, sideOf, teeNameOf } from "./shopAddUtils";
import "../shopManage.css";
import "./shopEasy.css";

const NEW = "__new__";
const MAX_FILES = 200;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
let nextId = 1;
const newId = () => `r${nextId++}`;

export default function ShopAddManyPage() {
  const [setup, setSetup] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [error, setError] = useState("");
  const maker = useTeeMaker();

  const [collection, setCollection] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [frontSpot, setFrontSpot] = useState("centre-front");
  const [backSpot, setBackSpot] = useState("full-back");
  const [lockFront, setLockFront] = useState(false);
  const [picks, setPicks] = useState({});
  // the tees: [{ id, name, front, back, on }] — front/back: { file, preview, w, h } | null
  const [rows, setRows] = useState([]);
  const [loose, setLoose] = useState([]); // [{ id, pic }]
  const [refused, setRefused] = useState([]); // words about files that couldn't be used
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const previews = useRef(new Set());

  useEffect(() => {
    Promise.all([studioService.getSetup(), studioService.listDesigns()])
      .then(([s, list]) => {
        setSetup(s);
        setDesigns(list);
        const start = {};
        for (const g of shopStyles(s.garments)) start[g.key] = { on: true, colours: [...g.shop.colours], price: "", oldPrice: "" };
        setPicks(start);
      })
      .catch((err) => setError(why(err)));
  }, []);
  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const styles = useMemo(() => shopStyles(setup?.garments || []), [setup]);
  const titles = useMemo(() => collectionTitles(designs), [designs]);
  const collectionName = collection === NEW ? newCollection.trim() : collection;
  const chosen = styles.filter((g) => picks[g.key]?.on);
  const first = chosen[0];
  const setPick = (key, patch) => setPicks((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const making = Boolean(maker.state?.making);

  // ---- files in ----
  const addFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length || making) return;
    const room = MAX_FILES - rows.reduce((n, r) => n + (r.front ? 1 : 0) + (r.back ? 1 : 0), 0) - loose.length;
    const bad = files.length > room ? [`Only ${MAX_FILES} pictures at a time — ${files.length - Math.max(0, room)} were left out. Make these first, then add the rest.`] : [];
    setReading(true);
    const pics = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const pic = await readPicture(file);
        previews.current.add(pic.preview);
        pics.push(pic);
      } catch (err) {
        bad.push(err.message);
      }
    }
    const paired = pairPictures(pics);
    const nextRows = rows.map((r) => ({ ...r }));
    const nextLoose = [...loose, ...paired.loose.map((pic) => ({ id: newId(), pic }))];
    for (const p of paired.rows) {
      const same = nextRows.find((r) => r.name.trim().toLowerCase() === p.name.toLowerCase());
      if (!same) {
        nextRows.push({ id: newId(), name: p.name, front: p.front, back: p.back, on: true });
        continue;
      }
      for (const side of ["front", "back"]) {
        if (!p[side]) continue;
        if (same[side]) nextLoose.push({ id: newId(), pic: p[side] });
        else same[side] = p[side];
      }
    }
    setRows(nextRows);
    setLoose(nextLoose);
    setRefused((cur) => [...cur, ...bad]);
    setReading(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    addFiles(e.dataTransfer.files);
  };

  // ---- the list ----
  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const dropRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const placeLoose = (item, where) => {
    if (!where) return;
    setLoose((ls) => ls.filter((l) => l.id !== item.id));
    if (where === "bin") return;
    const [side, target] = where.split(":");
    if (target === "new") setRows((rs) => [...rs, { id: newId(), name: teeNameOf(item.pic.file.name), front: side === "front" ? item.pic : null, back: side === "back" ? item.pic : null, on: true }]);
    else setRow(target, { [side]: item.pic });
  };

  const dpiOf = (pic, spot, side) => {
    if (!pic || !first || spot === "none") return null;
    const pos = (first.positions || []).find((p) => p.key === spot) || (first.positions || []).find((p) => p.side === side && p.main);
    return printDpi(pic, pos, shopSize(first), spot === "full-back" ? 92 : 100);
  };
  const names = rows.map((r) => fullName(collectionName, r.name).toLowerCase());
  const checkRow = (r) => {
    const full = fullName(collectionName, r.name);
    const stop = [];
    const warn = [];
    if (!r.name.trim()) stop.push("needs a name");
    else if (full.length > 60) stop.push(`name too long (${full.length} letters with the collection, 60 at most)`);
    else if (names.filter((n) => n === full.toLowerCase()).length > 1) stop.push("the same name as another tee here");
    const usesFront = r.front && frontSpot !== "none";
    const usesBack = r.back && backSpot !== "none";
    if (!usesFront && !usesBack) stop.push(r.front || r.back ? "its picture's side is set to print nowhere" : "no picture");
    for (const [pic, spot, side] of [
      [usesFront && r.front, frontSpot, "front"],
      [usesBack && r.back, backSpot, "back"],
    ]) {
      const dpi = pic ? dpiOf(pic, spot, side) : null;
      if (dpi && dpi < 150) warn.push(`${side} picture small (about ${dpi} dots per inch) — may print soft`);
    }
    const taken = chosen.filter((g) => designs.some((d) => d.status !== "removed" && d.garmentType === g.key && d.name.trim().toLowerCase() === full.toLowerCase()));
    if (chosen.length && taken.length === chosen.length) stop.push("already made in every ticked style");
    else if (taken.length) warn.push(`already made in ${taken.map(styleLabel).join(", ")} — those are skipped`);
    return { full, stop, warn, styles: chosen.filter((g) => !taken.includes(g)) };
  };
  const checked = rows.map((r) => ({ r, ...checkRow(r) }));
  const ready = checked.filter((c) => c.r.on && !c.stop.length);
  const teeCount = ready.reduce((n, c) => n + c.styles.length, 0);

  const missing = [];
  if (collection === NEW && !newCollection.trim()) missing.push("the new collection's name");
  if (!chosen.length) missing.push("at least one style");
  for (const g of chosen) if (!picks[g.key].colours.length) missing.push(`a colour for ${styleLabel(g)}`);
  if (!rows.length) missing.push("the pictures");
  else if (!ready.length) missing.push("at least one ticked tee with nothing in red");
  if (loose.length) missing.push(`say what the ${plural(loose.length, "loose picture")} ${loose.length === 1 ? "is" : "are"} (or bin ${loose.length === 1 ? "it" : "them"})`);

  const make = async () => {
    if (missing.length || making) return;
    const jobs = ready.flatMap((c) => {
      const family = familyFor(c.full, designs);
      return c.styles.map((g) => ({
        t: { name: c.full, label: c.r.name.trim(), about: collectionName, frontSpot: c.r.front ? frontSpot : "none", backSpot: c.r.back ? backSpot : "none", lockFront, price: Number(picks[g.key].price) || 0, oldPrice: Number(picks[g.key].oldPrice) || 0, description: "", featured: false, family },
        garment: g,
        front: c.r.front,
        back: c.r.back,
        colours: g.colours.filter((x) => picks[g.key].colours.includes(x.slug)),
      }));
    });
    const shots = jobs.reduce((n, j) => n + j.colours.length, 0);
    const minutes = Math.max(1, Math.round((shots * 8) / 60));
    if (!window.confirm(`Make ${plural(jobs.length, "tee")} from ${plural(ready.length, "design")} (${shots} sets of pictures, about ${plural(minutes, "minute")})? They are saved as drafts — nothing goes in the shop until you press Show in Check and show. Keep this page open; Stop pauses after the tee being made.`)) return;
    const { made } = await maker.run(jobs, designs);
    if (made.length) setDesigns((d) => [...made, ...d]);
  };

  if (error && !setup) return <p className="sm-error">{error}</p>;
  if (!setup) return <p className="sm-note">Loading…</p>;
  const finished = maker.state && !making;

  return (
    <div className="sm-page">
      <header className="sm-head">
        <p className="sm-kicker">Shop your IDENTEE</p>
        <h1>Add many tees</h1>
        <p className="sm-lead">
          A whole collection at once: choose the settings once, drop in all the pictures, check the names, Make all. They wait as drafts in{" "}
          <Link to="/admin/shop-drafts">Check and show</Link>. One tee only: <Link to="/admin/shop-add">Add a tee</Link>.
        </p>
      </header>

      {!styles.length && (
        <p className="sm-failed">
          No style is switched on for shop tees yet — switch one on in <Link to="/admin/shop-styles">Styles</Link>.
        </p>
      )}

      <div className="sa-layout">
        <div className="sa-steps">
          <section className="sm-card sa-step" aria-labelledby="am-1">
            <h2 id="am-1">
              <span className="sa-n">1</span>Collection
            </h2>
            <div className="se-grid sa-grid-2">
              <label className="sm-field">
                Collection for all these tees
                <select value={collection} onChange={(e) => setCollection(e.target.value)} disabled={making}>
                  <option value="">No collection</option>
                  {titles.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value={NEW}>+ New collection…</option>
                </select>
              </label>
              {collection === NEW && (
                <label className="sm-field">
                  New collection&apos;s name
                  <input value={newCollection} maxLength={24} onChange={(e) => setNewCollection(e.target.value.replace(/·/g, ""))} placeholder="AYYAPPA" disabled={making} />
                </label>
              )}
            </div>
          </section>

          <section className="sm-card sa-step" aria-labelledby="am-2">
            <h2 id="am-2">
              <span className="sa-n">2</span>Where they print
            </h2>
            <p className="sm-note">The same places for every tee here. A tee with only a front (or only a back) picture prints only there.</p>
            <SpotPicker title="Front pictures" side="front" spots={FRONT_SPOTS} value={frontSpot} onChange={setFrontSpot} disabled={making} />
            <SpotPicker title="Back pictures" side="back" spots={BACK_SPOTS} value={backSpot} onChange={setBackSpot} disabled={making} />
            {frontSpot !== "none" && (
              <label className="sm-check sa-lock">
                <input type="checkbox" checked={lockFront} onChange={(e) => setLockFront(e.target.checked)} disabled={making} />
                Lock the front pictures — customers can change the rest but not these (like the GTA logo)
              </label>
            )}
          </section>

          <section className="sm-card sa-step" aria-labelledby="am-3">
            <h2 id="am-3">
              <span className="sa-n">3</span>Styles, colours and price
            </h2>
            <p className="sm-note">Every tee here is made in each ticked style, in the ticked colours.</p>
            <StylesPicker styles={styles} picks={picks} setPick={setPick} disabled={making} />
          </section>

          <section className="sm-card sa-step" aria-labelledby="am-4">
            <h2 id="am-4">
              <span className="sa-n">4</span>Pictures
            </h2>
            <p className="sm-note">
              Name the files <b>tiger-front.png</b> and <b>tiger-back.png</b> — they become one tee called &quot;Tiger&quot;. PNG, JPG or WebP, full size (never made smaller), up to {MAX_FILES} at a time.
            </p>
            <div
              className={`am-drop${over ? " is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <button type="button" className="sa-drop-btn" onClick={() => input.current?.click()} disabled={making || reading}>
                {reading ? "Reading the pictures…" : "Drop all the pictures here"}
                <small>or click to choose them</small>
              </button>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {refused.length > 0 && (
              <div className="sm-failed am-refused">
                <b>Not used:</b>
                <ul>
                  {refused.map((m, i) => (
                    <li key={`${i}${m}`}>{m}</li>
                  ))}
                </ul>
                <button type="button" className="sm-btn sm-btn-link" onClick={() => setRefused([])}>
                  OK
                </button>
              </div>
            )}

            {loose.length > 0 && (
              <div className="am-loose" aria-label="Loose pictures">
                <b>
                  {plural(loose.length, "loose picture")} — {loose.length === 1 ? "its" : "their"} name doesn&apos;t end in -front or -back. What {loose.length === 1 ? "is it" : "are they"}?
                </b>
                <ul>
                  {loose.map((l) => (
                    <li key={l.id}>
                      <img src={l.pic.preview} alt="" />
                      <span className="am-file">{l.pic.file.name}</span>
                      <select value="" onChange={(e) => placeLoose(l, e.target.value)} aria-label={`What ${l.pic.file.name} is`} disabled={making}>
                        <option value="">Choose…</option>
                        <option value="front:new">Front of a new tee “{teeNameOf(l.pic.file.name) || "?"}”</option>
                        <option value="back:new">Back of a new tee “{teeNameOf(l.pic.file.name) || "?"}”</option>
                        {rows.map((r) =>
                          ["front", "back"].map(
                            (side) =>
                              !r[side] && (
                                <option key={`${side}${r.id}`} value={`${side}:${r.id}`}>
                                  {side === "front" ? "Front" : "Back"} of “{r.name || "no name"}”
                                </option>
                              ),
                          ),
                        )}
                        <option value="bin">Leave it out</option>
                      </select>
                      {sideOf(l.pic.file.name) && <small className="sm-note">(another {sideOf(l.pic.file.name)} with this name is already in the list)</small>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length > 0 && (
              <>
                <div className="sm-listbar am-listbar">
                  <label className="sm-check">
                    <input type="checkbox" checked={rows.every((r) => r.on)} onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, on: e.target.checked })))} disabled={making} />
                    {plural(rows.length, "tee")} · {ready.length} ready
                  </label>
                  <button
                    type="button"
                    className="sm-btn sm-btn-link"
                    disabled={making}
                    onClick={() => {
                      if (window.confirm("Clear the whole list and the loose pictures?")) {
                        setRows([]);
                        setLoose([]);
                      }
                    }}
                  >
                    Clear the list
                  </button>
                </div>
                <ul className="am-rows">
                  {checked.map(({ r, full, stop, warn, styles: todo }) => (
                    <li key={r.id} className={`am-row${r.on ? "" : " is-off"}${stop.length ? " is-bad" : ""}`}>
                      <input type="checkbox" checked={r.on} onChange={(e) => setRow(r.id, { on: e.target.checked })} aria-label={`Make ${r.name || "this tee"}`} disabled={making} />
                      <div className="am-pics">
                        {["front", "back"].map((side) => (
                          <figure key={side} className={r[side] ? "" : "is-empty"}>
                            {r[side] ? <img src={r[side].preview} alt={`${side} — ${r[side].file.name}`} title={`${r[side].file.name} · ${r[side].w}×${r[side].h}`} /> : <span>no {side}</span>}
                            <figcaption>{side}</figcaption>
                          </figure>
                        ))}
                      </div>
                      <div className="am-body">
                        <input className="am-name" value={r.name} maxLength={58} onChange={(e) => setRow(r.id, { name: e.target.value })} aria-label="Tee name" disabled={making} />
                        <small className="sm-note">
                          {full || "—"}
                          {!stop.length && todo.length > 0 && ` · ${todo.map(styleLabel).join(", ")}`}
                        </small>
                        {stop.map((m) => (
                          <small key={m} className="am-stop">
                            {m}
                          </small>
                        ))}
                        {warn.map((m) => (
                          <small key={m} className="sa-warn">
                            {m}
                          </small>
                        ))}
                      </div>
                      <div className="am-btns">
                        <button type="button" className="sm-btn sm-btn-link" onClick={() => setRow(r.id, { front: r.back, back: r.front })} disabled={making} title="The front picture was the back, and the back the front">
                          Swap front/back
                        </button>
                        <button type="button" className="sm-btn sm-btn-link" onClick={() => dropRow(r.id)} disabled={making}>
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <aside className="sm-card sa-side" aria-label="Make all">
          <h2>Make all</h2>
          <p className="sm-note">
            {ready.length ? (
              <>
                <b>{plural(teeCount, "tee")}</b> from {plural(ready.length, "design")}
                {chosen.length ? ` in ${chosen.map(styleLabel).join(", ")}` : ""}.
              </>
            ) : (
              "Nothing to make yet."
            )}
          </p>
          <p className="sm-note">To check one first, make it alone in <Link to="/admin/shop-add">Add a tee</Link> and use See it on the tee.</p>
          {missing.length > 0 && !finished && (
            <div className="sa-missing">
              <b>Still needed:</b>
              <ul>
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {!finished && (
            <button type="button" className="sm-btn sm-btn-dark sa-make" onClick={make} disabled={missing.length > 0 || making}>
              {making ? `Making… ${maker.state.done} / ${maker.state.total}` : `Make all ${plural(teeCount, "tee")}`}
            </button>
          )}
          {making && (
            <>
              <div className="sm-busy" role="progressbar" aria-valuemin={0} aria-valuemax={maker.state.total} aria-valuenow={maker.state.done}>
                {maker.state.done} / {maker.state.total}
                <span style={{ width: `${Math.round((maker.state.done / Math.max(1, maker.state.total)) * 100)}%` }} />
              </div>
              <button type="button" className="sm-btn" onClick={maker.stop}>
                Stop after this one
              </button>
            </>
          )}
          {maker.state?.note && (
            <p className="sm-note sa-status" role="status">
              {maker.state.note}
            </p>
          )}
          {maker.state?.failed?.length > 0 && (
            <ul className="sm-failed">
              {maker.state.failed.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.message}
                </li>
              ))}
            </ul>
          )}
          {finished && (
            <div className="sm-row">
              <Link className="sm-btn sm-btn-dark" to="/admin/shop-drafts">
                Check and show →
              </Link>
              <button type="button" className="sm-btn" onClick={() => maker.setState(null)}>
                Back to the list
              </button>
            </div>
          )}
        </aside>
      </div>
      {maker.camera}
    </div>
  );
}
