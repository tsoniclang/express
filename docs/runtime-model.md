# Runtime Model

`@tsonic/express` is documented as one package, not as a public split.

## Usage model

Use it as a normal first-party source package in JS-surface projects.

Typical stack:

- `@tsonic/js`
- `@tsonic/nodejs`
- `@tsonic/express`

## What the package exports

The package exports the normal authored surface directly from `src/index.ts`,
including:

- `express`
- `Application`
- `Router`
- `Request`
- `Response`
- `dispatch`
- typed handler interfaces such as `RequestHandler`, `NextFunction`, and
  `ParamHandler`

## Why this page exists

Older docs and older mental models split Express across generated and CLR
companions. That is not how the active stack should be explained anymore.

The current package owns both:

- host-independent routing and middleware behavior
- host-bound request/response substrate
- live `listen(...)` behavior in the same canonical package

## Practical shape

Two usage styles matter today:

### In-process dispatch

```ts
await express.dispatch(app, context);
```

This is useful for tests, adapters, and lower-level host integration.

### Live server hosting

```ts
const server = app.listen(0, "127.0.0.1");
```

This is the normal application path for HTTP services.

## What users should expect from the package

The current package owns the following behavior directly:

- route registration and matching
- middleware chaining
- param handlers
- error middleware
- request helpers
- response helpers such as `send`, `json`, `jsonp`, `status`, and cookies
- application settings, views, and render hooks
- host-bound HTTP handling

## What that means in practice

Users should think in terms of:

- one package dependency
- one authored TypeScript source package
- one runtime model expressed through package code and package metadata

not a layered public story involving separate companion packages.
