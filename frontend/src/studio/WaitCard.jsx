// studio/WaitCard.jsx
//
// Something slow is happening (the AI drawing a picture, a photo being redrawn): what it is, a live count
// of the seconds, and a bar that fills towards the usual time — so the customer can see it is still working.
// The bar reaches about 90% at the usual time and then creeps on; it is only "full" when the result arrives.
// Give it a new `key` for each new wait, so the count starts again from 0.
import { useEffect, useState } from "react";

/**
 * @param label   what is happening ("Drawing your design…")
 * @param expect  the usual time in seconds (0 = no bar)
 * @param hint    a line under it ("Usually 20–40 seconds…")
 */
export default function WaitCard({ label, expect = 0, hint = "" }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const pct = expect ? Math.min(97, secs <= expect ? (secs / expect) * 90 : 90 + 7 * (1 - Math.exp(-(secs - expect) / 30))) : null;
  const late = expect > 0 && secs > expect * 1.8;
  return (
    <div className="dr-wait" role="status" aria-live="polite">
      <div className="dr-waithead">
        <span className="dr-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <b>{label}</b>
        <span className="dr-waitsecs" aria-label={`${secs} seconds so far`}>{secs} s</span>
      </div>
      {pct != null && (
        <div className="dr-waitbar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      {(late || hint) && <small>{late ? "Taking longer than usual — still working. Please keep this page open." : hint}</small>}
    </div>
  );
}
