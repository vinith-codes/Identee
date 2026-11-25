// Admin → Shop your IDENTEE → Add a tee (25 Nov 2026)
//
// The owner: "Think as a admin and make it. It should be easy for them to add the product." One page, top to bottom,
// every box already filled with a good answer: collection + name, the front and back pictures, where each prints,
// the styles (Oversized, Round Neck …: Admin → Shop your IDENTEE → Styles), their colours and prices. "Make" makes one
// tee per ticked style, with its pictures in every colour, as drafts — Check and show puts them in the shop.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import studioService from "../../../services/studioService";
import customizationService from "../../../services/customizationService";
import { BACK_SPOTS, FRONT_SPOTS, buildShopTee, fullName, printDpi, shopSize, shopStyles, styleLabel } from "../../../studio/shopTeeBuilder";
import { imageUrl } from "../../../utils/imageUrl";
import useTeeMaker, { familyFor, uploadPicture, why } from "./useTeeMaker";
import { PictureBox, SpotPicker, StylesPicker } from "./shopAddParts";
import { collectionTitles } from "./shopAddUtils";
import "../shopManage.css";
import "./shopEasy.css";

const NEW = "__new__";

export default function ShopAddPage() {
  const [setup, setSetup] = useState(null); // { garments }
  const [designs, setDesigns] = useState([]);
  const [error, setError] = useState("");
  const maker = useTeeMaker();

  // 1. collection and name
  const [collection, setCollection] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [about, setAbout] = useState("");
  const [name, setName] = useState("");
  // 2. pictures: { file, preview, w, h } | null
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  // 3. where they print
  const [frontSpot, setFrontSpot] = useState("centre-front");
  const [backSpot, setBackSpot] = useState("full-back");
  const [lockFront, setLockFront] = useState(false);
  // 4–6. styles, their colours and prices: { [garmentKey]: { on, colours: [slugs], price, oldPrice } }
  const [picks, setPicks] = useState({});
  // 7. more
  const [description, setDescription] = useState("");
  const [featured, setFeatured] = useState(false);
  // a quick look before making
  const [preview, setPreview] = useState(null); // { busy } | { front, back, style, colour } | { error }

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

  const styles = useMemo(() => shopStyles(setup?.garments || []), [setup]);
  const titles = useMemo(() => collectionTitles(designs), [designs]);
  const collectionName = collection === NEW ? newCollection.trim() : collection;
  const full = fullName(collectionName, name);
  const chosen = styles.filter((g) => picks[g.key]?.on);
  const taken = chosen.filter((g) => designs.some((d) => d.status !== "removed" && d.garmentType === g.key && d.name.trim().toLowerCase() === full.toLowerCase()));
  const first = chosen[0];

  // what still has to be done before Make
  const missing = [];
  if (!name.trim()) missing.push("a name for the tee");
  if (collection === NEW && !newCollection.trim()) missing.push("the new collection's name");
  if (full.length > 60) missing.push(`a shorter name (${full.length} letters with the collection, 60 at most)`);
  if (!(front && frontSpot !== "none") && !(back && backSpot !== "none")) missing.push("a front or a back picture");
  if (!chosen.length) missing.push("at least one style");
  for (const g of chosen) if (!picks[g.key].colours.length) missing.push(`a colour for ${styleLabel(g)}`);
  if (taken.length && taken.length === chosen.length) missing.push("a name not used yet (this tee is already made in every ticked style)");

  const setPick = (key, patch) => setPicks((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const dpiOf = (pic, spot, side) => {
    if (!pic || !first || spot === "none") return null;
    const pos = (first.positions || []).find((p) => p.key === spot) || (first.positions || []).find((p) => p.side === side && p.main);
    return printDpi(pic, pos, shopSize(first), spot === "full-back" ? 92 : 100);
  };

  const jobsFor = (family) =>
    chosen
      .filter((g) => !taken.includes(g))
      .map((g) => ({
        t: { name: full, label: name.trim(), about: about.trim() || collectionName, frontSpot: front ? frontSpot : "none", backSpot: back ? backSpot : "none", lockFront, price: Number(picks[g.key].price) || 0, oldPrice: Number(picks[g.key].oldPrice) || 0, description, featured, family },
        garment: g,
        front,
        back,
        colours: g.colours.filter((c) => picks[g.key].colours.includes(c.slug)),
      }));

  const make = async () => {
    if (missing.length || maker.state?.making) return;
    const jobs = jobsFor(familyFor(full, designs));
    const shots = jobs.reduce((n, j) => n + j.colours.length, 0);
    if (!window.confirm(`Make ${jobs.length} tee${jobs.length === 1 ? "" : "s"} (${shots} sets of pictures)? They are saved as drafts — nothing goes in the shop until you press Show in Check and show. Keep this page open — about ${Math.max(1, Math.round((shots * 8) / 60))} minute${shots * 8 > 90 ? "s" : ""}.`)) return;
    const { made } = await maker.run(jobs, designs);
    if (made.length) setDesigns((d) => [...made, ...d]);
  };

  const look = async () => {
    if (!first || maker.state?.making) return;
    setPreview({ busy: true });
    try {
      const f = await uploadPicture(front, maker.uploads.current);
      const b = await uploadPicture(back, maker.uploads.current);
      const { positions: catalog, maxPrint } = await customizationService.getPrintPositions(first.key);
      const tee = buildShopTee({ garment: first, catalog, maxPrint, size: shopSize(first), front: f, back: b, frontSpot: front ? frontSpot : "none", backSpot: back ? backSpot : "none", lockFront });
      const colour = first.colours.find((c) => c.slug === picks[first.key].colours[0]) || first.colours[0];
      const pics = await maker.shoot({ garment: first, positions: tee.positions, size: shopSize(first), colourHex: colour.hex, colourSlug: colour.slug, elements: tee.elements });
      if (!pics) throw new Error("The pictures couldn’t be taken. Try again.");
      setPreview({ front: pics.front, back: pics.back, style: styleLabel(first), colour: colour.name, notes: tee.notes });
    } catch (err) {
      setPreview({ error: why(err) });
    }
  };

  const startAgain = () => {
    setName("");
    setFront(null);
    setBack(null);
    setDescription("");
    setPreview(null);
    maker.setState(null);
  };

  if (error && !setup) return <p className="sm-error">{error}</p>;
  if (!setup) return <p className="sm-note">Loading…</p>;
  const making = Boolean(maker.state?.making);
  const finished = maker.state && !making;

  return (
    <div className="sm-page">
      <header className="sm-head">
        <p className="sm-kicker">Shop your IDENTEE</p>
        <h1>Add a tee</h1>
        <p className="sm-lead">
          Two pictures in, the styles ticked — the tee is made in each style with its pictures in every colour. It waits as a draft in{" "}
          <Link to="/admin/shop-drafts">Check and show</Link> until you put it in the shop. Many tees at once: <Link to="/admin/shop-add-many">Add many tees</Link>.
        </p>
      </header>

      {!styles.length && (
        <p className="sm-failed">
          No style is switched on for shop tees yet — switch one on in <Link to="/admin/shop-styles">Styles</Link>.
        </p>
      )}

      <div className="sa-layout">
        <div className="sa-steps">
          <section className="sm-card sa-step" aria-labelledby="sa-1">
            <h2 id="sa-1">
              <span className="sa-n">1</span>Collection and name
            </h2>
            <div className="se-grid sa-grid-2">
              <label className="sm-field">
                Collection
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
              <label className="sm-field">
                The tee&apos;s name
                <input value={name} maxLength={58} onChange={(e) => setName(e.target.value)} placeholder="Tiger Saranam" disabled={making} />
              </label>
            </div>
            {name.trim() && (
              <p className="sm-note sa-full">
                In the shop: <b>{full}</b>
                {taken.length > 0 && <span className="sa-warn"> · already made in {taken.map(styleLabel).join(", ")} (those are skipped)</span>}
              </p>
            )}
          </section>

          <section className="sm-card sa-step" aria-labelledby="sa-2">
            <h2 id="sa-2">
              <span className="sa-n">2</span>Pictures
            </h2>
            <p className="sm-note">PNG, JPG or WebP, full size — they are never made smaller. Either one may be left empty.</p>
            <div className="sa-pics">
              <PictureBox label="Front picture" pic={front} onPick={setFront} dpi={dpiOf(front, frontSpot, "front")} disabled={making} />
              <PictureBox label="Back picture" pic={back} onPick={setBack} dpi={dpiOf(back, backSpot, "back")} disabled={making} />
            </div>
          </section>

          <section className="sm-card sa-step" aria-labelledby="sa-3">
            <h2 id="sa-3">
              <span className="sa-n">3</span>Where it prints
            </h2>
            <SpotPicker title="Front" side="front" spots={FRONT_SPOTS} value={front ? frontSpot : "none"} onChange={setFrontSpot} disabled={!front || making} empty={!front && "Add a front picture first"} />
            <SpotPicker title="Back" side="back" spots={BACK_SPOTS} value={back ? backSpot : "none"} onChange={setBackSpot} disabled={!back || making} empty={!back && "Add a back picture first"} />
            {front && frontSpot !== "none" && (
              <label className="sm-check sa-lock">
                <input type="checkbox" checked={lockFront} onChange={(e) => setLockFront(e.target.checked)} disabled={making} />
                Lock the front picture — customers can change the rest but not this (like the GTA logo)
              </label>
            )}
          </section>

          <section className="sm-card sa-step" aria-labelledby="sa-4">
            <h2 id="sa-4">
              <span className="sa-n">4</span>Styles, colours and price
            </h2>
            <p className="sm-note">
              One tee is made for each ticked style. The colours and prices come from <Link to="/admin/shop-styles">Styles</Link> — untick a colour this tee
              shouldn&apos;t have, or give it its own price.
            </p>
            <StylesPicker styles={styles} picks={picks} setPick={setPick} disabled={making} />
          </section>

          <details className="sm-card sa-step sa-more">
            <summary>
              <span className="sa-n">5</span>More details <small>(optional)</small>
            </summary>
            <label className="sm-field">
              Collection words in the description
              <input value={about} maxLength={40} onChange={(e) => setAbout(e.target.value)} placeholder={collectionName || "Ayyappa"} disabled={making} />
            </label>
            <label className="sm-field">
              Description (left empty, one is written for you)
              <textarea value={description} maxLength={3000} rows={3} onChange={(e) => setDescription(e.target.value)} disabled={making} />
            </label>
            <label className="sm-check">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} disabled={making} />
              Show it among the featured tees
            </label>
          </details>
        </div>

        <aside className="sm-card sa-side" aria-label="Preview and make">
          <h2>Preview</h2>
          {preview?.front ? (
            <>
              <div className="sa-preview">
                <img src={imageUrl(preview.front)} alt="Front preview" />
                <img src={imageUrl(preview.back)} alt="Back preview" />
              </div>
              <p className="sm-note">
                {preview.style}, {preview.colour}
              </p>
              {preview.notes?.length > 0 && <p className="sa-warn">{preview.notes.join(" ")}</p>}
            </>
          ) : (
            <p className="sm-note">{preview?.busy ? "Taking the pictures…" : preview?.error || "See the tee on the hanger photo before making it."}</p>
          )}
          <button type="button" className="sm-btn" onClick={look} disabled={!first || (!front && !back) || making || preview?.busy}>
            {preview?.busy ? "Taking the pictures…" : "See it on the tee"}
          </button>

          <hr className="sa-hr" />
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
          {(!finished || maker.state.failed?.length > 0) && ( /* a tee that failed can be tried again (the made ones are skipped) */
            <button type="button" className="sm-btn sm-btn-dark sa-make" onClick={make} disabled={missing.length > 0 || making}>
              {making ? `Making… ${maker.state.done} / ${maker.state.total}` : `Make ${Math.max(0, chosen.length - taken.length)} tee${chosen.length - taken.length === 1 ? "" : "s"}`}
            </button>
          )}
          {making && (
            <button type="button" className="sm-btn" onClick={maker.stop}>
              Stop after this one
            </button>
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
              <button type="button" className="sm-btn" onClick={startAgain}>
                Add another tee
              </button>
            </div>
          )}
        </aside>
      </div>
      {maker.camera}
    </div>
  );
}
