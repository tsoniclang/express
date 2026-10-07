import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileRust, artifactText } from "../../../../tsonic-rust/test/helpers/rust-session.mjs";
import { runCargo, writeGeneratedProject } from "../../../../tsonic-rust/test/helpers/cargo-projects.mjs";
import { createTsonicPlugin } from "../../../../rust-nodejs/dist/index.js";
import { nativeByteCountFiles, nativeByteCountSource } from "../../helpers/native-byte-counts.mjs";

test("Express buffer and streamed byte counts retain the selected Rust native domains", { timeout: 300_000 }, () => {
  const { result } = compileRust({ surfaces: ["js"], capabilities: [createTsonicPlugin()],
    target: { id: "rust", options: { outputType: "lib", crateName: "native_byte_counts" } },
    files: { ...nativeByteCountFiles, "index.ts": nativeByteCountSource } });
  assertNoTargetDiagnostics(result.diagnostics);
  const output = artifactText(result, "src/index.rs");
  assert.match(output, /fn echoBuffered\(value: usize\)/u);
  assert.match(output, /fn echoStreamed\(value: usize\)/u);
  assert.doesNotMatch(output, /to_f64|f64_to_|is_safe_integer|BigInt/u);
  const root = writeGeneratedProject("express-byte-counts", result.artifacts);
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "tests/counts.rs"), `
use native_byte_counts::index;

#[test]
fn native_count_domains_and_field_bound() {
    assert_eq!(index::echoBuffered(usize::MAX), usize::MAX);
    assert_eq!(index::echoStreamed(usize::MAX), usize::MAX);
    if usize::BITS >= 64 {
        let exact = usize::try_from(9_007_199_254_740_993_u64).unwrap();
        assert_eq!(index::echoStreamed(exact), exact);
    }
    assert_eq!(index::fieldLength(65_536).unwrap(), 65_536);
    assert!(index::fieldLength(65_537).is_err());
    assert_eq!(index::concatBinarySample().unwrap(), "0080ff");
}
`);
  runCargo(root, ["generate-lockfile", "--offline"]);
  runCargo(root, ["fmt", "--all"]);
  runCargo(root, ["fmt", "--all", "--check"]);
  runCargo(root, ["check", "--all-targets", "--locked", "--offline"]);
  runCargo(root, ["clippy", "--all-targets", "--locked", "--offline", "--", "-D", "warnings"]);
  runCargo(root, ["test", "--release", "--locked", "--offline"]);
});
