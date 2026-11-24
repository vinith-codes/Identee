// Admin → Design Studio → Trends → "Make GTA shop tees" (23 Nov 2026)
// The owner moved GTA from the home page into Shop your IDENTEE: "in that we are [selling] SCENE t-shirts and also
// allowing [them to] customize it — like that implement GTA. The front side is fixed and the remaining all they can
// customize … there [are] also ready designs we already uploaded … round neck too."
// So a trend's ready backs become shop tees, a collection of their own ("GTA · <name>", like "SCENE · <name>"):
//   - one tee for each ready back × garment (Oversized Unisex, Round Neck Men, Round Neck Women — listed like the SCENE
//     tees of the same garment), in the trend's colours (Black and White), every size;
//   - plus "GTA · Make your own": the logo only — the tee a customer puts their own photo on (it comes first in the
//     collection);
//   - the front: the trend's logo, locked; the back: the ready design printed big (studio/trendTee.js);
//   - the four shop pictures of each colour are taken here, in this browser (the 3D tee, as the Studio does).
// Pressing it again makes only the tees that are missing (a back added later, a garment added later). A tee is then an
// ordinary Studio tee: its name, words, price or pictures are changed in Design Studio → Studio like any other.
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import studioService from "../../services/studioService";
import customizationService from "../../services/customizationService";
import MockupCamera from "../../studio/MockupCamera";
import { GARMENTS, listingOf, sizeOf } from "../../studio/shopTeeMaker";
import { trendColours } from "../../studio/trends";
import { trendShopTee } from "../../studio/trendTee";
import { THEME as theme } from "../../theme/theme";

const OWN = "Make your own";
const prefixOf = (trend) => String(trend.key || "").toUpperCase();
const why = (err) => err?.response?.data?.message || err?.message || "That didn’t work.";

// the tees this trend should have: [{ name, back, garment }] (back null = "Make your own")
function wantedTees(trend, garments) {
  const names = new Map();
  const backs = (trend.backs || []).map((b, i) => {
    let title = String(b.name || "").trim() || `Design ${i + 1}`;
    const n = (names.get(title.toLowerCase()) || 0) + 1;
    names.set(title.toLowerCase(), n);
    if (n > 1) title = `${title} ${n}`;
    return { ...b, title };
  });
  const out = [];
  for (const g of GARMENTS) {
    const garment = garments.find((x) => x.key === g.key);
    if (!garment) continue;
    out.push({ name: `${prefixOf(trend)} · ${OWN}`, back: null, garment, plan: g });
    for (const b of backs) out.push({ name: `${prefixOf(trend)} · ${b.title}`.slice(0, 60), back: b, garment, plan: g });
  }
  return out;
}

