// Proof-of-Creation manifest schema + canonical hashing.
//
// A "manifest" is the tamper-evident record of how a piece was created: the
// prompt, generation parameters, the hash of the output image, the creator's
// wallet, and a timestamp. Hashing the manifest with the canonicalization rules
// below yields a single SHA-256 commitment that can be anchored on-chain and
// re-derived by anyone holding the original manifest.
//
// What a manifest proves:  a specific manifest (prompt + params + output_hash +
//   wallet) was committed at time T. Tamper-evident — any field change yields a
//   different hash.
// What it does NOT prove:  originality, authorship beyond wallet control, image
//   uniqueness, or "measured cognition". Describe a verified manifest as a
//   "verified submission / provenance", never a "verified original".
//
// Canonicalization rules (these ARE the spec — anyone re-hashing MUST follow):
//   1. Object keys serialized in lexicographic (UTF-16 code-unit) order.
//   2. No whitespace between JSON tokens.
//   3. Optional fields omitted when `undefined` (NOT serialized as null), so a
//      manifest without optional fields hashes identically whether the caller
//      passed `undefined` or omitted the key entirely.
//   4. String values preserved verbatim — leading/trailing whitespace inside a
//      prompt IS part of the prompt and changes the hash.
//   5. Numeric values serialized via JSON.stringify (no NaN / Infinity allowed).
//   6. Arrays preserve insertion order (order is meaningful — e.g. a remix's
//      parent list and an iteration history are sequences).
//
// Pure: depends only on `node:crypto`. No network, no environment variables.

import { createHash } from 'node:crypto';

// ─── Schema ──────────────────────────────────────────────────────────────────

/** Required fields — present on every manifest. */
export interface ManifestRequired {
  prompt: string;
  /** Empty string allowed; the explicit field forces callers to be deliberate. */
  negative_prompt: string;
  /** e.g. 'flux-1.1', 'sdxl-1.0'. */
  model_id: string;
  /** Provider-reported version string. */
  model_version: string;
  /**
   * Integer; 0 is a valid distinct value. Use `null` when no seed was specified
   * by the generator — conflating "used seed 0" with "no seed" would let a
   * non-deterministic provider claim a reproducible seed it never set.
   */
  seed: number | null;
  /** Generation parameters (steps, guidance, aspect ratio, …). */
  params: Record<string, JsonValue>;
  /** Hex SHA-256 of the rendered image bytes (no `0x`). */
  output_hash: string;
  /** `0x…` or other wallet identifier of the submitter. */
  submitter_wallet: string;
  /** ISO-8601 UTC, e.g. '2026-05-12T20:30:54Z'. */
  timestamp: string;
}

/**
 * Optional provenance-trace fields. Not required to produce a valid manifest;
 * present so richer proofs can include them without a schema change.
 */
export interface ManifestOptionalTrace {
  iteration_history?: IterationStep[];
  human_edits?: HumanEdit[];
  /** Free-form: what this proof is being relied on for. */
  reliance_intent?: string;
  /**
   * Remix lineage: the parent manifest-hash hex values (64 chars, no `0x`) a
   * remix descends from. Order is SEMANTIC — `[base, style]` and `[style, base]`
   * are different artworks and MUST hash to different commitments. Optional, so
   * a normal (non-remix) creation omits it and hashes identically to a
   * pre-remix manifest.
   */
  parent_hashes?: string[];
}

export interface IterationStep {
  /** 1-indexed. */
  step: number;
  /** Prompt at this step. */
  prompt: string;
  /** Optional rationale. */
  note?: string;
}

export interface HumanEdit {
  /** ISO-8601 UTC of the edit. */
  at: string;
  /** Which manifest field was edited. */
  field: string;
  /** Value before. */
  before: string;
  /** Value after. */
  after: string;
  /** Wallet/identifier of the editor. */
  by: string;
}

export type Manifest = ManifestRequired & ManifestOptionalTrace;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

// ─── Canonicalization ────────────────────────────────────────────────────────

/**
 * Serialize a JSON-compatible value with sorted object keys and no whitespace.
 * Throws on non-finite numbers and skips `undefined` values inside objects.
 */
export function canonicalize(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalize: non-finite number not allowed (${value})`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = (value as Record<string, JsonValue>)[k];
      if (v === undefined) continue; // omit undefined — canonicalization rule 3
      parts.push(JSON.stringify(k) + ':' + canonicalize(v));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error(`canonicalize: unsupported value type (${typeof value})`);
}

/**
 * Build the canonical JSON string of a manifest, omitting any optional field
 * that is `undefined`. This exact string is what gets SHA-256'd.
 */
export function canonicalizeManifest(m: Manifest): string {
  const obj: Record<string, JsonValue> = {
    prompt: m.prompt,
    negative_prompt: m.negative_prompt,
    model_id: m.model_id,
    model_version: m.model_version,
    seed: m.seed,
    params: m.params,
    output_hash: m.output_hash,
    submitter_wallet: m.submitter_wallet,
    timestamp: m.timestamp,
  };
  if (m.iteration_history !== undefined) {
    obj.iteration_history = m.iteration_history as unknown as JsonValue;
  }
  if (m.human_edits !== undefined) {
    obj.human_edits = m.human_edits as unknown as JsonValue;
  }
  if (m.reliance_intent !== undefined) {
    obj.reliance_intent = m.reliance_intent;
  }
  if (m.parent_hashes !== undefined) {
    // Order preserved (canonicalization rule 6) — [base, style] is semantic.
    obj.parent_hashes = m.parent_hashes;
  }
  return canonicalize(obj);
}

/** SHA-256 hex digest of the canonical manifest. This is the on-chain commitment. */
export function hashManifest(m: Manifest): string {
  return createHash('sha256').update(canonicalizeManifest(m), 'utf8').digest('hex');
}
