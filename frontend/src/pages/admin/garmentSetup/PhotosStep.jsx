// Wizard step 4: one plain photo per view for every colour.
// Click a box to upload (or replace) that photo — it saves straight away.
import { useRef, useState } from "react";
import garmentImageService from "../../../services/garmentImageService";
import { imageUrl } from "../../../utils/imageUrl";
import { AW } from "./wizardStyles";

const VIEWS = [
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left side"],
  ["right", "Right side"],
];
const MAX_MB = 8;

export default function PhotosStep({ garment, images, reloadImages, progress, next }) {
  const inputRef = useRef(null);
  const [target, setTarget] = useState(null); // { colour, view }
  const [busy, setBusy] = useState(""); // "slug-view" being uploaded
  const [error, setError] = useState("");

  const docFor = (slug) => images.find((d) => d.garmentType === garment.key && d.colorSlug === slug);

  const pick = (colour, view) => {
    setTarget({ colour, view });
    setError("");
    inputRef.current.value = "";
    inputRef.current.click();
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !target) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file (JPG, PNG or WebP).");
    if (file.size > MAX_MB * 1024 * 1024) return setError(`That photo is over ${MAX_MB} MB — please use a smaller one.`);
    const { colour, view } = target;
    setBusy(`${colour.slug}-${view}`);
    try {
      await garmentImageService.uploadGarmentViewPhoto(garment.key, colour.slug, colour.name, colour.hex, view, file);
      await reloadImages();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed. Please try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <h2 style={AW.h2}>4. Photos</h2>
      <p style={AW.lead}>
        One plain photo per view for every colour — blank garment, no print, light background, same framing for every
        colour. <b>{progress.photoCount} of {progress.photoTotal}</b> uploaded. Click a box to upload or replace a photo.
      </p>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={upload} />
      {error && <p style={{ color: "#A3341F", fontSize: 13, fontWeight: 600 }}>{error}</p>}

      {garment.colors.length === 0 ? (
        <p style={{ marginTop: 16, color: "#6B6559" }}>Pick colours in step 3 first.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table className="aw-table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Colour</th>
                {VIEWS.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {garment.colors.map((c) => {
                const doc = docFor(c.slug);
                return (
                  <tr key={c.slug}>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="aw-dot" style={{ background: c.hex }} />
                        <b style={{ fontSize: 13 }}>{c.name}</b>
                      </span>
                    </td>
                    {VIEWS.map(([view, label]) => {
                      const url = doc?.[view]?.imageUrl;
                      const loading = busy === `${c.slug}-${view}`;
                      return (
                        <td key={view}>
                          <button
                            type="button"
                            className={`aw-cell ${url ? "has" : "miss"}`}
                            onClick={() => pick(c, view)}
                            disabled={!!busy}
                            title={url ? `Replace ${c.name} ${label}` : `Upload ${c.name} ${label}`}
                            aria-label={url ? `Replace ${c.name} ${label} photo` : `Upload ${c.name} ${label} photo`}
                          >
                            {loading ? (
                              "Uploading…"
                            ) : url ? (
                              <img src={imageUrl(url, 160)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            ) : (
                              "+ Upload"
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
        <button type="button" className="aw-btn dark" onClick={next}>
          Continue →
        </button>
      </div>
    </div>
  );
}
