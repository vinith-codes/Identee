// studio/TryOnPhotos.jsx — "Try it on me" asks for the customer's photos (18 Nov 2026, the owner: "it should ask the user
// to upload the photos of where the designs are … you should not make it mandatory … if the t-shirt is designed for three
// areas but they upload for two, you make it for two"). One photo per printed part: the FRONT (the sleeve sides are made
// by the AI from it) and the BACK. Each optional; a picture is made only for the parts with a photo.
import { sideWords, tryOnAsks, tryOnSides } from "./wornPhotos";

const pics = (sides) => `${sideWords(sides)} picture${sides.length > 1 ? "s" : ""}`;

/**
 * sides: the printed sides (printedSides); photos: { front, back } data URLs or null;
 * onPick(slot) opens the file chooser for that slot; onRemove(slot); onMake(); onCancel();
 * costFor(make) → the cost line for the sides that would be made.
 */
export default function TryOnPhotos({ sides, photos, onPick, onRemove, onMake, onCancel, costFor }) {
  const asks = tryOnAsks(sides);
  const sleeves = sides.filter((s) => s === "left" || s === "right");
  const { make } = tryOnSides(sides, { front: Boolean(photos.front), back: Boolean(photos.back) });
  const SLOT = {
    front: {
      title: "Photo of your front",
      how: "Facing the camera, upper body in the picture.",
      makes: sides.includes("front")
        ? `Makes the front picture${sleeves.length ? ` — and the ${pics(sleeves)}, made by the AI from it` : ""}.`
        : `The ${pics(sleeves)} ${sleeves.length > 1 ? "are" : "is"} made by the AI from it.`,
    },
    back: { title: "Photo of your back", how: "Standing, facing away from the camera.", makes: "Makes the back picture." },
  };
  return (
    <div className="dr-worn" role="dialog" aria-label="Try it on me — your photos">
      <div className="dr-worn-card dr-worn-ask">
        <b>Try it on me</b>
        <p className="dr-review-hint">
          {asks.length > 1
            ? "Your design has prints on the front and the back. Add a photo for each — or just one. A picture is made only for the parts you add a photo for."
            : asks[0] === "back"
              ? "Your design has a print on the back. Add a photo of your back."
              : "Add a photo of your front."}
        </p>
        <div className="dr-tryon-slots">
          {asks.map((slot) => (
            <div key={slot} className={`dr-tryon-slot${photos[slot] ? " has" : ""}`}>
              <button type="button" className="dr-tryon-pic" onClick={() => onPick(slot)} aria-label={`${photos[slot] ? "Change the" : "Add a"} ${SLOT[slot].title.toLowerCase()}`}>
                {photos[slot] ? <img src={photos[slot]} alt="" /> : <span aria-hidden="true">+</span>}
              </button>
              <div className="dr-tryon-words">
                <b>
                  {SLOT[slot].title}
                  {asks.length > 1 && <span className="opt"> · optional</span>}
                </b>
                <span>{SLOT[slot].how}</span>
                <span>{SLOT[slot].makes}</span>
                <span className="dr-tryon-acts">
                  <button type="button" onClick={() => onPick(slot)}>
                    {photos[slot] ? "Change" : "Add photo"}
                  </button>
                  {photos[slot] && (
                    <button type="button" onClick={() => onRemove(slot)}>
                      Remove
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="dr-review-hint">{make.length ? costFor(make) : "Add at least one photo to make your pictures."}</p>
        <div className="dr-worn-acts">
          <button type="button" disabled={!make.length} onClick={onMake}>
            Make my pictures
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
