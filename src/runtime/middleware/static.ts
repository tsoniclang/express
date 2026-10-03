import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { StaticOptions } from "../options.js";
import { decodePercentEncoded } from "../percent-decoding.js";
import type { RequestHandler } from "../types.js";

export function createStaticMiddleware(root: string, options?: StaticOptions): RequestHandler {
  const rootPath = resolve(root);
  const configuredIndex = options?.index;
  const indexes = configuredIndex === false
    ? []
    : typeof configuredIndex === "string"
      ? [configuredIndex]
      : configuredIndex ?? ["index.html"];

  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      await next();
      return;
    }

    let pathname: string;
    try {
      pathname = decodePercentEncoded(req.path);
    } catch {
      res.status(400).send("Bad Request");
      return;
    }
    if (pathname.includes("\0")) {
      res.status(400).send("Bad Request");
      return;
    }
    const candidate = resolve(rootPath, pathname.replace(/^[/\\]+/, ""));
    if (!isWithinRoot(rootPath, candidate)) {
      res.status(403).send("Forbidden");
      return;
    }
    const segments = pathname.split(/[\\/]/);
    if (segments.some((segment) => segment !== undefined && segment.startsWith(".") && segment.length > 1)) {
      if (options?.dotfiles === "deny") res.status(403).send("Forbidden");
      else if (options?.dotfiles !== "allow") {
        if (options?.fallthrough === false) res.status(404).send("Not Found");
        else await next();
      }
      if (options?.dotfiles !== "allow") return;
    }

    let selected = await existingFile(candidate);
    if (selected === undefined) {
      const directory = await existingDirectory(candidate);
      if (directory) {
        if (!pathname.endsWith("/") && options?.redirect !== false) {
          res.redirect(301, `${req.path}/`);
          return;
        }
        for (const index of indexes) {
          const path = resolve(candidate, index);
          if (!isWithinRoot(rootPath, path)) continue;
          selected = await existingFile(path);
          if (selected !== undefined) break;
        }
      } else if (options?.extensions !== false && options?.extensions !== undefined) {
        for (const extension of options.extensions) {
          const path = `${candidate}.${extension.replace(/^\./, "")}`;
          if (!isWithinRoot(rootPath, path)) continue;
          selected = await existingFile(path);
          if (selected !== undefined) break;
        }
      }
    }

    if (selected === undefined) {
      if (options?.fallthrough === false) res.status(404).send("Not Found");
      else await next();
      return;
    }

    res.sendFile(selected, {
      root: rootPath,
      dotfiles: options?.dotfiles,
      maxAge: options?.maxAge,
      lastModified: options?.lastModified,
      acceptRanges: options?.acceptRanges,
      cacheControl: options?.cacheControl,
      immutable: options?.immutable,
      etag: options?.etag,
      setHeaders: options?.setHeaders
    });
    await res.completion;
  };
}

function isWithinRoot(root: string, path: string): boolean {
  const offset = relative(root, path);
  return offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

async function existingFile(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
}

async function existingDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
