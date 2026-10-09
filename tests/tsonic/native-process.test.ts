import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { startNativeProcess, terminateNativeProcessGroup } from "../helpers/native-process.js";

test("native application cleanup drains its parent and inherited-pipe descendant", { timeout: 10_000 }, async () => {
  const child = startNativeProcess(process.execPath, ["--input-type=module", "-e", `
    import { spawn } from "node:child_process";
    const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    console.log(descendant.pid);
    setInterval(() => {}, 1000);
  `], process.cwd(), process.env);
  const closed = once(child, "close");
  try {
    const [output] = await once(child.stdout, "data");
    assert.match(String(output), /^[1-9][0-9]*\s*$/);
    terminateNativeProcessGroup(child.pid);
    const [code, signal] = await closed;
    assert.equal(code, null);
    assert.equal(signal, "SIGKILL");
    terminateNativeProcessGroup(child.pid);
  } finally {
    terminateNativeProcessGroup(child.pid);
  }
});

test("native application cleanup accepts an absent spawn PID", () => {
  terminateNativeProcessGroup(undefined);
});
