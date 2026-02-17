import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORDER = [
  "Router",
  "RouteHandler",
  "RouteHandlerReturn",
  "RouteHandlerSync",
  "RequestHandler",
  "RequestHandlerReturn",
  "RequestHandlerSync",
  "ErrorRequestHandler",
  "ErrorRequestHandlerReturn",
  "ErrorRequestHandlerSync",
];

const classify = (line) => {
  const match = line.match(/callback:\s*([A-Za-z0-9_]+)/);
  if (!match) return null;
  const typeName = match[1];
  return ORDER.includes(typeName) ? typeName : null;
};

const reorderUseOverloads = (text, filePath) => {
  const lines = text.split("\n");

  const start = lines.findIndex((l) => /^\s*use\(/.test(l));
  if (start < 0) return text;

  let end = start;
  while (end + 1 < lines.length && /^\s*use\(/.test(lines[end + 1])) end++;

  const segment = lines.slice(start, end + 1);
  const pathless = segment.filter((l) => !l.includes("use(path:"));
  const pathful = segment.filter((l) => l.includes("use(path:"));

  const all = [...pathless, ...pathful];
  if (all.length !== segment.length) {
    throw new Error(`Unexpected use() overload layout in: ${filePath}`);
  }

  const indent = (segment[0] ?? "").match(/^\s*/)?.[0] ?? "";

  const sortGroup = (group) => {
    const buckets = new Map(ORDER.map((k) => [k, []]));
    for (const line of group) {
      const k = classify(line);
      if (!k) {
        throw new Error(`Unrecognized use() overload in ${filePath}:\n${line}`);
      }
      buckets.get(k).push(line);
    }

    const out = [];
    for (const k of ORDER) {
      const items = buckets.get(k);
      if (!items?.length) continue;
      if (items.length !== 1) {
        throw new Error(
          `Duplicate use() overload group '${k}' in ${filePath} (expected 1, got ${items.length})`
        );
      }
      out.push(items[0]);
    }

    for (const l of out) {
      if (!l.startsWith(indent)) {
        throw new Error(
          `Indentation changed while reordering use() overloads in ${filePath}`
        );
      }
    }

    return out;
  };

  const reordered = [...sortGroup(pathless), ...sortGroup(pathful)];
  if (reordered.length !== segment.length) {
    throw new Error(`Lost overloads while reordering use() in: ${filePath}`);
  }

  lines.splice(start, segment.length, ...reordered);
  return lines.join("\n");
};

const rewriteTaskBackedCallbackReturnsAsPromise = (text, filePath) => {
  const callbackTypes = new Set([
    "NextFunction",
    "RequestHandler",
    "ErrorRequestHandler",
    "ParamHandler",
  ]);

  const lines = text.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^export type ([A-Za-z0-9_]+) = .*=> Task;$/);
    if (!match) continue;
    const name = match[1];
    if (!callbackTypes.has(name)) continue;

    lines[i] = line.replace(/=> Task;$/, "=> Promise<void>;");
    changed = true;
  }

  if (!changed) return text;

  // Sanity check: if we failed to rewrite any known callback type, that's a bug.
  for (const name of callbackTypes) {
    if (!lines.some((l) => l.startsWith(`export type ${name} = `) && l.endsWith("=> Promise<void>;"))) {
      throw new Error(`Expected ${name} to be rewritten to Promise<void> in: ${filePath}`);
    }
  }

  return lines.join("\n");
};

const syncNugetBindingsVersion = ({ major, repoRoot }) => {
  const bindingsPath = join(repoRoot, "versions", major, "tsonic.bindings.json");
  const csprojPath = join(repoRoot, "..", "express-clr", "src", "express", "express.csproj");

  const csproj = readFileSync(csprojPath, "utf-8");
  const match = csproj.match(/<Version>([^<]+)<\/Version>/);
  if (!match) throw new Error(`Could not find <Version> in: ${csprojPath}`);
  const nugetVersion = match[1];

  const bindings = JSON.parse(readFileSync(bindingsPath, "utf-8"));
  const refs = bindings?.dotnet?.packageReferences;
  if (!Array.isArray(refs)) {
    throw new Error(`Expected dotnet.packageReferences[] in: ${bindingsPath}`);
  }

  const expressRef = refs.find((r) => r?.id === "Tsonic.Express");
  if (!expressRef) {
    throw new Error(`Missing Tsonic.Express reference in: ${bindingsPath}`);
  }

  expressRef.version = nugetVersion;
  writeFileSync(bindingsPath, `${JSON.stringify(bindings, null, 2)}\n`, "utf-8");
};

const main = () => {
  const major = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? "10";
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(join(here, "../.."));
  const internalIndex = join(
    repoRoot,
    "versions",
    major,
    "index",
    "internal",
    "index.d.ts"
  );

  const original = readFileSync(internalIndex, "utf-8");
  const withUseOrdering = reorderUseOverloads(original, internalIndex);
  const updated = rewriteTaskBackedCallbackReturnsAsPromise(withUseOrdering, internalIndex);
  if (updated !== original) writeFileSync(internalIndex, updated, "utf-8");

  syncNugetBindingsVersion({ major, repoRoot });
};

main();
