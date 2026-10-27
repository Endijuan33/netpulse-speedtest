import { createHash, randomBytes } from "crypto";

/**
 * Unguessable share ID: SHA-256 of the result payload plus a random salt,
 * truncated to 24 hex characters (96 bits of entropy contribution from salt).
 * The payload itself is NOT stored server-side (see /api/share): the client
 * encodes it in the URL fragment of /r/[id], so the ID is an opaque handle,
 * not a database key.
 */
export function createShareId(payload: unknown): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .update(salt)
    .digest("hex");
  return hash.slice(0, 24);
}

export function isValidShareId(id: string): boolean {
  return /^[0-9a-f]{24}$/.test(id);
}
