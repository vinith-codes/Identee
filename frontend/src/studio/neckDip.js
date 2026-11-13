// studio/neckDip.js
//
// Front and back told apart at a glance (13 Nov 2026, feedback 1). A real tee's front neckline sits well below its
// back one. On the oversized 3D model the two are almost level (the front collar only 2.8 cm under the back), so
// the Front and Back views looked the same. The room lowers the front of the collar when the model loads
// (Room3D.jsx useTeeGeometry, settings in teeModel.js neckDip).
import { MathUtils } from "three";

const { smoothstep } = MathUtils;

/**
 * Lowers the front of the collar by dip.by metres in a round U: the full amount in the middle, nothing at the
 * shoulders, and the chest just under it a little less, fading out 15 cm down. The back half does not move.
 * Runs on the loaded copy before it is centred: y is up (the same heights as the anchors) and the front faces +z
 * (at the collar the front is at z ≈ +0.035, the back at z ≈ −0.093). Only this copy moves, never the cached model.
 * @param {THREE.BufferGeometry} geo  float positions (floatGeometry)
 * @param {{ neck: number, by: number, half: number }} dip  the model's front collar seam height, how much
 *   lower, half the neck opening's width (metres)
 */
export function dipFrontNeck(geo, { neck, by, half }) {
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const across = 1 - smoothstep(Math.abs(pos.getX(i)), half * 0.35, half); // 1 in the middle, 0 at the shoulders
    const down = smoothstep(y, neck - 0.15, neck - 0.03); // 1 at the collar, 0 from 15 cm below it
    const front = smoothstep(pos.getZ(i), -0.04, 0); // 1 on the front half, 0 on the back half
    const k = across * down * front;
    if (k > 0) pos.setY(i, y - by * k);
  }
  pos.needsUpdate = true;
  return geo;
}
