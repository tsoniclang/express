import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../../tsonic-csharp/test/helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../../tsonic-csharp/test/helpers/native-construction.mjs";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import { nativeRequestRangeFiles, nativeRequestRangesSource } from "../../helpers/native-request-ranges.mjs";

test("actual byte-range parser preserves signed native offsets and bounded decimal parsing", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()],
    files: nativeRequestRangeFiles, sourceText: nativeRequestRangesSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /long firstStart\(string header, long size\)/u);
  assert.match(output, /long firstEnd\(string header, long size\)/u);
  assert.doesNotMatch(output, /ToDouble|Math\.Floor|BigInteger/u);
  const references = [fileURLToPath(new URL("../../../../csharp-nodejs/csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj", import.meta.url))];
  executeCsharpConstruction(compiled, "express-request-ranges", false, false, references, `
var size = long.MaxValue;
foreach (var entry in new (string Header, long Start, long End)[] {
    ("bytes=9007199254740993-9007199254740995", 9007199254740993L, 9007199254740995L),
    ($"bytes={size - 2}-", size - 2, size - 1),
    ("bytes=-1", size - 1, size - 1),
    ("bytes=0-0", 0, 0),
    ($"bytes=2-{new string('9', 200)}", 2, size - 1),
    ($"bytes=-{new string('9', 200)}", 0, size - 1),
}) {
    if (Tsonic.Generated.Index.status(entry.Header, size) != 0 ||
        Tsonic.Generated.Index.firstStart(entry.Header, size) != entry.Start ||
        Tsonic.Generated.Index.firstEnd(entry.Header, size) != entry.End)
        throw new System.Exception("native range precision");
}
foreach (var header in new string[] { $"bytes={size}-", "bytes=-0", "bytes=2-1", "bytes=1.2-4",
    $"bytes=2-{new string('9', 200)}x", $"bytes=-{new string('9', 200)}x" }) {
    if (Tsonic.Generated.Index.status(header, size) != -1) throw new System.Exception("range rejection");
}
if (Tsonic.Generated.Index.status("items=0-1", size) != -2 ||
    Tsonic.Generated.Index.status("bytes=0-1", 0) != -1 ||
    Tsonic.Generated.Index.status("bytes=0-1", -1) != -1 ||
    Tsonic.Generated.Index.combinedCount("bytes=30-39,0-9,10-20,18-30", size) != 1 ||
    Tsonic.Generated.Index.combinedCount("bytes=30-39,0-9,20-29", size) != 2)
    throw new System.Exception("range contract");
`);
});
