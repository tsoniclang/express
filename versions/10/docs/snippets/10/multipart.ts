const upload = express.multipart();

app.post("/upload", upload.single("avatar"), async (req, res, _next) => {
  res.json({
    filename: req.file?.originalname,
    fields: req.body,
  });
});
