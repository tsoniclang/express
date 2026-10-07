import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileRust, artifactText } from "../../../../tsonic-rust/test/helpers/rust-session.mjs";
import { runCargo, writeGeneratedProject } from "../../../../tsonic-rust/test/helpers/cargo-projects.mjs";
import { createTsonicPlugin } from "../../../../rust-nodejs/dist/index.js";
import { nativeRequestRangeFiles, nativeRequestRangesSource } from "../../helpers/native-request-ranges.mjs";

test("actual byte-range parser preserves unsigned native offsets and bounded decimal parsing", { timeout: 300_000 }, () => {
  const { result } = compileRust({ surfaces: ["js"], capabilities: [createTsonicPlugin()],
    target: { id: "rust", options: { outputType: "lib", crateName: "native_request_ranges" } },
    files: { ...nativeRequestRangeFiles, "index.ts": nativeRequestRangesSource } });
  assertNoTargetDiagnostics(result.diagnostics);
  const output = artifactText(result, "src/index.rs");
  assert.match(output, /fn firstStart\(header: String, size: u64\)/u);
  assert.match(output, /fn firstEnd\(header: String, size: u64\)/u);
  assert.doesNotMatch(artifactText(result, "src/ranges.rs"), /u64_to_f64|\.floor\(|BigInt/u);
  const root = writeGeneratedProject("express-request-ranges", result.artifacts);
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "tests/ranges.rs"), `
use native_request_ranges::index;

#[test]
fn native_range_precision_and_bounds() {
    let size = u64::MAX;
    for (header, start, end) in [
        ("bytes=9007199254740993-9007199254740995".to_owned(), 9_007_199_254_740_993, 9_007_199_254_740_995),
        (format!("bytes={}-", size - 2), size - 2, size - 1),
        ("bytes=-1".to_owned(), size - 1, size - 1),
        ("bytes=0-0".to_owned(), 0, 0),
        (format!("bytes=2-{}", "9".repeat(200)), 2, size - 1),
        (format!("bytes=-{}", "9".repeat(200)), 0, size - 1),
    ] {
        assert_eq!(index::status(header.clone(), size).unwrap(), 0.0);
        assert_eq!(index::firstStart(header.clone(), size).unwrap(), start);
        assert_eq!(index::firstEnd(header, size).unwrap(), end);
    }
    for header in [format!("bytes={size}-"), "bytes=-0".to_owned(), "bytes=2-1".to_owned(),
        "bytes=1.2-4".to_owned(), format!("bytes=2-{}x", "9".repeat(200)), format!("bytes=-{}x", "9".repeat(200))] {
        assert_eq!(index::status(header, size).unwrap(), -1.0);
    }
    assert_eq!(index::status("items=0-1".to_owned(), size).unwrap(), -2.0);
    assert_eq!(index::status("bytes=0-1".to_owned(), 0).unwrap(), -1.0);
    assert_eq!(index::combinedCount("bytes=30-39,0-9,10-20,18-30".to_owned(), size).unwrap(), 1.0);
    assert_eq!(index::combinedCount("bytes=30-39,0-9,20-29".to_owned(), size).unwrap(), 2.0);
}
`);
  runCargo(root, ["generate-lockfile", "--offline"]);
  runCargo(root, ["fmt", "--all"]);
  runCargo(root, ["fmt", "--all", "--check"]);
  runCargo(root, ["check", "--all-targets", "--locked", "--offline"]);
  runCargo(root, ["clippy", "--all-targets", "--locked", "--offline", "--", "-D", "warnings"]);
  runCargo(root, ["test", "--release", "--locked", "--offline"]);
});
