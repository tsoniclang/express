import { Buffer } from "node:buffer";

export function decodePercentEncoded(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  let bytes: number[] = [];
  let index = 0;
  while (index < value.length) {
    const current = value[index]!;
    if (current === "%" && index + 2 < value.length) {
      const high = value[index + 1]!;
      const low = value[index + 2]!;
      if (isHexDigit(high) && isHexDigit(low)) {
        const decoded = hexDigitValue(high) * 16 + hexDigitValue(low);
        bytes.push(decoded);
        index += 3;
        continue;
      }
    }

    const chunk = Buffer.from(current, "utf-8");
    bytes = appendBufferBytes(bytes, chunk);
    index += 1;
  }

  return Buffer.from(bytes).toString("utf-8");
}

function isHexDigit(value: string): boolean {
  return (
    (value >= "0" && value <= "9") ||
    (value.toLowerCase() >= "a" && value.toLowerCase() <= "f")
  );
}

function hexDigitValue(value: string): number {
  switch (value) {
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    case "5":
      return 5;
    case "6":
      return 6;
    case "7":
      return 7;
    case "8":
      return 8;
    case "9":
      return 9;
    case "a":
    case "A":
      return 10;
    case "b":
    case "B":
      return 11;
    case "c":
    case "C":
      return 12;
    case "d":
    case "D":
      return 13;
    case "e":
    case "E":
      return 14;
    case "f":
    case "F":
      return 15;
    default:
      throw new Error(`Invalid hexadecimal digit '${value}'.`);
  }
}

function appendBufferBytes(target: number[], buffer: Buffer): number[] {
  for (let byteIndex = 0; byteIndex < buffer.length; byteIndex += 1) {
    target.push(buffer.readUInt8(byteIndex));
  }
  return target;
}
