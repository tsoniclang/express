app.get("/health", async (_req, res, _next) => {
  res.send("ok");
});
app.post("/items", async (req, res, _next) => {
  res.json(req.body);
});
app.put("/items/:id", async (req, res, _next) => {
  res.send(req.params["id"] ?? "");
});
app.delete("/items/:id", async (_req, res, _next) => {
  res.sendStatus(204);
});
app.patch("/items/:id", async (_req, res, _next) => {
  res.sendStatus(204);
});
app.all("/anything", async (_req, res, _next) => {
  res.send("matched");
});
