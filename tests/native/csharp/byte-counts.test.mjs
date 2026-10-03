import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../../tsonic-csharp/test/helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../../tsonic-csharp/test/helpers/native-construction.mjs";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import { nativeByteCountFiles, nativeByteCountSource } from "../../helpers/native-byte-counts.mjs";

test("Express buffer and streamed byte counts retain the selected C# native domains", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()],
    files: nativeByteCountFiles, sourceText: nativeByteCountSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /int echoBuffered\(int value\)/u);
  assert.match(output, /long echoStreamed\(long value\)/u);
  assert.doesNotMatch(output, /ToDouble|IsSafeInteger|BigInteger/u);
  const references = [fileURLToPath(new URL("../../../../csharp-nodejs/csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj", import.meta.url))];
  executeCsharpConstruction(compiled, "express-byte-counts", false, false, references, `
if (Tsonic.Generated.Index.echoBuffered(int.MaxValue) != int.MaxValue ||
    Tsonic.Generated.Index.echoStreamed(long.MaxValue) != long.MaxValue ||
    Tsonic.Generated.Index.echoStreamed(9007199254740993L) != 9007199254740993L ||
    Tsonic.Generated.Index.fieldLength(65536L) != 65536 ||
    Tsonic.Generated.Index.concatBinarySample() != "0080ff")
    throw new System.Exception("native byte count domain");
foreach (var value in new long[] { -1L, 65537L }) {
    var rejected = false;
    try { Tsonic.Generated.Index.fieldLength(value); }
    catch (System.Exception) { rejected = true; }
    if (!rejected) throw new System.Exception("field limit not enforced");
}
`);
});
