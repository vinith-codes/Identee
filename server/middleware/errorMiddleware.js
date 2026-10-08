const notFound = (req, res, next) => {
  const err = new Error(`Not Found- ${req.originalUrl}`);
  res.status(404);
  next(err);
};

const errorHandler = (err, req, res, next) => {
  // ✅ ADD THESE TWO LINES — shows real error in backend terminal
  console.error("💥 ERROR:", err.message);
  console.error(err.stack);

  // Errors may carry their own status (e.g. HttpError from checkoutService).
  const statusCode =
    res.statusCode !== 200 ? res.statusCode : err.status || 500;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

export { notFound, errorHandler };
