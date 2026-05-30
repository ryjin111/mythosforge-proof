// Offline verification example — NO network, NO ethers, NO sharp.
//
//   node examples/offline-verify.mjs
//
// Demonstrates the trust-minimized core: anyone holding the original manifest
// can re-derive its commitment and confirm a proof without our site or an RPC.

import { hashManifest, verifyProof, manifestHashToTokenId } from '../dist/index.js';

// 1. The original manifest (what the creator committed to).
const manifest = {
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

// 2. Derive the commitment (this is what gets anchored on-chain).
const manifestHash = hashManifest(manifest);
const tokenId = manifestHashToTokenId(manifestHash);
console.log('manifest hash :', manifestHash);
console.log('token id      :', tokenId);

// 3. Verify the manifest against the commitment — fully offline.
const ok = verifyProof({ manifest, manifestHash, tokenId });
console.log('\nverify result :', ok.valid ? 'VALID ✓' : 'INVALID ✗');
console.log('checks        :', ok.checks);

// 4. Tamper detection: a single edited character breaks the proof.
const tampered = verifyProof({ manifest: { ...manifest, prompt: manifest.prompt + ' (edited)' }, manifestHash });
console.log('\ntampered      :', tampered.valid ? 'VALID ✓' : 'INVALID ✗ (expected)');
console.log('reason        :', tampered.reasons[0]);

if (!ok.valid || tampered.valid) {
  console.error('\nUNEXPECTED: offline verification did not behave as documented');
  process.exit(1);
}
console.log('\nOffline core works with zero heavy dependencies.');
