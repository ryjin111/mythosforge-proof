// Offline core tests — run with `node --test` (no network, no ethers, no sharp).
//
// Imports the built pure-core entrypoint (`dist/index.js`), so `npm run build`
// must run first. The golden-hash test is the load-bearing one: it pins the
// canonical hash of a fixed manifest, proving this package re-derives the exact
// same commitment as the production pipeline — i.e. proofs anchored by the live
// platform still verify against this open-source package.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalize,
  hashManifest,
  hashImage,
  verifyProof,
  parseManifestLineage,
  parseTokenLineage,
  manifestHashToTokenId,
  tokenIdToManifestHash,
} from '../dist/index.js';

const base = {
  prompt: 'a serene mountain landscape at dawn, cinematic lighting',
  negative_prompt: 'blurry, watermark',
  model_id: 'flux-1.1',
  model_version: 'pro-2026.04',
  seed: 123456789,
  params: { steps: 50, guidance: 7.5, aspect_ratio: '16:9' },
  output_hash: 'a'.repeat(64),
  submitter_wallet: '0x0000000000000000000000000000000000000001',
  timestamp: '2026-05-12T20:30:54Z',
};

// Cross-implementation golden. If this ever changes, existing on-chain proofs
// would stop re-verifying against this package — treat any drift as a bug.
const GOLDEN_BASE_HASH = 'c0d202aed959b528b0f8abd46b891ef006f42e0322c0173cc943e63c10632689';

test('golden hash: matches the production canonical commitment', () => {
  assert.equal(hashManifest(base), GOLDEN_BASE_HASH);
});

test('determinism: same input -> same hash', () => {
  assert.equal(hashManifest(base), hashManifest({ ...base }));
});

test('key-order independence: shuffled keys -> same hash', () => {
  const shuffled = {
    timestamp: base.timestamp,
    submitter_wallet: base.submitter_wallet,
    output_hash: base.output_hash,
    params: { aspect_ratio: '16:9', guidance: 7.5, steps: 50 },
    seed: base.seed,
    model_version: base.model_version,
    model_id: base.model_id,
    negative_prompt: base.negative_prompt,
    prompt: base.prompt,
  };
  assert.equal(hashManifest(base), hashManifest(shuffled));
});

test('change-detection: prompt / seed / timestamp edits change the hash', () => {
  assert.notEqual(hashManifest(base), hashManifest({ ...base, prompt: base.prompt + '.' }));
  assert.notEqual(hashManifest(base), hashManifest({ ...base, seed: base.seed + 1 }));
  assert.notEqual(hashManifest(base), hashManifest({ ...base, timestamp: '2026-05-12T20:30:55Z' }));
});

test('null vs zero seed hash differently', () => {
  assert.notEqual(hashManifest({ ...base, seed: 0 }), hashManifest({ ...base, seed: null }));
});

test('optional omission: undefined optional fields == omitted', () => {
  const withUndef = { ...base, iteration_history: undefined, reliance_intent: undefined, parent_hashes: undefined };
  assert.equal(hashManifest(base), hashManifest(withUndef));
});

test('canonical form is whitespace-free and key-sorted', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('non-finite numbers rejected', () => {
  assert.throws(() => canonicalize({ x: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalize({ x: Number.POSITIVE_INFINITY }), /non-finite/);
});

// ── Remix lineage ──
const parentA = 'a'.repeat(64);
const parentB = 'b'.repeat(64);

test('remix: parent order is semantic — [base,style] != [style,base]', () => {
  assert.notEqual(
    hashManifest({ ...base, parent_hashes: [parentA, parentB] }),
    hashManifest({ ...base, parent_hashes: [parentB, parentA] }),
  );
});

test('parseManifestLineage: exactly two 64-hex or null', () => {
  assert.deepEqual(parseManifestLineage([parentA, parentB]), [parentA, parentB]);
  assert.equal(parseManifestLineage([parentA]), null);
  assert.equal(parseManifestLineage([parentA, parentB, parentA]), null);
  assert.equal(parseManifestLineage(['nope', parentB]), null);
  assert.equal(parseManifestLineage(undefined), null);
});

test('parseManifestLineage: strips 0x and lowercases', () => {
  assert.deepEqual(parseManifestLineage(['0x' + 'A'.repeat(64), parentB]), [parentA, parentB]);
});

test('parseTokenLineage: reads top-level lineage.remixed_from', () => {
  assert.deepEqual(parseTokenLineage({ lineage: { remixed_from: [parentA, parentB] } }), [parentA, parentB]);
  assert.equal(parseTokenLineage({ lineage: {} }), null);
  assert.equal(parseTokenLineage({}), null);
});

// ── hashImage ──
test('hashImage: sha256 of bytes, change-sensitive', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.match(hashImage(bytes), /^[0-9a-f]{64}$/);
  assert.notEqual(hashImage(bytes), hashImage(new Uint8Array([1, 2, 3, 5])));
});

// ── token id <-> manifest hash ──
test('manifestHashToTokenId / tokenIdToManifestHash round-trip', () => {
  const id = manifestHashToTokenId(GOLDEN_BASE_HASH);
  assert.equal(tokenIdToManifestHash(id), GOLDEN_BASE_HASH);
  assert.equal(tokenIdToManifestHash('0x' + GOLDEN_BASE_HASH), GOLDEN_BASE_HASH);
});

// ── verifyProof (offline) ──
test('verifyProof: valid when manifestHash matches', () => {
  const r = verifyProof({ manifest: base, manifestHash: GOLDEN_BASE_HASH });
  assert.equal(r.valid, true);
  assert.equal(r.computedHash, GOLDEN_BASE_HASH);
  assert.equal(r.checks.manifestHash, true);
});

test('verifyProof: valid when tokenId matches (token id == uint256(hash))', () => {
  const id = manifestHashToTokenId(GOLDEN_BASE_HASH);
  const r = verifyProof({ manifest: base, tokenId: id });
  assert.equal(r.valid, true);
  assert.equal(r.checks.tokenId, true);
});

test('verifyProof: invalid on tampered manifest', () => {
  const r = verifyProof({ manifest: { ...base, prompt: base.prompt + ' (edited)' }, manifestHash: GOLDEN_BASE_HASH });
  assert.equal(r.valid, false);
  assert.equal(r.checks.manifestHash, false);
  assert.ok(r.reasons.length > 0);
});

test('verifyProof: invalid when no commitment supplied', () => {
  const r = verifyProof({ manifest: base });
  assert.equal(r.valid, false);
  assert.match(r.reasons.join(' '), /no commitment/);
});

test('verifyProof: surfaces remix lineage from the manifest', () => {
  const remixManifest = { ...base, parent_hashes: [parentA, parentB] };
  const r = verifyProof({ manifest: remixManifest, manifestHash: hashManifest(remixManifest) });
  assert.equal(r.valid, true);
  assert.deepEqual(r.lineage, [parentA, parentB]);
});
