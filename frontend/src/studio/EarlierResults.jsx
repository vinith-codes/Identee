// studio/EarlierResults.jsx
//
// The Draw and Photo tabs keep what was made before ("Try another", a new style, a different photo):
// nothing the customer was shown — and paid a request for — disappears. They sit here, small, each
// still one tap from the tee.
import { imageUrl } from "../utils/imageUrl";

/**
 * @param items   [{ url, label? }]
 * @param onIt    (url) => ["Centre Front"]  where it already is
 * @param onAdd   (item) => void
 */
export default function EarlierResults({ items = [], onIt, onAdd, fabric, title = "Earlier" }) {
  if (!items.length) return null;
  return (
    <details className="ps-earlier">
      <summary>
        {title} ({items.length})
      </summary>
      <div className="ps-earlier-grid">
        {items.map((r) => {
          const on = onIt(r.url);
          return (
            <div key={r.url} className="ps-earlier-item">
              <img src={imageUrl(r.url, 240)} alt={r.label || "An earlier design"} loading="lazy" style={{ background: fabric }} />
              {on.length ? <span className="ps-on">On {on.join(" and ")} ✓</span> : <button type="button" className="ps-link" onClick={() => onAdd(r)}>Add to tee</button>}
            </div>
          );
        })}
      </div>
    </details>
  );
}
