const UUID_BYTES = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;

/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` only exists in secure contexts, which a demo served over
 * plain HTTP on a LAN address is not; `getRandomValues` works everywhere.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES));
  bytes[VERSION_BYTE] = (bytes[VERSION_BYTE] & 0x0f) | 0x40;
  bytes[VARIANT_BYTE] = (bytes[VARIANT_BYTE] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
