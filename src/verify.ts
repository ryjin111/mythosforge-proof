// Offline proof verification — pure.
//
// Given an original manifest and a claimed commitment (manifest hash and/or
// token id), this re-derives the canonical hash and checks it matches. No
// network and no heavy dependencies: this is the trust-minimized core — anyone
// can confirm a proof from the manifest alone, without our site or an RPC.
//
// On-chain confirmation (does an anchor for this hash actually exist on Base?)
// is a separate concern and lives behind the `./anchor` entrypoint.

import { hashManifest, type Manifest } from './manifest.js';
import { parseManifestLineage, type RemixParents } from './lineage.js';

const HEX64 = /^[0-9a-fA-F]{64}$/;

export interface VerifyProofInput {
  /** The original manifest to re-hash. */
  manifest: Manifest;
  /**
   * The commitment to check against — accept any of:
   *   • `manifestHash`: bare or `0x` 64-hex SHA-256 of the canonical manifest, or
   *   • `tokenId`: decimal or `0x`-hex token id (token id == uint256(manifestHash)).
   * Provide at least one; if both are given, both must match.
   */
  manifestHash?: string;
  tokenId?: string;
}

export interface VerifyProofResult {
  /** True only if every provided commitment matches the re-derived hash. */
  valid: boolean;
  /** The hash re-derived from `manifest` (bare lowercase 64-hex). */
  computedHash: string;
  /** Per-check outcomes; a check is `null` when that commitment was not provided. */
  checks: {
    manifestHash: boolean | null;
    tokenId: boolean | null;
  };
  /** Parsed remix lineage if the manifest carries valid `parent_hashes`, else null. */
  lineage: RemixParents | null;
  /** Human-readable reasons for any failure (empty when valid). */
  reasons: string[];
}

/** Convert a bare/0x 64-hex hash to its decimal token id (uint256), or null. */
export function manifestHashToTokenId(hash: string): string | null {
  const bare = hash.replace(/^0x/i, '').toLowerCase();
  if (!HEX64.test(bare)) return null;
  return BigInt('0x' + bare).toString(10);
}

/** Convert a decimal or 0x-hex token id to its bare 64-hex manifest hash, or null. */
export function tokenIdToManifestHash(tokenId: string): string | null {
  const t = tokenId.trim();
  try {
    const n = /^0x[0-9a-fA-F]+$/.test(t) ? BigInt(t) : /^[0-9]+$/.test(t) ? BigInt(t) : null;
    if (n === null) return null;
    return n.toString(16).padStart(64, '0');
  } catch {
    return null;
  }
}

/**
 * Verify a proof entirely offline: re-derive the canonical manifest hash and
 * compare it to the supplied commitment(s). Returns a structured result rather
 * than throwing, so callers can surface precise reasons.
 */
export function verifyProof(input: VerifyProofInput): VerifyProofResult {
  const reasons: string[] = [];
  const computedHash = hashManifest(input.manifest).toLowerCase();
  const lineage = parseManifestLineage(input.manifest.parent_hashes);

  let hashCheck: boolean | null = null;
  if (input.manifestHash !== undefined) {
    const expected = input.manifestHash.replace(/^0x/i, '').toLowerCase();
    if (!HEX64.test(expected)) {
      hashCheck = false;
      reasons.push(`manifestHash is not 64-hex: ${input.manifestHash}`);
    } else {
      hashCheck = expected === computedHash;
      if (!hashCheck) reasons.push(`manifestHash mismatch: expected ${expected}, computed ${computedHash}`);
    }
  }

  let tokenCheck: boolean | null = null;
  if (input.tokenId !== undefined) {
    const fromToken = tokenIdToManifestHash(input.tokenId);
    if (fromToken === null) {
      tokenCheck = false;
      reasons.push(`tokenId is not a valid decimal/hex id: ${input.tokenId}`);
    } else {
      tokenCheck = fromToken === computedHash;
      if (!tokenCheck) reasons.push(`tokenId mismatch: derived hash ${fromToken}, computed ${computedHash}`);
    }
  }

  if (hashCheck === null && tokenCheck === null) {
    reasons.push('no commitment supplied: provide manifestHash and/or tokenId to verify against');
  }

  const provided = [hashCheck, tokenCheck].filter((c) => c !== null) as boolean[];
  const valid = provided.length > 0 && provided.every(Boolean);

  return { valid, computedHash, checks: { manifestHash: hashCheck, tokenId: tokenCheck }, lineage, reasons };
}
