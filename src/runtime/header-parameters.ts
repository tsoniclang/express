export function readHeaderParameter(header: string, name: string): string | undefined {
  let offset = header.indexOf(";");
  while (offset >= 0) {
    offset += 1;
    while (offset < header.length && (header[offset] === " " || header[offset] === "\t")) offset += 1;
    const keyStart = offset;
    while (offset < header.length && header[offset] !== "=" && header[offset] !== ";") offset += 1;
    if (header[offset] !== "=") {
      if (offset >= header.length) return undefined;
      continue;
    }
    const key = header.slice(keyStart, offset).trim().toLowerCase();
    offset += 1;
    while (offset < header.length && (header[offset] === " " || header[offset] === "\t")) offset += 1;
    let value = "";
    if (header[offset] === '"') {
      offset += 1;
      let closed = false;
      while (offset < header.length) {
        const character = header[offset]!;
        offset += 1;
        if (character === '"') {
          closed = true;
          break;
        }
        if (character === "\\") {
          if (offset >= header.length) throw new Error("Malformed header parameter");
          value += header[offset]!;
          offset += 1;
        } else {
          value += character;
        }
      }
      if (!closed) throw new Error("Malformed header parameter");
      while (offset < header.length && (header[offset] === " " || header[offset] === "\t")) offset += 1;
      if (offset < header.length && header[offset] !== ";") throw new Error("Malformed header parameter");
    } else {
      const valueStart = offset;
      while (offset < header.length && header[offset] !== ";") offset += 1;
      value = header.slice(valueStart, offset).trim();
    }
    if (value.includes("\r") || value.includes("\n") || value.includes("\0")) {
      throw new Error("Invalid header parameter");
    }
    if (key === name) return value;
  }
  return undefined;
}
