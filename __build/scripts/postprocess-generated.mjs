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

const stripFacadeConstraintImports = (text) => {
  return text
    .replace(/^\/\/ Cross-namespace type imports for constraints\n(?:import .*?\n)+\n/m, "")
    .replace(/^import type \{ Date, Uint8Array \} from '\.\/Tsonic\.JSRuntime\/internal\/index\.js';\n/m, "")
    .replace(/^import type \{ Union_2 \} from '\.\/Tsonic\.Runtime\/internal\/index\.js';\n/m, "");
};

const stripInternalClrImports = (text) => {
  return text
    .replace(
      /^\/\/ Primitive type aliases from @tsonic\/core\nimport type \{.*\} from '@tsonic\/core\/types\.js';\n\n/m,
      ""
    )
    .replace(/^import .*@tsonic\/dotnet.*\n/gm, "")
    .replace(/^import .*Tsonic\.JSRuntime\/internal.*\n/gm, "")
    .replace(/^import .*Tsonic\.Runtime\/internal.*\n/gm, "")
    .replace(/^import \* as System_Runtime_Serialization_Internal from .*?\n/gm, "")
    .replace(/^import \* as System_Internal from .*?\n/gm, "");
};

const syncCoreTypeImports = (text) => {
  const withoutImport = text.replace(
    /^import type \{[^}]+\} from "@tsonic\/core\/types\.js";\n/m,
    ""
  );
  const requiredTypes = [];
  if (/\bint\b/.test(withoutImport)) requiredTypes.push("int");
  if (/\blong\b/.test(withoutImport)) requiredTypes.push("long");
  if (requiredTypes.length === 0) return withoutImport;
  return `import type { ${requiredTypes.join(", ")} } from "@tsonic/core/types.js";\n${withoutImport}`;
};

const replaceAll = (text, replacements) => {
  let updated = text;
  for (const [pattern, replacement] of replacements) {
    updated = typeof pattern === "string"
      ? updated.replaceAll(pattern, replacement)
      : updated.replace(pattern, replacement);
  }
  return updated;
};

const replaceGeneratedBlock = (text, name, replacement) => {
  const pattern = new RegExp(
    `export interface ${name}\\$instance \\{[\\s\\S]*?export type ${name} = ${name}\\$instance;`,
    "m"
  );
  if (!pattern.test(text)) {
    throw new Error(`Could not find generated block for ${name}`);
  }
  return text.replace(pattern, replacement.trim());
};

const STRUCTURAL_TYPE_BLOCKS = {
  RouterOptions: `
export interface RouterOptions {
    caseSensitive?: boolean;
    mergeParams?: boolean;
    strict?: boolean;
}


export const RouterOptions: {
    new(): RouterOptions;
};`,
  JsonOptions: `
export interface JsonOptions {
    inflate?: boolean;
    limit?: string | long;
    reviver?: unknown;
    strict?: boolean;
    type?: string | string[] | MediaTypeMatcher;
    verify?: VerifyBodyHandler;
}


export const JsonOptions: {
    new(): JsonOptions;
};`,
  RawOptions: `
export interface RawOptions {
    inflate?: boolean;
    limit?: string | long;
    type?: string | string[] | MediaTypeMatcher;
    verify?: VerifyBodyHandler;
}


export const RawOptions: {
    new(): RawOptions;
};`,
  TextOptions: `
export interface TextOptions {
    defaultCharset?: string;
    inflate?: boolean;
    limit?: string | long;
    type?: string | string[] | MediaTypeMatcher;
    verify?: VerifyBodyHandler;
}


export const TextOptions: {
    new(): TextOptions;
};`,
  UrlEncodedOptions: `
export interface UrlEncodedOptions {
    depth?: int;
    extended?: boolean;
    inflate?: boolean;
    limit?: string | long;
    parameterLimit?: int;
    type?: string | string[] | MediaTypeMatcher;
    verify?: VerifyBodyHandler;
}


export const UrlEncodedOptions: {
    new(): UrlEncodedOptions;
};`,
  MultipartField: `
export interface MultipartField {
    maxCount?: int;
    name: string;
}


export const MultipartField: {
    new(): MultipartField;
};`,
  MultipartOptions: `
export interface MultipartOptions {
    maxFileCount?: int;
    maxFileSizeBytes?: long;
    type?: string;
}


export const MultipartOptions: {
    new(): MultipartOptions;
};`,
  CorsOptions: `
export interface CorsOptions {
    allowedHeaders?: string[];
    credentials?: boolean;
    exposedHeaders?: string[];
    maxAgeSeconds?: int;
    methods?: string[];
    optionsSuccessStatus?: int;
    origins?: string[];
    preflightContinue?: boolean;
}


export const CorsOptions: {
    new(): CorsOptions;
};`,
  DownloadOptions: `
export interface DownloadOptions {
    acceptRanges?: boolean;
    cacheControl?: boolean;
    dotfiles?: string;
    headers?: Record<string, string>;
    immutable?: boolean;
    lastModified?: boolean;
    maxAge?: string | long;
    root?: string;
}


export const DownloadOptions: {
    new(): DownloadOptions;
};`,
  SendFileOptions: `
export interface SendFileOptions {
    acceptRanges?: boolean;
    cacheControl?: boolean;
    dotfiles?: string;
    headers?: Record<string, string>;
    immutable?: boolean;
    lastModified?: boolean;
    maxAge?: string | long;
    root?: string;
}


export const SendFileOptions: {
    new(): SendFileOptions;
};`,
  StaticOptions: `
export interface StaticOptions {
    acceptRanges?: boolean;
    cacheControl?: boolean;
    dotfiles?: string;
    etag?: boolean;
    extensions?: string[] | false;
    fallthrough?: boolean;
    immutable?: boolean;
    index?: string | string[] | false;
    lastModified?: boolean;
    maxAge?: string | long;
    redirect?: boolean;
    setHeaders?: SetHeadersHandler;
}


export const StaticOptions: {
    new(): StaticOptions;
};`,
  CookieOptions: `
export interface CookieOptions {
    domain?: string;
    encode?: CookieEncoder;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: long;
    partitioned?: boolean;
    path?: string;
    priority?: string;
    sameSite?: string | boolean;
    secure?: boolean;
    signed?: boolean;
}


export const CookieOptions: {
    new(): CookieOptions;
};`,
  RangeOptions: `
export interface RangeOptions {
    combine?: boolean;
}


export const RangeOptions: {
    new(): RangeOptions;
};`,
};

