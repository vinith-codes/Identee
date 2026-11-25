// pages/admin/shop/useTeeMaker.jsx — makes shop tees as drafts, one at a time (25 Nov 2026)
//
// Used by Add a tee, Add many tees and "+ Add to a style". For each job (one tee in one style):
//   1. its pictures are uploaded once, full size (never shrunk);
//   2. the prints are placed for that style (studio/shopTeeBuilder.js);
//   3. its pictures are taken on the style's hanger photo, one set per colour (MockupCamera, in this page);
//   4. it is saved as a draft (the Studio's "ready": pictures made, not in the shop) — Check and show puts it in the shop.
// A tee with the same name already made on that style is skipped, so pressing again makes only what is missing.
import { useRef, useState } from "react";
import studioService from "../../../services/studioService";
import customizationService from "../../../services/customizationService";
import aiService from "../../../services/aiService";
import MockupCamera from "../../../studio/MockupCamera";
import { sizeOf } from "../../../studio/shopTeeMaker";
import { buildShopTee, shopSize, shopTeeBody, styleLabel } from "../../../studio/shopTeeBuilder";

export const why = (err) => err?.response?.data?.message || err?.message || "That didn’t work.";
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

/** A new family id for a tee made in several styles (the server's utils/shopFamily.js form). */
export function newFamily(name) {
  const bytes = new Uint8Array(3);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${norm(name).normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "tee"}-${hex}`;
}

/** The family of a tee already made with this name (a style added later, or one tried again, joins it) — or a new one. */
export function familyFor(name, designs = []) {
  const same = designs.find((d) => d.status !== "removed" && d.family && norm(d.name) === norm(name));
  return same ? same.family : newFamily(name);
}

/** A picture the admin picked: { file } or { url } (already on the server) -> { url, w, h }, uploaded once. */
export async function uploadPicture(pic, cache) {
  if (!pic) return null;
  if (pic.url && !pic.file) return pic.w ? { url: pic.url, w: pic.w, h: pic.h } : sizeOf(pic.url);
  if (cache.has(pic.file)) return cache.get(pic.file);
  const { path } = await aiService.trendPicture(pic.file);
  const done = await sizeOf(path);
  cache.set(pic.file, done);
  return done;
}

export default function useTeeMaker() {
  const [state, setState] = useState(null); // { making, done, total, note, made: [ids], failed: [{ name, message }], skipped: [] }
  const [job, setJob] = useState(null);
  const shotDone = useRef(null);
  const stop = useRef(false);
  const uploads = useRef(new Map());

  const shoot = (j) =>
    new Promise((resolve) => {
      shotDone.current = resolve;
      setJob({ ...j, id: `make${Date.now()}${Math.random()}` });
    });
  const onShots = (pictures) => {
    setJob(null);
    const done = shotDone.current;
    shotDone.current = null;
    done?.(pictures);
  };

  /**
   * jobs: [{ t: { name, label, about, frontSpot, backSpot, sleeveSpot, lockFront, price, oldPrice, description, featured, family },
   *          garment (Studio setup, with .shop), front, back, sleeve (picked pictures), colours: [{ slug, hex, name }] }]
   * existing: the Studio's tees (a tee with the same name on the same style is skipped).
   * -> { made: [design], failed, skipped }
   */
  const run = async (jobs, existing = []) => {
    stop.current = false;
    const have = new Set(existing.filter((d) => d.status !== "removed").map((d) => `${d.garmentType}|${norm(d.name)}`));
    const todo = [];
    const skipped = [];
    for (const j of jobs) (have.has(`${j.garment.key}|${norm(j.t.name)}`) ? skipped : todo).push(j);
    const made = [];
    const failed = [];
    const where = new Map();
    const total = todo.length;
    const show = (note) => setState({ making: true, done: made.length + failed.length, total, note, made, failed, skipped: skipped.map(label) });
    for (const j of todo) {
      if (stop.current) break;
      show(`Making “${j.t.label}” — ${styleLabel(j.garment)}…`);
      try {
        const front = await uploadPicture(j.front, uploads.current);
        const back = await uploadPicture(j.back, uploads.current);
        const sleeve = await uploadPicture(j.sleeve, uploads.current);
        if (!where.has(j.garment.key)) where.set(j.garment.key, await customizationService.getPrintPositions(j.garment.key));
        const { positions: catalog, maxPrint } = where.get(j.garment.key);
        const tee = buildShopTee({ garment: j.garment, catalog, maxPrint, size: shopSize(j.garment), front, back, sleeve, frontSpot: j.t.frontSpot, backSpot: j.t.backSpot, sleeveSpot: j.t.sleeveSpot || "none", lockFront: j.t.lockFront });
        const colours = [];
        for (const c of j.colours) {
          if (stop.current) break;
          show(`Taking the pictures of “${j.t.label}” — ${styleLabel(j.garment)}, ${c.name}…`);
          const shot = { garment: j.garment, positions: tee.positions, size: shopSize(j.garment), colourHex: c.hex, colourSlug: c.slug, elements: tee.elements };
          const pics = (await shoot(shot)) || (await shoot(shot)); // (one more try: the 3D view sometimes needs it)
          if (!pics) throw new Error(`the pictures in ${c.name} couldn’t be taken`);
          colours.push({ slug: c.slug, mockups: pics });
        }
        if (stop.current && colours.length < j.colours.length) break;
        const body = shopTeeBody({ ...j.t, hasFront: Boolean(front), hasBack: Boolean(back), hasSleeve: Boolean(sleeve) }, j.garment, tee, colours);
        made.push(await studioService.saveDesign(body));
      } catch (err) {
        failed.push({ name: label(j), message: why(err) });
      }
    }
    const stopped = stop.current && made.length + failed.length < total;
    setState({
      making: false,
      done: made.length + failed.length,
      total,
      made,
      failed,
      skipped: skipped.map(label),
      note: stopped
        ? `Stopped. ${made.length} made — press the same button again to make the rest.`
        : `${made.length} of ${total} made as drafts${skipped.length ? ` (${skipped.length} already made, skipped)` : ""}. Look at them in Check and show, then put them in the shop.`,
    });
    return { made, failed, skipped };
  };

  const camera = job ? <MockupCamera key={job.id} job={job} onDone={onShots} /> : null;
  return { run, state, setState, stop: () => (stop.current = true), camera, shoot, uploads };
}

const label = (j) => `${j.t.name} (${styleLabel(j.garment)})`;
