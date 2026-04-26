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

## Ownership

The package owns:

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

The package implements:

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
