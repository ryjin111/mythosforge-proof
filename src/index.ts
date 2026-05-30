// @mythosforge/proof — pure, dependency-free core.
//
// Importing this entrypoint pulls ONLY `node:crypto`. On-chain anchoring and
// verification (which need `ethers`) live in the separate `@mythosforge/proof/
// anchor` entrypoint. Keeping them apart means "verify a proof offline" stays
// lightweight. (Perceptual/similarity image hashing, which needs an image
// decoder, is planned as a future optional entrypoint.)

export {
  type Manifest,
  type ManifestRequired,
  type ManifestOptionalTrace,
  type IterationStep,
  type HumanEdit,
  type JsonValue,
  canonicalize,
  canonicalizeManifest,
  hashManifest,
} from './manifest.js';

export { hashImage, hashUtf8 } from './hash.js';

export {
  type RemixParents,
  parseManifestLineage,
  parseTokenLineage,
  isRemix,
} from './lineage.js';

export {
  type VerifyProofInput,
  type VerifyProofResult,
  verifyProof,
  manifestHashToTokenId,
  tokenIdToManifestHash,
} from './verify.js';

export {
  BASE_CHAIN_ID,
  BASE_CHAIN,
  ANCHOR_CONTRACT_BASE_MAINNET,
  MINT_CONTRACT_BASE_MAINNET,
  CANONICALIZATION,
} from './constants.js';
