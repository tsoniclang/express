# Implementation Scope

This repo is the native source of truth for `@tsonic/express`.

## Design principles

- Keep host substrate thin.
- Keep runtime coverage comprehensive.
- Express semantics live in authored TypeScript package code.
- Host-bound work is isolated to request, response, and listen integration.
- Tests cover routing, middleware, helpers, and live HTTP behavior.

## Package areas

- Router, route, and middleware pipeline
- Application settings, mounted apps, mounted routers, and template render hooks
- Request and response shaping
- Built-in JSON, URL-encoded, cookie, CORS, static-file, and multipart
  middleware
- Host adapters for `listen`, transport request/response objects, and file send

## Public surface

- `express.create()` constructs an application.
- `Router()` constructs routers.
- `app.use(...)`, route helpers, and chained route registration build the
  middleware graph.
- `express.dispatch(...)` executes an in-process request context.
- `app.listen(...)` hosts an HTTP service through the Node-style package stack.
- Request helpers expose params, query, cookies, files, headers, body data, and
  transport metadata.
- Response helpers expose status, headers, cookies, body writing, JSON/JSONP,
  redirects, rendering, and file responses.

## Request ownership

The router owns the request/response pair for one dispatch. `req.res` and
`res.req` remain connected throughout handlers and pending response completion.
Every exit awaits that completion and disconnects still-matching pair links;
retained request/response values afterward have absent scoped links. Independent
replacement links are preserved. A routing error remains primary if completion
also fails. The source defines this lifetime identically for C#, Rust and Node;
native ownership does not depend on tracing collection or implicit Weak edges.
