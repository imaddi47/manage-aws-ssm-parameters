/**
 * Error carrying an HTTP status code, surfaced as-is by {@link errorHandler}.
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

/**
 * Wrap an async Express handler so rejected promises reach the error handler.
 * @param {Function} fn
 * @returns {import("express").RequestHandler}
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const AWS_STATUS = {
  ParameterNotFound: 404,
  ParameterAlreadyExists: 409,
  AccessDeniedException: 403,
  AccessDenied: 403,
  ValidationException: 400,
};

/**
 * Express error middleware: maps HttpError / AWS SDK errors to a
 * `{ ok: false, error }` JSON envelope with an appropriate status.
 * @param {Error & { status?: number }} err
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? AWS_STATUS[err.name] ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;
  res.status(status).json({ ok: false, error: message });
}
