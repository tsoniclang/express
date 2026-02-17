app.get("/set-cookie", async (_req, res, _next) => {
  res.cookie("sid", "abc");
  res.send("ok");
});

app.get("/read-cookie", async (req, res, _next) => {
  res.json({ sid: req.cookies["sid"] });
});
