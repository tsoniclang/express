# `@tsonic/express`

Express-style routing and middleware for Tsonic applications.

`@tsonic/express` is an ordinary ESM TypeScript source package. It uses the
JavaScript source surface and standard `node:*` imports. Install the Node
capability package for the selected target.

## Target support

Application code imports `@tsonic/express` directly; the source package does
not contain a target switch. A native build also requires that the selected
target can lower every feature used by the application.

## Install

```bash
npm create tsonic@latest my-app -- --target csharp --surface js
cd my-app
npm install --save-dev @tsonic/csharp-nodejs@^0.1.0
npm install @tsonic/express
npm run build
```

For a Rust project, select `--target rust` and install
`@tsonic/rust-nodejs@^0.1.0` instead. The JS surface is selected in
`tsonic.json`; Node is an installed capability, not another source surface.

## Quick start

```ts
import { express } from "@tsonic/express/index.js";

const app = express.create();

app.get("/", (_req, res) => {
  res.send("hello");
});

app.listen(3000, "127.0.0.1");
```

This is a C# executable entry module. A Rust binary places the same setup in
an exported `main()` function; see the target's entrypoint rules.

## Runtime model

The package owns the Express-style application model directly:

- application and router construction
- route registration and route chaining
- middleware and error-middleware dispatch
- mounted routers and mounted applications
- route parameter handlers
- request helpers for params, query, cookies, files, headers, and body
- response helpers such as `status`, `send`, `json`, `jsonp`, `cookie`,
  `redirect`, `render`, and `sendFile`
- bundled middleware for JSON, URL-encoded bodies, cookies, CORS, static files,
  and multipart uploads
- live `listen(...)` hosting through the Node-style package stack

The public package is a source package, not a generated CLR binding package.

## Imports

Use explicit ESM subpaths:

```ts
import { express, Router } from "@tsonic/express/index.js";
import type { Request, Response, NextFunction } from "@tsonic/express/index.js";
```

## Validation

```bash
npm run selftest
```

The selftest builds the TypeScript package and runs its runtime and native
source-package tests. In a separate checkout tree, set
`TSONIC_TOOLCHAIN_ROOT` to the directory containing the Tsonic host and target
checkouts. The native test uses their already-built packages without writing
to those repositories.

## Documentation

- `docs/getting-started.md`
- `docs/runtime-model.md`
- `docs/implementation-scope.md`

## License

MIT
