const notFound = (req, res, next) => {
  const err = new Error(`Not Found- ${req.originalUrl}`);
  res.status(404);
  next(err);
};

const errorHandler = (err, req, res, next) => {
  // Errors may carry their own status (e.g. HttpError from checkoutService).
  const statusCode =
    res.statusCode !== 200 ? res.statusCode : err.status || 500;

  // Only real server errors (500 and up) go into the log, with the exact line. Everyday answers to a visitor — a
  // wrong email, not logged in, a page that doesn't exist (robots try /wp/, /.env …), too many tries — are normal
  // and used to fill the log with long traces, hiding the real problems (22 Oct 2026).
  if (statusCode >= 500) {
    console.error("💥 ERROR:", req.method, req.originalUrl, "-", err.message);
    console.error(err.stack);
  }

  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

export { notFound, errorHandler };
