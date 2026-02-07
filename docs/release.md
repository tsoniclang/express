# Release Workflow

This repo publishes one package per .NET major under `versions/<major>/`.

## .NET 10 Release Steps

1. Ensure `express-clr` changes are merged and pulled to `main`.
2. Regenerate bindings:

```bash
npm run generate:10
```

3. Review generated diffs in `versions/10/`.
4. Update `versions/10/package.json` version if needed.
5. Validate package metadata and README.
6. Publish:

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