export default function TrendShopTees({ trend }) {
  const [state, setState] = useState(null); // null | { making, done, total, failed: [], note }
  const [job, setJob] = useState(null);
  const jobDone = useRef(null);
  const stop = useRef(false);
  const ready = Boolean(trend.front) && (trend.backs || []).length > 0;

  // the four pictures of one tee in one colour (null: the 3D tee couldn't be drawn)
  const shoot = (garment, positions, elements, colourHex) =>
    new Promise((resolve) => {
      jobDone.current = resolve;
      setJob({ id: `gta${Date.now()}${Math.random()}`, garment, positions, size: "M", colourHex, elements });
    });
  const onShots = (pictures) => {
    setJob(null);
    const done = jobDone.current;
    jobDone.current = null;
    done?.(pictures);
  };

  const make = async () => {
    stop.current = false;
    setState({ making: true, done: 0, total: 0, failed: [], note: "Checking what is there…" });
    try {
      const [setup, designs] = await Promise.all([studioService.getSetup(), studioService.listDesigns()]);
      const all = wantedTees(trend, setup.garments || []);
      const have = new Set(designs.map((d) => `${d.garmentType}|${String(d.name).toLowerCase()}`));
      const todo = all.filter((t) => !have.has(`${t.garment.key}|${t.name.toLowerCase()}`));
      if (!todo.length) return setState({ making: false, done: 0, total: 0, failed: [], note: `All ${all.length} shop tees are already made. Add more ready designs, then press again.` });
      if (!window.confirm(`Make ${todo.length} shop tee${todo.length === 1 ? "" : "s"} (${all.length - todo.length} already made)? Each one gets its pictures in Black and White and goes into Shop your IDENTEE straight away. Keep this page open — about ${Math.max(1, Math.round((todo.length * 25) / 60))} minutes.`)) return setState(null);
      const logo = await sizeOf(trend.front);
      const pictures = new Map();
      const where = new Map();
      let done = 0;
      const failed = [];
      for (const t of todo) {
        if (stop.current) break;
        setState({ making: true, done, total: todo.length, failed, note: `Making “${t.name}” — ${t.garment.label}…` });
        try {
          if (!where.has(t.garment.key)) where.set(t.garment.key, await customizationService.getPrintPositions(t.garment.key));
          const { positions: catalog, maxPrint } = where.get(t.garment.key);
          const back = t.back ? pictures.get(t.back.url) || (await sizeOf(t.back.url)) : null;
          if (back) pictures.set(t.back.url, back);
          const tee = trendShopTee({ garment: t.garment, catalog, maxPrint, size: "M", logo, back });
          if (!tee) throw new Error("this garment has no front or back print area");
          const colours = trendColours(t.garment.colours, trend);
          const shots = [];
          for (const c of colours) {
            const pics = (await shoot(t.garment, tee.positions, tee.elements, c.hex)) || (await shoot(t.garment, tee.positions, tee.elements, c.hex));
            if (!pics) throw new Error(`the 3D pictures in ${c.name} couldn’t be taken`);
            shots.push({ slug: c.slug, mockups: pics });
          }
          const list = listingOf(designs, t.plan);
          const what = t.back ? `Back: “${t.back.title}”, printed big.` : "The back is yours: put your own photo on it in the GTA look, or pick one of our ready designs.";
          const saved = await studioService.saveDesign({
            garmentType: t.garment.key,
            color: shots[0].slug,
            size: "M",
            name: t.name,
            blurb: t.back ? `The ${prefixOf(trend)} logo on the front, “${t.back.title}” big on the back.` : `The ${prefixOf(trend)} logo on the front — your own photo on the back, in the ${trend.name} look.`,
            elements: tee.elements,
            colours: shots,
            sizes: t.garment.sizes,
            category: list.listings[0].category,
            product: { ...list, description: `${trend.name} tee. Front: the ${prefixOf(trend)} logo. ${what} ${t.plan.fit}, ${list.fabric}, DTF print, made to order.` },
          });
          await studioService.publish(saved._id);
          done += 1;
        } catch (err) {
          failed.push(`${t.name} (${t.garment.label}): ${why(err)}`);
        }
      }
      setState({ making: false, done, total: todo.length, failed, note: stop.current ? `Stopped. ${done} made — press again to make the rest.` : `${done} of ${todo.length} shop tees made and in the shop.` });
      if (done) toast.success(`${done} GTA shop tee${done === 1 ? "" : "s"} made.`);
    } catch (err) {
      setState({ making: false, done: 0, total: 0, failed: [why(err)], note: "Couldn’t start." });
    }
  };

  return (
    <div style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: 12, background: "#F7F3EA", border: `1px solid ${theme.border}` }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: theme.textMuted }}>
        Shop tees — Shop your IDENTEE gets a “{prefixOf(trend)}” collection: one tee for each ready design (Oversized + Round Neck Men and Women, in this trend’s colours) and a “{OWN}” tee for the customer’s own photo. The logo is locked on every one. Pressing again makes only the missing ones.
      </span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={!ready || state?.making}
          onClick={make}
          style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, border: "none", background: theme.ink, color: "#F0D585", fontWeight: 600, fontSize: 13, cursor: !ready || state?.making ? "default" : "pointer", opacity: !ready || state?.making ? 0.5 : 1, fontFamily: theme.fontBody }}
        >
          {state?.making ? `Making… ${state.done} / ${state.total}` : `Make ${prefixOf(trend)} shop tees`}
        </button>
        {state?.making && (
          <button type="button" onClick={() => (stop.current = true)} style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, border: `1.5px solid ${theme.ink}`, background: "#fff", color: theme.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: theme.fontBody }}>
            Stop after this tee
          </button>
        )}
        {!ready && <span style={{ fontSize: 12.5, color: theme.textMuted }}>Add the front logo and at least one ready design first.</span>}
      </div>
      {state?.note && <span style={{ fontSize: 13, color: theme.text }}>{state.note}</span>}
      {state?.failed?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: theme.danger }}>
          {state.failed.slice(0, 12).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {job && <MockupCamera key={job.id} job={job} onDone={onShots} />}
    </div>
  );
}
