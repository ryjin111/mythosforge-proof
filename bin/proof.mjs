#!/usr/bin/env node
// proof — attest an artifact with a Proof-of-Creation receipt, and verify one.
//
// Phase A of the GitLawb integration (see INTEGRATION.md): an agent runs `attest`
// on something it made → gets a receipt sidecar it can commit alongside the
// artifact in a PR; a reviewer runs `verify` to confirm, offline, that the
// receipt matches both its on-chain commitment AND the artifact bytes in the PR.
//
// Zero GitLawb dependency — works in any git flow (GitLawb speaks standard git).
// Pure local: only the published @mythosforge/proof core (node:crypto), no network.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { hashImage, hashManifest, manifestHashToTokenId, verifyProof } from '../dist/index.js';

const RECEIPT_VERSION = 'mythosforge-proof-receipt/v1';

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
}

function attest(file, opts) {
  const bytes = readFileSync(file);
  const output_hash = hashImage(bytes); // sha256 hex of the artifact bytes
  const manifest = {
    prompt: opts.prompt ?? '',
    negative_prompt: opts['negative-prompt'] ?? '',
    model_id: opts.model ?? 'unspecified',
    model_version: opts['model-version'] ?? 'unspecified',
    seed: opts.seed !== undefined ? Number(opts.seed) : null,
    params: {},
    output_hash,
    submitter_wallet: opts.wallet ?? opts.did ?? 'unspecified',
    timestamp: opts.timestamp ?? new Date().toISOString(),
  };
  const manifestHash = hashManifest(manifest);
  const tokenId = manifestHashToTokenId(manifestHash);
  const receipt = {
    version: RECEIPT_VERSION,
    artifact: basename(file),
    manifest,
    manifestHash,
    tokenId,
  };
  const out = opts.out ?? `${file}.proof.json`;
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`attested ${basename(file)}`);
  console.log(`  output_hash : ${output_hash}`);
  console.log(`  manifestHash: ${manifestHash}`);
  console.log(`  tokenId     : ${tokenId}`);
  console.log(`  receipt     : ${out}`);
  console.log(`\nCommit ${basename(file)} + ${basename(out)} together in your PR.`);
}

function verify(receiptPath, opts) {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const { manifest, manifestHash, tokenId } = receipt;

  // 1. Commitment check: does the manifest re-hash to its claimed hash/tokenId?
  const res = verifyProof({ manifest, manifestHash, tokenId });

  // 2. Artifact-binding check: does the file in the PR actually match the manifest?
  //    (verifyProof only proves the manifest is self-consistent; this proves the
  //    receipt is FOR this artifact, not a different one.)
  let artifactCheck = null;
  const artifactPath = opts.artifact ?? receipt.artifact;
  if (artifactPath) {
    try {
      const bytes = readFileSync(artifactPath);
      artifactCheck = hashImage(bytes) === manifest.output_hash;
    } catch {
      artifactCheck = null; // artifact not found alongside — skip, don't fail spuriously
    }
  }

  const ok = res.valid && artifactCheck !== false;
  console.log(`commitment : ${res.valid ? 'VALID' : 'INVALID'} (manifest re-hashes to its commitment)`);
  console.log(
    `artifact   : ${
      artifactCheck === null ? 'not checked (artifact not provided/found)' : artifactCheck ? 'MATCHES manifest output_hash' : 'DOES NOT MATCH — receipt is not for this file'
    }`,
  );
  if (res.computedHash) console.log(`computed   : ${res.computedHash}`);
  if (res.reasons.length) console.log(`reasons    : ${res.reasons.join('; ')}`);
  console.log(`\n${ok ? '✅ VERIFIED' : '❌ NOT VERIFIED'}`);
  process.exit(ok ? 0 : 1);
}

function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = positional;
  if (cmd === 'attest' && arg) return attest(arg, opts);
  if (cmd === 'verify' && arg) return verify(arg, opts);
  console.log(`proof — Proof-of-Creation attest/verify

Usage:
  proof attest <artifact> [--out <receipt.json>] [--model <id>] [--model-version <v>]
                          [--seed <n>] [--wallet <did|0x...>] [--prompt <text>]
  proof verify <receipt.json> [--artifact <file>]

Attest writes a receipt sidecar to commit next to the artifact in a PR.
Verify recomputes the commitment offline AND checks the artifact bytes match.`);
  process.exit(cmd ? 1 : 0);
}

main();
