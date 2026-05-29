export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

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

export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? AWS_STATUS[err.name] ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;
  res.status(status).json({ ok: false, error: message });
}
