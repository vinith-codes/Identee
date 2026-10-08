// components/GarmentVisual.jsx
//
// Looks up the garment+color photo set from the garmentImage redux
// store (already fetched once at app load — see the note at the
// bottom of this file). If that view's photo exists, shows it; if
// not (not uploaded yet, or still loading), falls back to the drawn
// SVG silhouette so nothing ever looks broken.

import { useSelector } from "react-redux";
import GarmentSilhouette from "./GarmentSilhouette";
import { imageUrl } from "../utils/imageUrl";


function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return imageUrl(path.replace(/^\//, ""));
}

export default function GarmentVisual({
  garmentKey,
  colorSlug,
  shape,
  view = "front",
  color = "#1B1B1B",
}) {
  const items = useSelector((s) => s.garmentImage.items);

  const doc = items.find(
    (d) => d.garmentType === garmentKey && d.colorSlug === colorSlug,
  );
  const photoPath = doc?.[view]?.imageUrl;
  const src = imgUrl(photoPath);

  if (!src) {
    return <GarmentSilhouette shape={shape} view={view} color={color} />;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={(e) => {
          // photo 404'd (deleted from disk, bad path, etc.) — hide it so
          // the silhouette fallback below shows through instead
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}
