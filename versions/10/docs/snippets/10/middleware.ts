app.use(async (req, _res, next) => {
  // Do something with req
  await next();
});
