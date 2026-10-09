import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { packLocalPackage, repoRoot, run, runTsonic, withTempFixture, writeFixtureApp } from "../helpers/tsonic-fixture.js";
import { startNativeProcess, terminateNativeProcessGroup } from "../helpers/native-process.js";

test("one installed Express source package compiles and serves through C# and Rust", async (suite) => {
  await withTempFixture(async (directory) => {
    const nodePackages = resolve(repoRoot, "..");
    const toolchainRoot = process.env.TSONIC_TOOLCHAIN_ROOT ?? nodePackages;
    const toolchainPackages = {
      "@tsonic/cli": join(toolchainRoot, "tsonic", "packages", "cli"),
      "@tsonic/host": join(toolchainRoot, "tsonic", "packages", "host"),
      "@tsonic/target-api": join(toolchainRoot, "tsonic", "packages", "target-api"),
      "@tsonic/tsts": join(toolchainRoot, "tsonic", "packages", "tsts"),
      "@tsonic/source-core": join(toolchainRoot, "tsonic", "packages", "source-core"),
      "@tsonic/js-source-profile": join(toolchainRoot, "tsonic", "packages", "js-source-profile"),
      "@tsonic/target-csharp": join(toolchainRoot, "tsonic-csharp"),
      "@tsonic/target-rust": join(toolchainRoot, "tsonic-rust"),
      "@tsonic/csharp-runtime": join(toolchainRoot, "csharp-runtime"),
      "@tsonic/csharp-js": join(toolchainRoot, "csharp-js"),
      "@tsonic/rust-runtime": join(toolchainRoot, "rust-runtime"),
      "@tsonic/rust-js": join(toolchainRoot, "rust-js"),
      "@tsonic/csharp-nodejs": join(nodePackages, "csharp-nodejs"),
      "@tsonic/rust-nodejs": join(nodePackages, "rust-nodejs")
    };
    for (const [packageName, path] of Object.entries(toolchainPackages)) {
      assert.ok(existsSync(join(path, "package.json")), `${packageName} is unavailable at ${path}`);
    }
    const packageFile = packLocalPackage(directory);
    const packageJson = {
      name: "express-source-package-proof",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: {
        "@tsonic/express": `file:${packageFile}`
      },
      devDependencies: Object.fromEntries(Object.entries(toolchainPackages).map(
        ([packageName, path]) => [packageName, `file:${path}`]
      ))
    };
    writeFileSync(join(directory, "package.json"), JSON.stringify(packageJson, null, 2));
    run(directory, "npm", ["install", "--ignore-scripts", "--install-links=true", "--no-audit", "--no-fund"], {
      npm_config_cache: join(repoRoot, ".temp", "npm-cache")
    });
    writeFixtureApp(
      directory,
      readFileSync(join(repoRoot, "tests", "tsonic", "fixture-app.ts"), "utf-8")
    );

    const targets = [
      {
        id: "rust",
        options: { crateName: "express_source_proof", edition: "2024", outputType: "bin" },
        command: "cargo",
        args: ["run", "--manifest-path", "out/rust/Cargo.toml", "--quiet"]
      },
      {
        id: "csharp",
        options: { namespace: "ExpressSourceProof", assemblyName: "ExpressSourceProof", outputType: "Exe" },
        command: "dotnet",
        args: ["run", "--project", "out/csharp/ExpressSourceProof.csproj"]
      }
    ] as const;

    const failedTargets: string[] = [];
    for (const target of targets) {
      let completed = false;
      await suite.test(target.id, async () => {
        const configPath = `tsonic.${target.id}.json`;
        writeFileSync(join(directory, configPath), JSON.stringify({
          $schema: "https://tsonic.org/schema/v1.json",
          entryPoint: "App.ts",
          rootDir: "src",
          outDir: `out-${target.id}`,
          targets: [{ id: target.id, surfaces: ["js"], options: target.options }]
        }, null, 2));
        runTsonic(directory, ["build", "-p", configPath]);
        await runNativeApp(directory, target.command, target.args.map((argument) =>
          argument.replace("out/", `out-${target.id}/`)
        ));
        completed = true;
      });
      if (!completed) failedTargets.push(target.id);
    }
    assert.deepEqual(failedTargets, [], "Every installed target must complete before fixture cleanup.");
  });
});

async function runNativeApp(directory: string, command: string, args: string[]): Promise<void> {
  const child = startNativeProcess(command, args, directory, {
    ...process.env,
    CARGO_TARGET_DIR: join(directory, ".cargo-target"),
    DOTNET_CLI_HOME: join(directory, ".dotnet"),
    NUGET_PACKAGES: join(repoRoot, ".temp", "nuget-packages")
  });
  let output = "";
  let errors = "";
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (data: string) => { errors += data; });
  const exit = new Promise<number | null>((resolveExit) => {
    child.once("close", (code) => resolveExit(code));
  });
  const port = new Promise<number>((resolvePort, rejectPort) => {
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (data: string) => {
      output += data;
      const match = /TSONIC_EXPRESS_PORT:(\d+)/.exec(output);
      if (match) resolvePort(Number(match[1]));
    });
    child.once("exit", (code) => {
      if (!output.includes("TSONIC_EXPRESS_PORT:")) {
        rejectPort(new Error(`${command} exited ${String(code)} before listening\n${output}\n${errors}`));
      }
    });
    child.once("error", rejectPort);
  });
  const timer = setTimeout(() => terminateNativeProcessGroup(child.pid), 120_000);
  try {
    const address = `http://127.0.0.1:${await port}`;
    const health = await fetch(`${address}/health`, { signal: AbortSignal.timeout(10_000) });
    const healthBody = await health.text();
    assert.equal(health.status, 200, `Unexpected health response: ${healthBody.slice(0, 4096)}`);
    assert.equal(healthBody, '{"ok":true}');
    const stopped = await fetch(`${address}/stop`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(stopped.status, 200);
    assert.equal(await stopped.text(), "stopped");
    assert.equal(await exit, 0, `${command} failed\n${output}\n${errors}`);
  } finally {
    clearTimeout(timer);
    terminateNativeProcessGroup(child.pid);
    await exit;
  }
}
