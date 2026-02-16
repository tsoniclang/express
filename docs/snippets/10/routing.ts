app.get("/health", (_req, res) => res.send("ok"));
app.post("/items", (req, res) => res.json(req.body));
app.put("/items/:id", (req, res) => res.send(req.param("id")));
app.delete("/items/:id", (_req, res) => res.sendStatus(204));
app.patch("/items/:id", (_req, res) => res.sendStatus(204));
app.all("/anything", (_req, res) => res.send("matched"));

