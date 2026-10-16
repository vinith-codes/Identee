// studio/IdeaPreview.jsx
//
// "Improve my idea" (Draw tab and Chat): the customer's rough words made clear by the text AI, and in plain
// words what they will get — shown BEFORE any picture request is spent. The buttons come from the caller
// (Draw: Use this / Keep mine · Chat: chips under the card).

/**
 * @param preview   { prompt, expect: [{ label, value }], style, area, areaLabel }
 * @param areas     [{ key, label }] — with onArea, the print area can be changed here (the AI only suggests one;
 *                  when the idea names none it is the main front area, so the customer must see and be able to change it)
 * @param onArea    (key) => void
 * @param children  the buttons
 */
export default function IdeaPreview({ preview, areas, onArea, children }) {
  const { prompt, expect = [], style, area, areaLabel } = preview;
  const canPick = Boolean(onArea && areas?.length);
  return (
    <div className="ip">
      <p className="ip-eyebrow">✨ What you’ll get</p>
      {expect.length > 0 && (
        <dl className="ip-list">
          {expect.map((e) => (
            <div key={e.label + e.value}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(style || (areaLabel && !canPick)) && (
        <p className="ip-picks">
          {style && <span>Style: <b>{style}</b></span>}
          {areaLabel && !canPick && <span>Print area: <b>{areaLabel}</b></span>}
        </p>
      )}
      {canPick && (
        <label className="ip-area">
          <span>Print area</span>
          <select value={area || ""} onChange={(e) => onArea(e.target.value)}>
            {!areas.some((a) => a.key === area) && <option value="">Choose…</option>}
            {areas.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </label>
      )}
      <details className="ip-prompt">
        <summary>What the AI will be told</summary>
        <p>{prompt}</p>
      </details>
      {children && <div className="ip-actions">{children}</div>}
    </div>
  );
}
