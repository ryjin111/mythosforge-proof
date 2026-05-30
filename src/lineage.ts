// Remix lineage helpers — pure.
//
// A remix is a creation that descends from exactly two prior proven creations.
// Its manifest carries `parent_hashes: [base, style]` (the parents' manifest
// hashes), and the on-chain token metadata mirrors this as a top-level
// `lineage.remixed_from`. These helpers read and validate that lineage so a
// verifier can walk the family tree without trusting any off-chain index.

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** A validated remix lineage: the two parent manifest hashes, in [base, style] order. */
export type RemixParents = [string, string];

/** Normalize a hash to bare lowercase 64-hex, or return null if malformed. */
function normalizeHash(h: unknown): string | null {
  if (typeof h !== 'string') return null;
  const bare = h.replace(/^0x/i, '').toLowerCase();
  return HEX64.test(bare) ? bare : null;
}

/**
 * Extract remix lineage from a manifest's `parent_hashes`. Returns the pair
 * (bare lowercase 64-hex) only when it is EXACTLY two well-formed hashes;
 * anything else (absent, malformed, wrong length) → null, so a broken family
 * tree never renders.
 */
export function parseManifestLineage(parentHashes: unknown): RemixParents | null {
  if (!Array.isArray(parentHashes) || parentHashes.length !== 2) return null;
  const a = normalizeHash(parentHashes[0]);
  const b = normalizeHash(parentHashes[1]);
  return a && b ? [a, b] : null;
}

/**
 * Extract remix lineage from on-chain token metadata's top-level
 * `lineage.remixed_from`. Same strictness as {@link parseManifestLineage}.
 */
export function parseTokenLineage(metadata: unknown): RemixParents | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const lineage = (metadata as Record<string, unknown>).lineage;
  if (!lineage || typeof lineage !== 'object') return null;
  return parseManifestLineage((lineage as Record<string, unknown>).remixed_from);
}

/** True when the value is a valid remix lineage (exactly two well-formed parents). */
export function isRemix(parentHashes: unknown): boolean {
  return parseManifestLineage(parentHashes) !== null;
}
