export function requireSafeRecordKey(key: string): void {
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    throw new Error("Unsafe record key");
  }
}
