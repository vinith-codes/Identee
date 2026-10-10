// studio/Rolling.jsx
//
// A number that rolls from its old value to the new one (the Review total).
// The text is written straight to the page while it rolls, so nothing else
// redraws. People who ask their device for less motion get the plain number.
import { useEffect, useRef, useState } from "react";

const calm = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** format: a function declared outside the component (number -> text). */
export default function Rolling({ value, format }) {
  const el = useRef(null);
  const shown = useRef(value);
  const [first] = useState(() => format(value));

  useEffect(() => {
    const node = el.current;
    const from = shown.current;
    if (!node) return undefined;
    if (from === value || calm()) {
      shown.current = value;
      node.textContent = format(value);
      return undefined;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 450);
      const v = Math.round(from + (value - from) * (1 - (1 - k) ** 3));
      shown.current = v;
      node.textContent = format(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, format]);

  return <span ref={el}>{first}</span>;
}
