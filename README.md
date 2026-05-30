# @mythosforge/proof

Open-source **Proof-of-Creation** toolkit for AI agents.

Turn any AI creation into a portable, tamper-evident proof: hash a canonical
**manifest** (prompt + params + output hash + wallet + timestamp), anchor that
hash on-chain (Base), and let anyone verify it — with or without a network.

It is the same proof standard the MythosForge platform runs, extracted so any
agent or builder can create and verify against it.

## Install

```bash
npm install @mythosforge/proof
# ethers is only needed for on-chain anchoring/verification (optional peer):
npm install ethers
```

## Two entrypoints, one dependency boundary

| Import | Pulls | Use for |
| --- | --- | --- |
| `@mythosforge/proof` | only `node:crypto` | build a manifest, hash it, verify a proof **offline** |
| `@mythosforge/proof/anchor` | `ethers` | anchor a manifest hash on Base and confirm it on-chain |

Importing the core never loads `ethers`, so "verify a proof offline" stays
lightweight.

## Quickstart — offline

```js
import { hashManifest, verifyProof, manifestHashToTokenId } from '@mythosforge/proof';

const manifest = {
  prompt: 'a serene mountain landscape at dawn, cinematic lighting',
  negative_prompt: 'blurry, watermark',
  model_id: 'flux-1.1',
  model_version: 'pro-2026.04',
  seed: 123456789,
  params: { steps: 50, guidance: 7.5, aspect_ratio: '16:9' },
  output_hash: 'a'.repeat(64),               // sha256 of the image bytes
  submitter_wallet: '0x0000000000000000000000000000000000000001',
  timestamp: '2026-05-12T20:30:54Z',
};

const manifestHash = hashManifest(manifest);            // the on-chain commitment
const tokenId = manifestHashToTokenId(manifestHash);    // tokenId == uint256(hash)

const result = verifyProof({ manifest, manifestHash, tokenId });
console.log(result.valid); // true — recomputes the hash and compares
```

A single changed byte in the manifest changes the hash, so verification fails —
that is the tamper-evidence.

## Canonicalization (the spec)

The manifest hash is `sha256` of the manifest serialized with these rules:

1. Object keys in lexicographic (UTF-16 code-unit) order.
2. No whitespace between JSON tokens.
3. Optional fields omitted when `undefined` (never serialized as `null`).
4. String values preserved verbatim.
5. Numbers via `JSON.stringify` (no `NaN`/`Infinity`).
6. Arrays preserve order (meaningful — e.g. remix parent order is `[base, style]`).

Anyone re-hashing a manifest MUST follow these rules to reproduce the
commitment. The rules are implemented in ~40 lines of dependency-free code.

## Remix lineage

A remix carries `parent_hashes: [base, style]` — the manifest hashes of the two
proven creations it descends from. `verifyProof` surfaces validated lineage, and
`parseTokenLineage` reads it from on-chain token metadata, so the family tree is
walkable from on-chain data alone.

## What a proof does and does not claim

- **Proves:** a specific manifest was committed at time T, and (once anchored)
  that commitment exists on-chain. Tamper-evident.
- **Does NOT prove:** originality, human authorship, or image uniqueness.
  Describe a verified proof as a *verified submission / provenance*, never a
  *verified original*.

## License

MIT.
