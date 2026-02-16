import { express } from "@tsonic/express/index.js";

export function main(): void {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.send("hello");
  });

  app.listen(3000);
}

