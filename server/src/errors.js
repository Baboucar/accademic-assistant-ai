export class HttpError extends Error {
  constructor(status, message, details){ super(message); this.status=status; this.details=details; }
}
export function errorMiddleware(err, req, res, _next){
  const status = err.status || 500;
  const body = { error: err.message || 'Server error' };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}
