# Release Workflow

This repo publishes one package per .NET major under `versions/<major>/`.

## .NET 10 Release Steps

1. Ensure `express-clr` changes are merged and pulled to `main`.
2. Run the publish gate:

```bash
npm run selftest
```

This gate must pass before publish. It covers:

- `dotnet test` in `express-clr`
- `dotnet pack` in `express-clr`
- regeneration in this repo
- README/doc checks
- generated-surface contract checks
- JS-surface E2E from `tsonic init --surface @tsonic/js`

3. Regenerate bindings if needed:

```bash
npm run generate:10
```

4. Review generated diffs in `versions/10/`.
5. Update `versions/10/package.json` version if needed.
6. Validate package metadata and README.
7. Publish:

```bash
npm run publish:10
```

## Post-Publish Checks

- Confirm npm package page for `@tsonic/express`.
- Verify install from a clean sample:

```bash
npm i @tsonic/express@10
```

- Smoke-check import and basic usage.

## Notes

- Runtime behavior changes belong to `express-clr`.
- This repo should only contain generated API/package-facing artifacts and docs.
- JS-surface correctness is part of the publish contract, not a best-effort property.
