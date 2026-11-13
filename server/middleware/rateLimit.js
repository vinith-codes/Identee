// Minimal in-memory, fixed-window rate limiter — per IP address, or per whatever `key(req)` returns.
// Fine for a single server process; switch to a shared store (e.g. Redis)
// if the API ever runs on multiple instances.
// key (13 Nov 2026): routes that run after `protect` can count per customer (key: (req) => req.user._id), so
// customers behind one mobile-network address don't share one limit.
const rateLimit = ({ windowMs, max, message = "Too many requests. Please try again later.", key = null }) => {
  const hits = new Map(); // ip (or key) -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    let who = "";
    try {
      who = key ? String(key(req) || "") : "";
    } catch {
      who = "";
    }
    const ip = who || req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message });
    }
    next();
  };
};

export default rateLimit;
