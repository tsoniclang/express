import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const major = args.find((a) => /^\d+$/.test(a)) ?? "10";
  const check = args.includes("--check");
  return { major, check };
};

const readText = (path) => readFileSync(path, "utf-8");

const render = (templateText, repoRoot) =>
  templateText.replaceAll(/<!--\s*include:\s*([^>]+?)\s*-->/g, (_m, rel) => {
    const filePath = resolve(join(repoRoot, rel.trim()));
    return readText(filePath).replace(/\r\n/g, "\n").replace(/\n$/, "");
  });

const main = () => {
  const { major, check } = parseArgs();
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(join(here, "../.."));

  const templatePath = join(repoRoot, "README.template.md");
  const rendered = render(readText(templatePath), repoRoot) + "\n";

  const targets = [
    join(repoRoot, "README.md"),
    join(repoRoot, "versions", major, "README.md"),
  ];

  for (const target of targets) {
    const existing = readText(target);
    if (check) {
      if (existing !== rendered) {
        throw new Error(
          `README is out of date: ${target}\nRun: npm run docs:render:${major}`
        );
      }
      continue;
    }
    writeFileSync(target, rendered, "utf-8");
  }
};

main();

