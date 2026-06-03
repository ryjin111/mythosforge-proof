# Integrating verifiable agent receipts with GitLawb

**Status:** draft spec (Builder: kuro · Reviewer: gojo). Grounded in GitLawb's public docs
(`gitlawb.com/start`, `gitlawb.com/architecture`) as of 2026-06-03.

This describes how two already-shipped pieces —

- **[`@mythosforge/proof`](https://www.npmjs.com/package/@mythosforge/proof)** — Proof-of-Creation
  receipts for an agent's *artifacts* (hash → anchor on Base → verify offline), and
- **whispr** — local secret/PII scrubbing for an agent's *output*, with a signed *privacy* receipt

— compose with **GitLawb** (decentralized git for AI agents) into one story: a **verified agent PR**,
where a pull request carries cryptographic proof that *no secrets leaked* and that *attached artifacts
are provenanced*.

---

## Why GitLawb specifically (the lead)

GitLawb's trust layer is **already built on Verifiable Credentials.** Per their architecture docs,
"Trust Scores" are **VCs anchored on Arweave, queryable for auto-merge thresholds and CI runner
selection." That means our receipts aren't trying to bolt a foreign artifact onto GitLawb — they aim
at GitLawb's **native trust machinery**. A "this agent leaked no secrets" credential and a "this
artifact is provenanced" credential are exactly the kind of signal their Trust Score system consumes.

This also validates a design choice made earlier: whispr's Phase-1 receipts were made **VC-aligned
specifically for interop**. GitLawb is the payoff case.

> ⚠️ **Conformance caveat — read before Phase B.** "VC-aligned" is **not** "VC-conformant." Our
> receipts sign **Ed25519 over JCS-canonical bytes (`Ed25519Jcs2026`)** with a **placeholder
> `@context`** — deliberately *not* a registered W3C Data-Integrity proof suite (we labeled this
> honestly in the whispr README). GitLawb's verifier will accept a VC in *its* expected proof
> suite + context, which may not be ours. So "plugs into their trust system" is the **goal**, not a
> given — Phase B's first step is to **prove our receipt validates against GitLawb's actual verifier**.

---

## GitLawb integration surface (grounded)

| Capability | What the docs say | Why it matters here |
|---|---|---|
| Standard git | `git-remote-gitlawb` transport; clone `gitlawb://$DID/repo`; `gl pr create/review/merge` | **Normal git `pre-commit`/`pre-push` hooks run** → Phase A needs zero GitLawb cooperation |
| Identity | DIDs (`did:key`/`did:web`/`did:gitlawb`), Ed25519, UCAN; every push signed (RFC 9421 HTTP sigs) | A real, signed **"who"** for receipts — resolves the proof-toolkit's "wallet is declared, not signed" gap |
| PRs / issues | Signed JSON git objects under `refs/gitlawb/prs/` etc. | Receipts (or their proof URLs) can ride **in** the PR object |
| Trust Scores | **VCs issued by the gitlawb network, anchored on Arweave**, queryable for auto-merge thresholds / CI runner selection | The native home for our privacy + creation credentials |
| Events (TBC) | GraphQL subscriptions for events; webhook-style subscriptions *if exposed* (confirm against their MCP tool list) | Event-driven verification on PR open/update — availability is an open question below |
| Agent surface | **MCP server** (Claude Code) + `gl` CLI + SDKs (TS/Python/Rust) | Where an integration tool would live alongside theirs |

---

## The composition: a "verified agent PR"

```
GitLawb PR
├── code diff + history            ← GitLawb (the workflow layer)
├── privacy receipt (VC)           ← whispr: "no secrets in this push"
└── creation receipt(s) (VC)       ← @mythosforge/proof: "attached artifacts are provenanced"
```

GitLawb proves the *workflow*; whispr proves *safety*; mythosforge-proof proves *artifact provenance*.
All three are signed receipts — ideally one shared (VC) shape.

---

## Phase A — buildable now, zero GitLawb dependency

Because GitLawb speaks standard git, this needs nothing from them.

1. **whispr pre-push guard** (a standard git `pre-push`/`pre-commit` hook):
   scan the diff → block or redact detected secrets → emit a **signed privacy receipt**. The push only
   proceeds clean. Works identically against GitLawb *and* plain GitHub — "works with GitLawb" is a free
   headline, not a blocker.
2. **`proof attest <artifact>`** (a `@mythosforge/proof` CLI / GitHub Action):
   hash the artifact → optionally anchor on Base → emit a **creation receipt**; commit the receipt (or
   its proof URL) alongside the artifact so it rides with the PR.

**Deliverable / demo:** open a PR through `gl` where the diff carries a whispr privacy receipt and an
attached asset carries a mythosforge-proof receipt — both independently verifiable offline. No GitLawb
code changes required.

---

## Phase B — native trust integration (has a prerequisite)

**Step 0 (PREREQUISITE — do this first, do not skip):**
Confirm exactly **which VC proof suite + `@context` GitLawb's verifier accepts**, then test whether our
`Ed25519Jcs2026` + placeholder-context receipt **passes that verifier**.
- If it passes → proceed.
- If not → **close the gap**: either adopt the proof suite/context GitLawb expects, or add a
  conformant proof format alongside ours. Treat full W3C Data-Integrity conformance as the bar here
  (resolvable `@context` + registered suite), which is already on whispr's roadmap.

Only after Step 0:

1. **Register receipts as Trust-Score inputs** — publish the privacy + creation VCs so GitLawb's
   Arweave-anchored Trust Score can query them ("agent X: 0 secret leaks across N pushes; artifacts
   provenanced") and feed auto-merge / CI-runner decisions.
2. **Event verifier** — *if GitLawb exposes webhook/event subscriptions* (TBC, see open questions),
   subscribe to PR open/update, verify the attached receipts, and post a pass/fail check.
3. **MCP tool** — expose `whispr.scan` / `proof.attest` / `proof.verify` alongside GitLawb's MCP
   toolset so an agent can produce + verify receipts inline in its workflow.

**Identity:** use the agent's **GitLawb DID** (Ed25519, RFC 9421) as the receipt signer / `issuer`,
rather than a self-declared wallet. This makes "who produced this" cryptographically real, not claimed.

---

## Honesty guardrails (must survive into any pitch)

- **VC-aligned ≠ VC-conformant** until Phase B Step 0 passes. Don't claim "plugs into GitLawb's trust"
  before the verifier actually accepts our receipt.
- **Proof of Creation = provenance, not originality.** It proves an artifact existed at time T, hash-
  anchored, by this agent — *not* that it is original or IP-clean (v1 lineage is declared-only).
- **Privacy receipt = "scanned + redacted," not "data is 100% safe."** It proves the check ran and
  what it caught — integrity + origin — not completeness.

---

## Open questions for GitLawb (gates Phase B)

1. Which VC proof suite(s) + `@context` does the Trust Score verifier accept? Is there a published
   schema for Trust-Score credentials?
2. Can a third-party VC (not GitLawb-issued) contribute to an agent's Trust Score, and how is it
   submitted (Arweave anchor + reference? an MCP/API call?)?
3. Are there server-side push hooks, or is pre-push enforcement strictly client-side (affects whether
   the whispr gate can be *required* vs. *advisory*)?
4. What event surface is available for PR open/update — GraphQL subscriptions only, or webhook-style
   subscriptions an external verifier can register? (Determines how the Phase B event verifier hooks in.)
