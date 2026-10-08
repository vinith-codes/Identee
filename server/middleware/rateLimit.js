// Minimal in-memory, per-IP fixed-window rate limiter.
// Fine for a single server process; switch to a shared store (e.g. Redis)
// if the API ever runs on multiple instances.
const rateLimit = ({ windowMs, max, message = "Too many requests. Please try again later." }) => {
  const hits = new Map(); // ip -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
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
