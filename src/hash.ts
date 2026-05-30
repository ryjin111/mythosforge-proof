// Deterministic content hashing for proof inputs.
//
// `hashImage` is the SHA-256 of the raw rendered image bytes — the value that
// goes into a manifest's `output_hash`. It is a pure byte hash (no decoding, no
// `sharp`), so it stays in the dependency-free core. Perceptual / similarity
// hashing (which needs an image decoder) lives behind the optional `./image`
// entrypoint instead.

import { createHash } from 'node:crypto';

/**
 * SHA-256 hex digest (no `0x`) of raw image bytes. Use this to compute the
 * `output_hash` field of a manifest. Identical bytes always produce the same
 * hash; a single changed byte produces a different one.
 */
export function hashImage(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** SHA-256 hex digest (no `0x`) of a UTF-8 string. */
export function hashUtf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
