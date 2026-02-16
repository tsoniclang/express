# @tsonic/express

Express-style HTTP server APIs for **Tsonic**.

This package is part of Tsonic: https://tsonic.org.

Use this package to write Express-like apps in TypeScript and compile them to native binaries with `tsonic`.

## Prerequisites

- Install the .NET 10 SDK (required by Tsonic): https://dotnet.microsoft.com/download
- Verify: `dotnet --version`

## Quick Start (new project)

```bash
mkdir my-api && cd my-api
npx --yes tsonic@latest init

# Install Express runtime + bindings (installs required ASP.NET Core deps too)
npx --yes tsonic@latest add npm @tsonic/express

# Replace the default App.ts with a minimal API
cat > packages/my-api/src/App.ts <<'EOF'
<!-- include: docs/snippets/10/quick-start-app.ts -->
EOF

npm run dev
```

Then open `http://localhost:3000/`.

## Hello World

```ts
// packages/my-api/src/App.ts
<!-- include: docs/snippets/10/hello-world-app.ts -->
```

## Basic API Surface

### Create an app / router

```ts
import { express } from "@tsonic/express/index.js";

<!-- include: docs/snippets/10/create-app-router.ts -->
```

### Routing

Common verbs:

```ts
<!-- include: docs/snippets/10/routing.ts -->
```

### Middleware

```ts
<!-- include: docs/snippets/10/middleware.ts -->
```

Error middleware:

```ts
<!-- include: docs/snippets/10/error-middleware.ts -->
```

### Request / Response

`Request` highlights:

- `req.method`, `req.path`, `req.originalUrl`
- `req.query`, `req.params`
- `req.body` (when using body parsers)
- `req.get(name)` / `req.header(name)`

`Response` highlights:

- `res.status(code)`
- `res.send(body)`, `res.json(body)`, `res.sendStatus(code)`
- `res.redirect(path)` / `res.redirect(status, path)`
- `res.set(name, value)` / `res.header(name, value)`
- `res.cookie(name, value, options)` / `res.clearCookie(name, options)`

### Body parsing

```ts
<!-- include: docs/snippets/10/body-parsing.ts -->
```

### Static files

```ts
<!-- include: docs/snippets/10/static-files.ts -->
```

### Listen / close

```ts
<!-- include: docs/snippets/10/listen-close.ts -->
```

## Advanced docs

- [docs/advanced.md](docs/advanced.md) (routers, handlers, middleware patterns)
- [docs/deviations.md](docs/deviations.md) (known compatibility gaps / parity notes)
- [docs/generation.md](docs/generation.md) (how this package is generated)

## Versioning Model

This repo is versioned by runtime major:

- `10` -> `versions/10/` -> npm `@tsonic/express@10.x`

## License

MIT

