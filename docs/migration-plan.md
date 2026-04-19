# express migration plan

This repo is the native source of truth for `@tsonic/express`.

## Principles

- Keep host substrate thin.
- Move library behavior into native source.
- Keep runtime coverage comprehensive.
- Add broader tests for any current best-effort or simplified behavior.

## Initial migration slices

1. Router / route / middleware pipeline
2. Application settings, mount behavior, template engine hooks
3. Request / response shaping that does not depend on host transport internals
4. Built-in middleware and multipart
5. Host substrate adapters (`listen`, transport request/response, file send)

## Current port status

- Started:
  - router
  - route chaining
  - param handling
  - application settings and mount events
  - core response helpers (`status`, `set`, `send`, `cookie`, `render`, `jsonp`)
- Not started:
  - host listen/runtime substrate
  - built-in body parsers
  - static files
  - multipart
  - full request API surface
