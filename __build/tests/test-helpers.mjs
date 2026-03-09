import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(join(here, "../.."));
export const expressLocalSpec = `file:${join(repoRoot, "versions", "10")}`;
export const jsLocalSpec = `file:${join(repoRoot, "..", "js", "versions", "10")}`;
const localTsonicBin = process.env.TSONIC_BIN;
const tsonicSpec = process.env.TSONIC_SPEC ?? "tsonic@latest";

export const run = (cwd, cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${cmd} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`
  );
  return result;
};

export const runTsonic = (cwd, args, options = {}) => {
  if (localTsonicBin) {
    return run(cwd, "node", [localTsonicBin, ...args], options);
  }
  return run(cwd, "npx", ["--yes", tsonicSpec, ...args], options);
};

let localExpressClrPacked = false;
let localRuntimePacked = false;
let localJsRuntimePacked = false;

export const ensureLocalRuntimeNugetConfig = (dir) => {
  const expressClrDir = join(repoRoot, "..", "express-clr");
  const runtimeDir = join(repoRoot, "..", "runtime");
  const jsRuntimeDir = join(repoRoot, "..", "js-runtime");
  if (!localExpressClrPacked) {
    run(expressClrDir, "dotnet", ["pack", "src/express/express.csproj", "-c", "Release"]);
    localExpressClrPacked = true;
  }
  if (!localRuntimePacked) {
    run(runtimeDir, "dotnet", ["pack", "src/Tsonic.Runtime/Tsonic.Runtime.csproj", "-c", "Release"]);
    localRuntimePacked = true;
  }
  if (!localJsRuntimePacked) {
    run(jsRuntimeDir, "dotnet", ["pack", "src/Tsonic.JSRuntime/Tsonic.JSRuntime.csproj", "-c", "Release"]);
    localJsRuntimePacked = true;
  }

  const localFeed = join(expressClrDir, "artifacts", "bin", "express", "Release");
  const runtimeFeed = join(runtimeDir, "artifacts", "bin", "Tsonic.Runtime", "Release");
  const jsRuntimeFeed = join(jsRuntimeDir, "artifacts", "bin", "Tsonic.JSRuntime", "Release");
  const hasExpressNupkg =
    existsSync(localFeed) &&
    readdirSync(localFeed).some((file) => file.endsWith(".nupkg"));
  const hasRuntimeNupkg =
    existsSync(runtimeFeed) &&
    readdirSync(runtimeFeed).some((file) => file.endsWith(".nupkg"));
  const hasJsRuntimeNupkg =
    existsSync(jsRuntimeFeed) &&
    readdirSync(jsRuntimeFeed).some((file) => file.endsWith(".nupkg"));
  if (!hasExpressNupkg && !hasRuntimeNupkg && !hasJsRuntimeNupkg) return;

  const packageSources = [
    hasRuntimeNupkg
      ? `    <add key="local-runtime" value="${runtimeFeed}" />\n`
      : "",
    hasJsRuntimeNupkg
      ? `    <add key="local-js-runtime" value="${jsRuntimeFeed}" />\n`
      : "",
    hasExpressNupkg ? `    <add key="local-express" value="${localFeed}" />\n` : "",
    `    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />\n`,
  ].join("");

  const nugetConfig =
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<configuration>\n` +
    `  <packageSources>\n` +
    packageSources +
    `  </packageSources>\n` +
    `</configuration>\n`;
  writeFileSync(join(dir, "NuGet.Config"), nugetConfig, "utf-8");
};

export const overlayInstalledBindingsPackage = (dir, packageName) => {
  const packageRoot = join(dir, "node_modules", ...packageName.split("/"));
  const bindingsPath = join(packageRoot, "tsonic.bindings.json");
  const workspacePath = join(dir, "tsonic.workspace.json");

  if (!existsSync(bindingsPath)) return;

  const bindings = JSON.parse(readFileSync(bindingsPath, "utf-8"));
  const workspace = JSON.parse(readFileSync(workspacePath, "utf-8"));
  const dotnet = workspace.dotnet ?? (workspace.dotnet = {});
  const typeRoots = Array.isArray(dotnet.typeRoots) ? [...dotnet.typeRoots] : [];

  for (const relativeRoot of bindings.requiredTypeRoots ?? []) {
    const resolvedRoot =
      relativeRoot === "."
        ? `node_modules/${packageName}`
        : `node_modules/${packageName}/${relativeRoot}`;
    if (!typeRoots.includes(resolvedRoot)) {
      typeRoots.push(resolvedRoot);
    }
  }
  dotnet.typeRoots = typeRoots;

  const mergeById = (existing, incoming) => {
    const merged = Array.isArray(existing) ? [...existing] : [];
    for (const item of incoming ?? []) {
      const index = merged.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) {
        merged[index] = item;
      } else {
        merged.push(item);
      }
    }
    return merged;
  };

  dotnet.frameworkReferences = mergeById(dotnet.frameworkReferences, bindings.dotnet?.frameworkReferences);
  dotnet.packageReferences = mergeById(dotnet.packageReferences, bindings.dotnet?.packageReferences);

  writeFileSync(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`, "utf-8");
};
