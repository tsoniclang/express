# Generation Workflow

This repository publishes generated TypeScript bindings for `express-clr`.

The generated package is intentionally JS-facing:

- JS-surface ambient types come from `@tsonic/js`
- `@tsonic/express` stays a normal package
- generated `.d.ts` must not leak CLR collection/runtime types

## Prerequisites

- `../express-clr` exists and is built in `Release`.
- `../tsbindgen` exists and builds.
- `../dotnet/versions/<major>` exists.
- `../aspnetcore` exists.
- Local .NET runtime and ASP.NET runtime are installed under `$DOTNET_HOME` (default `$HOME/.dotnet`).

## Generate for .NET 10

```bash
npm run generate:10
```

Equivalent script:

```bash
./__build/scripts/generate.sh 10
```

## What the Script Does

1. Validates dependencies and runtime paths.
2. Cleans `versions/<major>/` generated output.
3. Builds `tsbindgen` in `Release`.
4. Generates bindings from `express-clr` assembly.
5. Post-processes the generated declarations into a JS-native surface.
6. Syncs package metadata and runtime package version.
7. Copies `README.md` and `LICENSE`.
8. Prunes output to package-focused files:
   - `index.d.ts`
   - `index.js`
   - `index/bindings.json`
   - `index/internal/index.d.ts`
   - `families.json`
   - `package.json`
   - `README.md`
   - `LICENSE`

Post-processing is not optional. It is part of the contract: the published package must expose JS-native types (`Date`, `Uint8Array`, `Record<string, ...>`, `number`, `Promise<...>`) rather than raw CLR/tsbindgen internals.

## Environment Overrides

- `DOTNET_HOME`
- `DOTNET_VERSION`

Use these when runtime paths are non-default.
