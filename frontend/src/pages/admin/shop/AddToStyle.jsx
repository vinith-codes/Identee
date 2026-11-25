// pages/admin/shop/AddToStyle.jsx — Manage the shop → "+ Add to a style" (25 Nov 2026)
//
// The ticked tees (or one tee's "+ style") made again in another style — a Polo, or Round Neck for a tee only sold
// as Oversized: the same front and back pictures in the same places (studio/shopTeeBuilder.js picturesOf), that
// style's colours and price, the same family. They are made as drafts; Check and show puts them in the shop.
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import studioService from "../../../services/studioService";
import { picturesOf, shopStyles, styleLabel } from "../../../studio/shopTeeBuilder";
import useTeeMaker, { why } from "./useTeeMaker";

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
/** The family a Manage-the-shop row belongs to (an older tee without one: its name). */
const familyKey = (t) => t.family || `name:${norm(t.name)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function AddToStyle({ tees, picked, garments, busy, onClose }) {
  const styles = useMemo(() => shopStyles(garments), [garments]);
  const [key, setKey] = useState("");
  const [problem, setProblem] = useState("");
  const maker = useTeeMaker();
  const garment = styles.find((g) => g.key === key);

  // one source tee per family among the ticked ones, and whether the family already has the chosen style
  const families = useMemo(() => {
    const map = new Map();
    for (const t of tees.filter((x) => picked.includes(x._id))) if (!map.has(familyKey(t))) map.set(familyKey(t), t);
    return [...map.entries()].map(([k, source]) => ({ key: k, source, has: new Set(tees.filter((x) => familyKey(x) === k).map((x) => x.garmentType)) }));
  }, [tees, picked]);
  const todo = garment ? families.filter((f) => !f.has.has(garment.key)) : [];

  const make = async () => {
    if (!garment || !todo.length || maker.state?.making) return;
    const shots = todo.length * garment.shop.colours.length;
    if (!window.confirm(`Make ${plural(todo.length, "tee")} in ${styleLabel(garment)} (up to ${shots} sets of pictures)? They are saved as drafts — nothing goes in the shop until you press Show in Check and show. Keep this page open.`)) return;
    setProblem("");
    try {
      const jobs = [];
      for (const f of todo) {
        const d = await studioService.getDesign(f.source._id);
        const p = picturesOf(d);
        if (!p.front && !p.back) continue;
        const theirs = new Set((d.colours?.length ? d.colours : [{ slug: d.color }]).map((c) => c.slug));
        const sold = garment.colours.filter((c) => garment.shop.colours.includes(c.slug));
        const same = sold.filter((c) => theirs.has(c.slug));
        const parts = String(d.name).split(" · ");
        jobs.push({
          t: {
            name: d.name,
            label: parts.length > 1 ? parts.slice(1).join(" · ") : d.name,
            about: parts.length > 1 ? parts[0] : "",
            frontSpot: p.frontSpot,
            backSpot: p.backSpot,
            lockFront: p.lockFront,
            price: 0,
            oldPrice: 0,
            description: "",
            featured: Boolean(d.product?.featured),
            family: d.family || "",
            notes: p.left ? [`${plural(p.left, "other print")} on the first tee (words or more pictures) ${p.left === 1 ? "was" : "were"} not copied — press Fix to add ${p.left === 1 ? "it" : "them"}.`] : [],
          },
          garment,
          front: p.front,
          back: p.back,
          colours: same.length ? same : sold,
        });
      }
      // (drafts made before and not yet shown are not in this list: the Studio's list stops them being made twice)
      await maker.run(jobs, await studioService.listDesigns());
    } catch (err) {
      setProblem(why(err));
    }
  };

  const making = Boolean(maker.state?.making);
  return (
    <div className="sm-add-style">
      <div className="sm-row">
        <label className="sm-field">
          Make the {plural(families.length, "ticked design")} in
          <select value={key} onChange={(e) => setKey(e.target.value)} disabled={making}>
            <option value="">Choose a style…</option>
            {styles.map((g) => (
              <option key={g.key} value={g.key}>
                {styleLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="sm-btn sm-btn-dark" onClick={make} disabled={!todo.length || making || busy}>
          {making ? `Making… ${maker.state.done} / ${maker.state.total}` : `Make ${plural(todo.length, "tee")}`}
        </button>
        {making && (
          <button type="button" className="sm-btn" onClick={maker.stop}>
            Stop after this one
          </button>
        )}
        {!making && (
          <button type="button" className="sm-btn sm-btn-link" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {garment && todo.length < families.length && (
        <p className="sm-note">
          {plural(families.length - todo.length, "design")} already {families.length - todo.length === 1 ? "has" : "have"} {styleLabel(garment)} — skipped.
        </p>
      )}
      {problem && <p className="sa-warn">{problem}</p>}
      {maker.state?.note && (
        <p className="sm-note" role="status">
          {maker.state.note} {!making && maker.state.made?.length > 0 && <Link to="/admin/shop-drafts">Open Check and show →</Link>}
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
      {maker.camera}
    </div>
  );
}
