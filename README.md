# @tsonic/express

`@tsonic/express` is the generated TypeScript package for the `express-clr` runtime.

## Documentation Ownership

Use this split:

- Runtime behavior, parity decisions, and architecture: `express-clr`
- Package consumption, generation, and publishing workflow: `express` (this repo)

## Versioning Model

This repo is versioned by .NET major:

- .NET 10 -> `versions/10/` -> npm `@tsonic/express@10.x`

## Install

```bash
npm install @tsonic/express @tsonic/dotnet @tsonic/core
```

## Usage

```ts
import { express } from "@tsonic/express/index.js";

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

The generator reads `express-clr` build outputs and regenerates `versions/10/`.

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
