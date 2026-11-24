// Admin → Design Studio → Studio → "Make shop tees from a list" (24 Nov 2026)
// The owner sent 20 Ayyappa pictures and picked all 45 tees made from them: "All three" garments (Oversized, Round Neck
// Men and Women), the shop's prices, a card of its own in Shop your IDENTEE. Made by hand that is 114 tees, so the admin
// picks a list file (which pictures make which tee, in which colours) together with its pictures, and this makes them:
//   - each picture is uploaded once, full size;
//   - each tee × garment: the front logo big across the chest, locked (as on the GTA tees, so the shop shows the back
//     first), the back picture printed big (studio/trendTee.js); a tee with no back has only the logo;
//   - the four pictures of each colour on the hanger photo (MockupCamera), saved, published straight into the shop;
//   - a tee already made (same name, same garment) is skipped, so pressing again makes only what is missing.
// The list file: studio/shopTeeMaker.js readTeeList.
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import studioService from "../../../services/studioService";
import customizationService from "../../../services/customizationService";
import aiService from "../../../services/aiService";
import MockupCamera from "../../../studio/MockupCamera";
import { listingOf, readTeeList, sizeOf, teesToMake } from "../../../studio/shopTeeMaker";
import { trendShopTee } from "../../../studio/trendTee";

const why = (err) => err?.response?.data?.message || err?.message || "That didn’t work.";

