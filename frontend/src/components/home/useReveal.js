// components/home/useReveal.js
//
// Plays each home section's entrance once, when it scrolls into view.
// Elements are fully visible without this (no hidden-until-scrolled
// content); it only adds the class that runs the animation:
//   data-reveal         → "hm-in" (soft fade-up)
//   data-reveal="draw"  → also "draw" (the design drawing / fanning tees)
//   data-reveal="steps" → "go" (the line across the three steps)
// Does nothing for visitors who ask for reduced motion.
import { useEffect } from "react";

export default function useReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target;
          const kind = el.dataset.reveal;
          if (kind === "steps") el.classList.add("go");
          else {
            el.classList.add("hm-in");
            if (kind === "draw") el.classList.add("draw");
          }
          io.unobserve(el);
        }),
      { threshold: 0.2 },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => {
      // already on screen when the page opens: leave it still
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && !el.dataset.reveal) return;
      io.observe(el);
    });
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
