# Express Compatibility Deviations

This project targets high API parity with Express 5.x while running on ASP.NET Core primitives.

Current known deviations:

1. `express()` callable form is represented as `express.create()` / `express.app()` in CLR-first usage.
2. `next('router')` is currently treated as router-exit in the flattened pipeline and may short-circuit broader stacks.
3. Path-pattern behavior for advanced Express 5 patterns is best-effort; core string and `:param` routes are covered.
4. Middleware option semantics (`json/raw/text/urlencoded/static`) are close but not byte-for-byte identical with Node middleware internals.
5. Cookie signing compatibility is best-effort and not a drop-in replacement for `cookie-parser` edge behavior.

All deviations should be minimized over time, with behavior validated by tests.
