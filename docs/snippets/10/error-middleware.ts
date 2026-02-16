app.useError((err, _req, res, _next) => {
  res.status(500).json({ error: `${err}` });
});