const rewriteGeneratedExpressSurfaceForJs = (text, filePath) => {
  let updated = stripInternalClrImports(text);

  updated = replaceAll(updated, [
    ["Task_1<Uint8Array>", "Promise<Uint8Array>"],
    ["Task_1<System_Internal.String>", "Promise<string>"],
    [": Task;", ": Promise<void>;"],
    ["Action_2<Error, System_Internal.String>", "(err: Error | undefined, html: string | undefined) => void"],
    ["Action_1<Error>", "(err: Error | undefined) => void"],
    ["Action_2<Exception, System_Internal.String>", "(err: Error | undefined, html: string | undefined) => void"],
    ["Action_1<Exception>", "(err: Error | undefined) => void"],
    ["Union_2<RangeResult, System_Internal.Int32>", "RangeResult | -1"],
    ["Dictionary_2<System_Internal.String, Action>", "Record<string, () => void>"],
    [/Dictionary_2<System_Internal\.String, ([^>]+)>/g, "Record<string, $1>"],
    ["IEnumerable_1<System_Internal.String>", "readonly string[]"],
    ["Nullable_1<System_Internal.Double>", "number | undefined"],
    ["Nullable_1<System_Internal.Int32>", "int | undefined"],
    ["Nullable_1<System_Internal.Int64>", "long | undefined"],
    ["Exception", "Error"],
    ["Action", "() => void"],
    ["System_Internal.Int32", "int"],
    ["System_Internal.Int64", "long"],
    ["double", "number"],
    ["System_Internal.String", "string"],
    ["mountpath: unknown;", "mountpath: string | string[];"],
    ["get sameSite(): unknown | undefined;", "get sameSite(): string | boolean | undefined;"],
    ["set sameSite(value: unknown | undefined);", "set sameSite(value: string | boolean | undefined);"],
    ["maxAge: unknown;", "maxAge: string | long;"],
    ["get limit(): unknown | undefined;", "get limit(): string | long | undefined;"],
    ["set limit(value: unknown | undefined);", "set limit(value: string | long | undefined);"],
    ["get type(): unknown | undefined;", "get type(): string | string[] | MediaTypeMatcher | undefined;"],
    ["set type(value: unknown | undefined);", "set type(value: string | string[] | MediaTypeMatcher | undefined);"],
    ["get extensions(): unknown | undefined;", "get extensions(): string[] | false | undefined;"],
    ["set extensions(value: unknown | undefined);", "set extensions(value: string[] | false | undefined);"],
    ["get index(): unknown | undefined;", "get index(): string | string[] | false | undefined;"],
    ["set index(value: unknown | undefined);", "set index(value: string | string[] | false | undefined);"],
    ["accepts(...types: string[]): unknown | undefined;", "accepts(...types: string[]): string | false;"],
    ["acceptsCharsets(...charsets: string[]): unknown | undefined;", "acceptsCharsets(...charsets: string[]): string | false;"],
    ["acceptsEncodings(...encodings: string[]): unknown | undefined;", "acceptsEncodings(...encodings: string[]): string | false;"],
    ["acceptsLanguages(...languages: string[]): unknown;", "acceptsLanguages(...languages: string[]): string | string[] | false;"],
    ["is(...types: string[]): unknown | undefined;", "is(...types: string[]): string | false | undefined;"],
    ["range(size: long, options?: RangeOptions): unknown;", "range(size: long, options?: RangeOptions): RangeResult | -1;"],
    [/\bnumber \| undefined \| number\b/g, "number | undefined"],
  ]);

  updated = updated.replace(
    /export const AppServer: \{\n[\s\S]*?\n\};\n+export type AppServer = AppServer\$instance;/m,
    "export const AppServer: {\n};\n\nexport type AppServer = AppServer$instance;"
  );

  for (const [name, block] of Object.entries(STRUCTURAL_TYPE_BLOCKS)) {
    updated = replaceGeneratedBlock(updated, name, block);
  }

  const forbiddenTokens = [
    "@tsonic/dotnet",
    "Dictionary_2",
    "IEnumerable_1",
    "Task_1",
    "Task;",
    "Action_1",
    "Action_2",
    "Nullable_1<System_Internal.Int32>",
    "Nullable_1<System_Internal.Int64>",
    "Nullable_1<System_Internal.Double>",
    "System_Internal.Double",
    "System_Internal.String",
    "../../Tsonic.JSRuntime/internal/index.js",
    "Tsonic.JSRuntime/internal/index.js",
  ];

  for (const token of forbiddenTokens) {
    if (updated.includes(token)) {
      throw new Error(`Forbidden CLR surface token '${token}' remained in: ${filePath}`);
    }
  }

  const requiredSnippets = [
    "VerifyBodyHandler = (req: Request, res: Response, buffer: Uint8Array, encoding: string) => void;",
    "listen(port: int, callback?: () => void): AppServer;",
    "statusCode: int;",
    "range(size: long, options?: RangeOptions): RangeResult | -1;",
    "bytes(): Promise<Uint8Array>;",
    "text(): Promise<string>;",
    "save(path: string): Promise<void>;",
    "readonly locals: Record<string, unknown | undefined>;",
    "query: Record<string, unknown | undefined>;",
  ];

  for (const snippet of requiredSnippets) {
    if (!updated.includes(snippet)) {
      throw new Error(`Expected JS-surface snippet missing from ${filePath}:\n${snippet}`);
    }
  }

  return syncCoreTypeImports(updated);
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

const stripNumericSemantics = (value) => {
  if (Array.isArray(value)) {
    return value.map(stripNumericSemantics);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([key]) => key !== "numericSemantics")
      .map(([key, nested]) => [key, stripNumericSemantics(nested)]);
    return Object.fromEntries(entries);
  }

  return value;
};

