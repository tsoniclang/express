import { express } from "@tsonic/express/index.js";

export function main(): void {
  const app = express.create();

  app.get("/", async (_req, res, _next) => {
    res.send("hello");
  });

  app.listen(3000);
}