export default function ListShopTees({ onMade }) {
  const [state, setState] = useState(null); // null | { making, done, total, failed: [], note }
  const [job, setJob] = useState(null);
  const jobDone = useRef(null);
  const stop = useRef(false);
  const picker = useRef(null);

  const shoot = (j) =>
    new Promise((resolve) => {
      jobDone.current = resolve;
      setJob({ ...j, id: `list${Date.now()}${Math.random()}` });
    });
  const onShots = (pictures) => {
    setJob(null);
    const done = jobDone.current;
    jobDone.current = null;
    done?.(pictures);
  };

  const make = async (fileList) => {
    const files = [...(fileList || [])];
    if (picker.current) picker.current.value = "";
    const listFile = files.filter((f) => /\.json$/i.test(f.name));
    if (listFile.length !== 1) return setState({ making: false, done: 0, total: 0, failed: [], note: "Pick one list file (.json) together with its pictures." });
    stop.current = false;
    setState({ making: true, done: 0, total: 0, failed: [], note: "Reading the list…" });
    try {
      const pictures = files.filter((f) => f !== listFile[0]);
      const list = readTeeList(await listFile[0].text(), pictures.map((f) => f.name));
      if (list.problems.length) return setState({ making: false, done: 0, total: 0, failed: list.problems, note: "The list needs fixing first — nothing was made." });
      const [setup, designs] = await Promise.all([studioService.getSetup(), studioService.listDesigns()]);
      const { todo, made, skipped } = teesToMake(list, setup.garments || [], designs);
      if (!todo.length) return setState({ making: false, done: 0, total: 0, failed: skipped, note: `All ${made} ${list.prefix} shop tees are already made.` });
      const shots = todo.reduce((n, t) => n + t.colours.length, 0);
      const words = `Make ${todo.length} ${list.prefix} shop tee${todo.length === 1 ? "" : "s"} (${shots} sets of pictures${made ? `, ${made} already made` : ""})? Each one goes into Shop your IDENTEE straight away. Keep this page open — about ${Math.max(1, Math.round((shots * 8) / 60))} minutes.`;
      if (!window.confirm(words)) return setState(null);

      // each picture the tees use, uploaded once (full size)
      const byName = new Map(pictures.map((f) => [f.name.toLowerCase(), f]));
      const needed = [...new Set(todo.flatMap((t) => [t.front, t.back]).filter(Boolean).map((n) => n.toLowerCase()))];
      const uploaded = new Map();
      for (const [i, n] of needed.entries()) {
        if (stop.current) break;
        setState({ making: true, done: 0, total: todo.length, failed: [], note: `Uploading the pictures… ${i + 1} / ${needed.length}` });
        const { path } = await aiService.trendPicture(byName.get(n));
        uploaded.set(n, await sizeOf(path));
      }

      const where = new Map();
      const failed = [...skipped];
      let done = 0;
      for (const t of todo) {
        if (stop.current) break;
        setState({ making: true, done, total: todo.length, failed, note: `Making “${t.name}” — ${t.garment.label}…` });
        try {
          if (!where.has(t.garment.key)) where.set(t.garment.key, await customizationService.getPrintPositions(t.garment.key));
          const { positions: catalog, maxPrint } = where.get(t.garment.key);
          const logo = uploaded.get(t.front.toLowerCase());
          const back = t.back ? uploaded.get(t.back.toLowerCase()) : null;
          const tee = trendShopTee({ garment: t.garment, catalog, maxPrint, size: "M", logo, back, logoAt: list.logoAt, fill: 100 });
          if (!tee) throw new Error("this garment has no front or back print area");
          const colours = [];
          for (const c of t.colours) {
            const j = { garment: t.garment, positions: tee.positions, size: "M", colourHex: c.hex, colourSlug: c.slug, elements: tee.elements };
            const pics = (await shoot(j)) || (await shoot(j));
            if (!pics) throw new Error(`the pictures in ${c.name} couldn’t be taken`);
            colours.push({ slug: c.slug, mockups: pics });
          }
          const ls = listingOf(designs, t.plan);
          const sides = t.back ? "Front: the words, big across the chest. Back: the picture, printed big." : "Front: printed big across the chest. Back: plain.";
          const saved = await studioService.saveDesign({
            garmentType: t.garment.key,
            color: colours[0].slug,
            size: "M",
            name: t.name,
            blurb: t.back ? `${t.label} — the picture big on the back, the words across the front.` : `${t.label} — big across the front.`,
            elements: tee.elements,
            colours,
            sizes: t.garment.sizes,
            category: ls.listings[0].category,
            product: { ...ls, description: `${list.about} tee: ${t.label}. ${sides} ${t.plan.fit}, ${ls.fabric}, DTF print, made to order.` },
          });
          await studioService.publish(saved._id);
          done += 1;
        } catch (err) {
          failed.push(`${t.name} (${t.garment.label}): ${why(err)}`);
        }
      }
      setState({ making: false, done, total: todo.length, failed, note: stop.current ? `Stopped. ${done} made — pick the same files again to make the rest.` : `${done} of ${todo.length} ${list.prefix} shop tees made and in the shop.` });
      if (done) toast.success(`${done} ${list.prefix} shop tee${done === 1 ? "" : "s"} made.`);
      if (done) onMade?.();
    } catch (err) {
      setState((s) => ({ making: false, done: s?.done || 0, total: s?.total || 0, failed: [...(s?.failed || []), why(err)], note: "Stopped by a problem." }));
    }
  };

  return (
    <article className="st-tee" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8, padding: 14 }}>
      <b>Make shop tees from a list</b>
      <small className="st-note">
        Pick a list file (.json) and all its pictures together. Each tee is made on every garment in the list, in its colours, with its pictures on the hanger photo, and goes straight into Shop your IDENTEE. Tees already made are skipped.
      </small>
      <div className="st-row">
        <label className={`st-btn st-btn-small st-btn-primary${state?.making ? " is-disabled" : ""}`} style={{ position: "relative", cursor: state?.making ? "default" : "pointer", opacity: state?.making ? 0.5 : 1 }}>
          {state?.making ? `Making… ${state.done} / ${state.total}` : "Pick the list + pictures"}
          <input ref={picker} type="file" multiple accept=".json,application/json,image/png,image/jpeg,image/webp" disabled={state?.making} onChange={(e) => make(e.target.files)} style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} />
        </label>
        {state?.making && (
          <button type="button" className="st-btn st-btn-small" onClick={() => (stop.current = true)}>
            Stop after this tee
          </button>
        )}
      </div>
      {state?.note && <small className="st-note" role="status">{state.note}</small>}
      {state?.failed?.length > 0 && (
        <ul className="st-error" style={{ margin: 0, paddingLeft: 18 }}>
          {state.failed.slice(0, 12).map((f) => (
            <li key={f}>{f}</li>
          ))}
          {state.failed.length > 12 && <li>… and {state.failed.length - 12} more</li>}
        </ul>
      )}
      {job && <MockupCamera key={job.id} job={job} onDone={onShots} />}
    </article>
  );
}
