# @tsonic/expressjs

TypeScript type definitions for the ASP.NET Core-backed `expressjs-clr` runtime.

## Versioning

This repo is versioned by **.NET major**:

- **.NET 10** → `versions/10/` → npm: `@tsonic/expressjs@10.x`

Publish with:

```bash
npm publish versions/10 --access public
```

## Installation

```bash
npm install @tsonic/expressjs @tsonic/dotnet @tsonic/core
```

## Usage

```ts
import { express } from "@tsonic/expressjs/index.js";

const app = express.create();

app.get("/", (req, res) => {
  res.send("hello");
});

app.listen(3000);
```

## Development

Regenerate types from `expressjs-clr`:

```bash
npm run generate:10
```

Compatibility notes:

- `docs/deviations.md`

## License

MIT
