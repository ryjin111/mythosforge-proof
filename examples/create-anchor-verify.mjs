// Round-trip example: create -> anchor -> verify (on-chain).
//
//   node examples/create-anchor-verify.mjs
//
// The offline steps (build manifest, hash, verify) run with no config. The
// on-chain steps run ONLY when you fill in `CONFIG` below with your own RPC and
// a funded signer key — the example never broadcasts a transaction otherwise,
// and this package never reads keys from the environment for you.

import { hashManifest, verifyProof, manifestHashToTokenId } from '../dist/index.js';
import { anchorManifest, verifyAnchorOnChain } from '../dist/anchor.js';

// ── Fill these in to run the on-chain round-trip (leave as-is for offline only) ──
const CONFIG = {
  rpcUrl: '',       // e.g. 'https://mainnet.base.org'
  privateKey: '',   // a funded Base signer key — paste locally, never commit
  // contractAddress omitted -> defaults to the shared permissionless contract
};

// 1. Create a manifest and derive its commitment (offline).
const manifest = {
  prompt: 'a lighthouse made of clockwork on a glass sea',
  negative_prompt: '',
  model_id: 'flux-1.1',
  model_version: 'pro-2026.04',
  seed: 42,
  params: { steps: 40, guidance: 6.5 },
  output_hash: 'b'.repeat(64),
  submitter_wallet: '0x0000000000000000000000000000000000000abc',
  timestamp: '2026-05-30T12:00:00Z',
};
const manifestHash = hashManifest(manifest);
console.log('manifest hash :', manifestHash);
console.log('token id      :', manifestHashToTokenId(manifestHash));
console.log('offline verify:', verifyProof({ manifest, manifestHash }).valid ? 'VALID ✓' : 'INVALID ✗');

if (!CONFIG.rpcUrl || !CONFIG.privateKey) {
  console.log('\n(on-chain steps skipped — fill CONFIG.rpcUrl + CONFIG.privateKey to anchor & verify live)');
  process.exit(0);
}

// 2. Anchor the commitment on Base (costs gas).
const { txHash } = await anchorManifest(
  { manifestHash, agentId: 'example-agent', agentWallet: manifest.submitter_wallet },
  CONFIG,
);
console.log('\nanchor tx     :', txHash);

// 3. Verify the anchor exists on-chain (read-only).
const onchain = await verifyAnchorOnChain(manifestHash, { rpcUrl: CONFIG.rpcUrl });
console.log('anchored      :', onchain.anchored ? 'YES ✓' : 'NO ✗');
console.log('anchors       :', onchain.anchors);
if (!onchain.anchored) {
  console.error('UNEXPECTED: anchor not found on-chain after broadcasting');
  process.exit(1);
}
console.log('\nRound-trip complete: created, anchored, and verified on-chain.');
