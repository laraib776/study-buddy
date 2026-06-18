export default function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const payload = { error: err.message || 'Internal server error' };
  res.status(status).json(payload);
  // res.status(status).json(payload);
}
