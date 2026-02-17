const app = express.create();
const router = express.Router();

router.get("/ping", async (_req, res, _next) => {
  res.send("pong");
});

app.use("/api", router);
