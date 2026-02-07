# @tsonic/expressjs

`@tsonic/expressjs` is the generated TypeScript package for the `expressjs-clr` runtime.

## Documentation Ownership

Use this split:

- Runtime behavior, parity decisions, and architecture: `expressjs-clr`
- Package consumption, generation, and publishing workflow: `expressjs` (this repo)

## Versioning Model

This repo is versioned by .NET major:

- .NET 10 -> `versions/10/` -> npm `@tsonic/expressjs@10.x`

## Install

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

## Generate Types

```bash
npm run generate:10
```

The generator reads `expressjs-clr` build outputs and regenerates `versions/10/`.

## Publish

```bash
npm run publish:10
```

## Documentation Map

- Generation workflow: `docs/generation.md`
- Release workflow: `docs/release.md`
- Current compatibility notes: `docs/deviations.md`

## License

MIT
