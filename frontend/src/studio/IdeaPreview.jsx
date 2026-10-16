// studio/IdeaPreview.jsx
//
// "Improve my idea" (Draw tab and Chat): the customer's rough words made clear by the text AI, and in plain
// words what they will get — shown BEFORE any picture request is spent. The buttons come from the caller
// (Draw: Use this / Keep mine · Chat: chips under the card).

/**
 * @param preview   { prompt, expect: [{ label, value }], style, areaLabel }
 * @param children  the buttons
 */
export default function IdeaPreview({ preview, children }) {
  const { prompt, expect = [], style, areaLabel } = preview;
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
      {(style || areaLabel) && (
        <p className="ip-picks">
          {style && <span>Style: <b>{style}</b></span>}
          {areaLabel && <span>Print area: <b>{areaLabel}</b></span>}
        </p>
      )}
      <details className="ip-prompt">
        <summary>What the AI will be told</summary>
        <p>{prompt}</p>
      </details>
      {children && <div className="ip-actions">{children}</div>}
    </div>
  );
}
