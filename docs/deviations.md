# Express Compatibility Deviations

This package reflects the `expressjs-clr` runtime behavior.

Authoritative deviations live in:

- `../expressjs-clr/docs/deviations.md`

Key current items:

1. `express()` callable form is represented as `express.create()` / `express.app()`.
2. C#-safe method names are used for some verbs (`lock_`, `m_search`), with `method("...")` for exact-verb routing.
3. `next('router')` remains best-effort under flattened mount behavior.
4. Advanced path-pattern behavior is best-effort; common string and `:param` patterns are covered.
5. Built-in parser/static middleware behavior is close, not byte-for-byte identical to upstream Node middleware internals.
6. Cookie signing/signed-cookie behavior is best-effort, not a full `cookie-parser` edge-case clone.
7. Handler dispatch in runtime is reflection-free; unsupported delegate signatures are ignored instead of reflection invocation.
8. Runtime JSON support is reflection-free and guarantees primitives, dictionaries, arrays/lists, and `JsonElement`/`JsonDocument` shapes. Arbitrary CLR object/anonymous-object reflection serialization is intentionally not provided.

Deviations should shrink over time and are validated through the runtime test matrix in `expressjs-clr`.
