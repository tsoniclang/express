---
title: Getting Started
---

# Getting Started

The normal stack is:

```bash
npm create tsonic@latest my-app -- --target csharp --surface js
cd my-app
npm install --save-dev @tsonic/csharp-nodejs@^0.1.0
npm install @tsonic/express
npm run build
```

For Rust, select `--target rust` and install `@tsonic/rust-nodejs@^0.1.0`
instead of the C# Node package.

Then author a normal Express-style app:

```ts
import { express } from "@tsonic/express/index.js";

const app = express.create();

app.get("/", (_req, res) => {
  res.send("hello");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(3000, "127.0.0.1");
```

For a Rust binary, put these statements inside an exported
`main(): void` function instead of running them at module top level.

## Why the Node capability is part of the stack

`@tsonic/express` uses the JS source surface and Node capability:

- `surfaces: ["js"]` selects the target's JavaScript declarations and runtime
- `@tsonic/csharp-nodejs` or `@tsonic/rust-nodejs` supplies `node:*` modules
- `@tsonic/express` supplies routing, middleware, request/response helpers, and
  application semantics

## Practical expectation

Think of Express as one package you install and author against.

Application code imports the public Express surface from
`@tsonic/express/index.js`; host details remain package implementation details.
