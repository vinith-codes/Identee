// studio/MockupCamera.jsx
//
// Takes the four mockup pictures (front, back, left, right) of a finished design without the design room around it
// — for the admin's Collection maker (25 Oct 2026). The 3D tee is drawn off screen in a 4:5 frame (so the pictures
// never get black side bars), each print area painted with the same renderer as the design room, then the
// same studio snapshots as the design room's Review are taken.
//
// <MockupCamera job={{ id, garment, positions, size, colourHex, elements }} onDone={(pictures | null) => …} />
import { useEffect, useMemo, useRef, useState } from "react";
import Room3D from "./Room3D";
import { AreaRenderer, imageSrcs, loadImage } from "./konvaRender";
import { modelForGarment, placeArea } from "./teeModel";
import { cropMockup } from "./mockupCrop";
import { areaPx } from "./designFinish";
import { fontsReady } from "./fonts";

const SIDES = ["front", "back", "left", "right"];
const FRAME = { w: 640, h: 800 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function MockupCamera({ job, onDone }) {
  const roomApi = useRef(null);
  const [areas, setAreas] = useState(null); // the painted areas, once fonts and pictures are in
  const lit = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const model = useMemo(() => modelForGarment(job.garment), [job.garment]);
  const lengthCm = ((job.garment?.sizeChart || []).find((r) => r.size === job.size)?.length || 30) * 2.54;

  // 1. fonts and pictures loaded, every used area painted (without the editing outline)
  useEffect(() => {
    let alive = true;
    const renderers = [];
    (async () => {
      await fontsReady(job.elements);
      await Promise.allSettled(imageSrcs(job.elements).map((src) => loadImage(src)));
      if (!alive || !model) return;
      const out = [];
      for (const pos of job.positions) {
        if (pos.side === "shorts") continue;
        const els = job.elements.filter((e) => e.position === pos.key);
        const spot = placeArea(model, pos, job.size, lengthCm);
        if (!els.length) {
          out.push({ key: pos.key, spot, spotKey: job.size, canvas: null, version: 0 });
          continue;
        }
        const { W, H } = areaPx(pos, job.size);
        const r = new AreaRenderer(W, H);
        renderers.push(r);
        out.push({ key: pos.key, spot, spotKey: job.size, canvas: r.render(els, { outline: false }), version: 1 });
      }
      setAreas(out);
    })();
    return () => {
      alive = false;
      renderers.forEach((r) => r.destroy());
    };
  }, [job, model, lengthCm]);

  // 2. once the 3D tee is drawn (or 8 s pass), the four pictures
  useEffect(() => {
    if (!areas) return undefined;
    let alive = true;
    (async () => {
      for (let t = 0; t < 40 && alive && !(lit.current && roomApi.current); t++) await wait(200);
      await wait(600); // the decals settle
      const api = roomApi.current;
      if (!alive) return;
      if (!api) return doneRef.current(null);
      const pictures = {};
      for (const side of SIDES) pictures[side] = await cropMockup(api.snapshot(side));
      if (alive) doneRef.current(pictures.front && pictures.back ? pictures : null);
    })();
    return () => {
      alive = false;
    };
  }, [areas]);

  // (no 3D model for this garment: nothing to take)
  useEffect(() => {
    if (!model) doneRef.current(null);
  }, [model]);

  if (!model) return null;
  return (
    <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: FRAME.w, height: FRAME.h, pointerEvents: "none" }}>
      {areas && (
        <Room3D
          ref={roomApi}
          model={model}
          colour={job.colourHex}
          areas={areas}
          interactive={false}
          onLit={() => {
            lit.current = true;
          }}
        />
      )}
    </div>
  );
}
