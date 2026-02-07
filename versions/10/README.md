# @tsonic/expressjs

TypeScript bindings for the ASP.NET Core-backed `expressjs-clr` runtime.

This package provides the Express-style API surface for Tsonic projects targeting .NET 10.

## Install

```bash
npm install @tsonic/expressjs @tsonic/dotnet @tsonic/core
```

## Quick Start

```ts
import { express } from "@tsonic/expressjs/index.js";

const app = express.create();

app.get("/", (req, res) => {
  res.send("hello");
});

app.listen(3000);
```

## API Notes

- Callable `express()` is represented as `express.create()` / `express.app()`.
- Some verbs use C#-safe names (`lock_`, `m_search`).
- Use `method("...")` for exact custom verb strings.

## Source Repositories

- Runtime implementation: `tsoniclang/expressjs-clr`
- Package generation source: `tsoniclang/expressjs`

## License

MIT
