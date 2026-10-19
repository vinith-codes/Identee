// The Draw and Photo tabs keep what was made before (shown in EarlierResults.jsx).
export const EARLIER_MAX = 12;
// new results replace the shown ones; the shown ones move to "earlier" (newest first, no repeats)
export const keepEarlier = (shown = [], earlier = [], now = []) => {
  const nowUrls = new Set(now.map((r) => r.url));
  const seen = new Set();
  return [...shown, ...earlier].filter((r) => r?.url && !nowUrls.has(r.url) && !seen.has(r.url) && seen.add(r.url)).slice(0, EARLIER_MAX);
};