const syncPackageBindings = ({ major, repoRoot }) => {
  const bindingsPath = join(repoRoot, "versions", major, "index", "bindings.json");
  const original = JSON.parse(readFileSync(bindingsPath, "utf-8"));
  const rewritten = stripNumericSemantics(original);
  writeFileSync(bindingsPath, `${JSON.stringify(rewritten, null, 2)}\n`, "utf-8");
};

const syncPackageMetadata = ({ major, repoRoot }) => {
  const packageJsonPath = join(repoRoot, "versions", major, "package.json");
  const jsPackageJsonPath = join(repoRoot, "..", "js", "versions", major, "package.json");

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const jsPackageJson = JSON.parse(readFileSync(jsPackageJsonPath, "utf-8"));

  packageJson.main = "index.d.ts";
  packageJson.types = "index.d.ts";
  packageJson.files = [
    "**/*.d.ts",
    "**/*.js",
    "**/bindings.json",
    "families.json",
    "tsonic.bindings.json",
    "docs/**/*.md",
    "README.md",
    "LICENSE",
  ];
  packageJson.dependencies = {
    "@tsonic/js": jsPackageJson.version,
  };
  delete packageJson.peerDependencies;

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8");
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
  const publicIndex = join(repoRoot, "versions", major, "index.d.ts");

  const originalInternal = readFileSync(internalIndex, "utf-8");
  const withUseOrdering = reorderUseOverloads(originalInternal, internalIndex);
  const withPromiseCallbacks = rewriteTaskBackedCallbackReturnsAsPromise(withUseOrdering, internalIndex);
  const rewrittenInternal = rewriteGeneratedExpressSurfaceForJs(withPromiseCallbacks, internalIndex);
  if (rewrittenInternal !== originalInternal) {
    writeFileSync(internalIndex, rewrittenInternal, "utf-8");
  }

  const originalPublic = readFileSync(publicIndex, "utf-8");
  const rewrittenPublic = stripFacadeConstraintImports(originalPublic);
  if (/@tsonic\/dotnet|Tsonic\.JSRuntime\/internal/.test(rewrittenPublic)) {
    throw new Error(`Public facade still leaks CLR/runtime-internal imports: ${publicIndex}`);
  }
  if (rewrittenPublic !== originalPublic) {
    writeFileSync(publicIndex, rewrittenPublic, "utf-8");
  }

  syncNugetBindingsVersion({ major, repoRoot });
  syncPackageBindings({ major, repoRoot });
  syncPackageMetadata({ major, repoRoot });
};

main();
