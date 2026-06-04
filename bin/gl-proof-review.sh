#!/bin/bash
# MythosForge Proof Verifier — INDEPENDENT gitlawb reviewer (Phase B, Option-1 topology).
#
# TOPOLOGY (works on gl 0.3.8 today; UCAN-delegated cross-owner review is blocked —
# `gl pr review` has no surface to present a delegation token, logged as future work):
#   The VERIFIER owns a proof-verification repo. Agents submit proof-bearing artifacts
#   (artifact + `*.proof.json` receipt) as PRs into it. The verifier-owner runs this
#   script: it verifies every receipt (commitment re-hash + artifact-byte binding) with
#   the live @mythosforge/proof CLI, binds the verdict to gitlawb's signed ref-update
#   cert for the PR head, and posts a real signed `gl pr review` (approved /
#   changes_requested). The reviewer DID is the verifier; the ARTIFACT-AUTHOR DID comes
#   from each receipt's `submitter_wallet` — so reviewer ≠ artifact author by construction.
#
# It does NOT touch gitlawb's internal trust-score math (no external hook exists) — it
# feeds it the legitimate way, via signed agent reviews. It posts a review; it does not
# by itself enforce a merge gate unless gitlawb branch-protection requires it.
#
# Usage: gl-proof-review.sh <PR_NUMBER> <HEAD_BRANCH> [CLONE_DIR] [VERIFIER_HOME]
#   Run AS the verifier (repo owner). Repo is auto-derived from the clone's origin.
set -u
export PATH="/home/ryjin/.local/bin:/usr/local/bin:$PATH"
# NOTE: gl 0.3.8 has a URL bug when --node is passed explicitly; rely on env only.
export GITLAWB_NODE=https://node.gitlawb.com

PR="${1:?pr number}"; HEAD_BRANCH="${2:?head branch}"
CLONE_DIR="${3:-/mnt/d/agentmanagerworks/mfp-verify-repo}"
VERIFIER_HOME="${4:-/home/ryjin/mfp-verifier-home}"
NODE="/mnt/c/Program Files/nodejs/node.exe"
PROOF_WIN=$(wslpath -w /mnt/d/agentmanagerworks/mythosforge-proof/bin/proof.mjs)

# Every gl call runs as the verifier identity (it owns the repo and posts the review).
glv() { HOME="$VERIFIER_HOME" gl "$@"; }
VERIFIER_DID=$(glv identity show 2>/dev/null)

cd "$CLONE_DIR" || { echo "no clone dir $CLONE_DIR"; exit 12; }

# Derive owner-qualified repo (owner == verifier) from the gitlawb:// origin.
# cert list needs <ownerDID>/<repo>; pr view/review use the BARE name (caller==owner,
# the only working form — gl 0.3.8 returns an empty body for the owner-qualified form).
ORIGIN=$(git remote get-url origin 2>/dev/null)        # gitlawb://did:key:XXX/<repo>
OWNER_DID=$(echo "$ORIGIN" | sed -E 's#^gitlawb://([^/]+)/.*#\1#')
REPO_NAME=$(echo "$ORIGIN" | sed -E 's#.*/##')
REPO_Q="${OWNER_DID}/${REPO_NAME}"
[ -n "$OWNER_DID" ] && [ -n "$REPO_NAME" ] || { echo "could not derive repo from origin '$ORIGIN'"; exit 13; }

HOME="$VERIFIER_HOME" git fetch origin "$HEAD_BRANCH" >/dev/null 2>&1
git checkout "$HEAD_BRANCH" >/dev/null 2>&1
git reset --hard "origin/$HEAD_BRANCH" >/dev/null 2>&1 || git reset --hard "$HEAD_BRANCH" >/dev/null 2>&1
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)
echo "### MythosForge Proof Verifier — reviewing ${REPO_NAME} PR #$PR ($HEAD_BRANCH @ ${HEAD_SHA:0:12}) as verifier $VERIFIER_DID"

# Cert-binding: gitlawb's signed ref-update cert for this head ref (newest first).
# `gl cert list` parses fine even while detail endpoints are degraded; cols = id ts ref commit.
CERT_LINE=$(glv cert list "$REPO_Q" 2>/dev/null | grep -F "refs/heads/${HEAD_BRANCH} " | head -1)
CERT_ID=$(echo "$CERT_LINE"   | awk '{print $1}')
CERT_TS=$(echo "$CERT_LINE"   | awk '{print $2}')
CERT_COMMIT=$(echo "$CERT_LINE" | awk '{print $4}')
if [ -n "$CERT_ID" ]; then
  CERT_DESC="cert ${CERT_ID} (ref refs/heads/${HEAD_BRANCH} @ ${CERT_COMMIT}, signed-push ${CERT_TS})"
  CERT_BIND_OK=1
else
  CERT_DESC="no signed ref-update cert found for refs/heads/${HEAD_BRANCH}"
  CERT_BIND_OK=0   # fail-closed: cannot bind to a signed push → must not approve
fi

# Idempotency key — repo#PR#headRef#verifierDID — embedded as a compact JSON block so
# later runs detect it without scanning comments. Best-effort dedup via pr view (read
# path is degraded on this node, so this won't always match — re-post is still keyed).
IDEMPOTENCY="mfp-verify:${REPO_NAME}#${PR}@${HEAD_SHA}#${VERIFIER_DID}"
EXISTING=$(glv pr view "$REPO_NAME" "$PR" 2>/dev/null)
if echo "$EXISTING" | grep -qF "$IDEMPOTENCY"; then
  echo "ALREADY_REVIEWED $IDEMPOTENCY — skipping duplicate."
  exit 0
fi

receipts=$(git ls-files '*.proof.json')

# No-sidecar PR → skip silently. A PR that does not claim proof gets no verdict from us.
if [ -z "$receipts" ]; then
  echo "NO_SIDECAR — PR carries no *.proof.json; skipping silently (no review posted)."
  exit 0
fi

ALL_OK=1
DETAIL=""
AUTHORS=""
for r in $receipts; do
  artifact=$(basename "$r" .proof.json)
  rwin=$(wslpath -w "$CLONE_DIR/$r")
  awin=$(wslpath -w "$CLONE_DIR/$artifact")
  ohash=$(grep -oE '"output_hash": *"[0-9a-f]{64}"' "$r" | grep -oE '[0-9a-f]{64}' | head -1)
  # artifact author per the receipt (independent of the reviewer)
  author=$(grep -oE '"submitter_wallet": *"[^"]+"' "$r" | sed -E 's/.*"submitter_wallet": *"([^"]+)".*/\1/' | head -1)
  AUTHORS="${AUTHORS}${author} "
  if [ ! -f "$artifact" ]; then
    ALL_OK=0
    DETAIL="${DETAIL}- ❌ ${r}: artifact '${artifact}' missing/unreadable in PR"$'\n'
    continue
  fi
  if [ "$author" = "$VERIFIER_DID" ]; then
    ALL_OK=0
    DETAIL="${DETAIL}- ❌ ${artifact}: receipt author == verifier DID (self-attestation, not independent)"$'\n'
    continue
  fi
  # node.exe stdout EISDIRs when piped from WSL → route to a file (fail-closed on any error)
  "$NODE" "$PROOF_WIN" verify "$rwin" --artifact "$awin" > "$CLONE_DIR/.verify.out" 2>&1
  out=$(cat "$CLONE_DIR/.verify.out")
  if echo "$out" | grep -q "✅ VERIFIED"; then
    DETAIL="${DETAIL}- ✅ ${artifact}: commitment VALID + artifact binding MATCHES (output_hash ${ohash:0:16}…, author ${author})"$'\n'
  else
    ALL_OK=0
    DETAIL="${DETAIL}- ❌ ${artifact}: verification FAILED (commitment or artifact-byte mismatch)"$'\n'
  fi
done

# fail-closed: a proof-bearing PR that cannot be bound to gitlawb's signed push cert
# (cert lookup empty/errored) must NOT be approved — frozen-spec rule.
if [ "${CERT_BIND_OK:-0}" -eq 0 ]; then
  ALL_OK=0
  DETAIL="${DETAIL}- ❌ cannot bind verdict to a gitlawb signed ref-update cert for refs/heads/${HEAD_BRANCH} — not approving (fail-closed)"$'\n'
fi

if [ $ALL_OK -eq 1 ]; then STATUS="approved"; VERDICT_HEAD="🛡️✅ MythosForge Proof Verifier — APPROVED";
else STATUS="changes_requested"; VERDICT_HEAD="🛡️❌ MythosForge Proof Verifier — CHANGES REQUESTED"; fi

# sign the verdict (incl. head SHA + cert id) with the INDEPENDENT verifier key
SUMMARY="${IDEMPOTENCY}|cert=${CERT_ID:-none}|$([ $ALL_OK -eq 1 ] && echo PASS || echo FAIL)"
SIG=$(glv identity sign "$SUMMARY" 2>/dev/null | tr -d '\n')

# Compact machine-readable verdict block (the canonical idempotency record).
ARTIFACT_AUTHORS=$(echo "$AUTHORS" | tr ' ' '\n' | grep -v '^$' | sort -u | paste -sd, -)
VERDICT_JSON="{\"key\":\"${IDEMPOTENCY}\",\"repo\":\"${REPO_Q}\",\"pr\":${PR},\"headRef\":\"${HEAD_SHA}\",\"reviewerDID\":\"${VERIFIER_DID}\",\"artifactAuthors\":\"${ARTIFACT_AUTHORS}\",\"cert\":\"${CERT_ID:-none}\",\"status\":\"${STATUS}\"}"

BODY="${VERDICT_HEAD}

Independent verifier checked every artifact in this PR against its Proof-of-Creation receipt (commitment re-hash + artifact-byte binding) using @mythosforge/proof, then bound the verdict to gitlawb's signed push certificate.

${DETAIL}
Repo/PR:        ${REPO_Q}#${PR}
Head ref:       ${HEAD_SHA}
Cert-binding:   ${CERT_DESC}
Reviewer DID:   ${VERIFIER_DID}   (independent verifier — repo owner)
Artifact author(s): ${ARTIFACT_AUTHORS}   (from receipt; ≠ reviewer)
Signed verdict: ${SUMMARY}
Signature:      ${SIG}   (ed25519, base64url)

Verdict (machine-readable):
${VERDICT_JSON}

Reproduce: \`node proof.mjs verify <file>.proof.json --artifact <file>\`."

echo "----- review body -----"; echo "$BODY"
echo "----- posting gl pr review (status=$STATUS, as verifier $VERIFIER_DID) -----"
glv pr review "$REPO_NAME" "$PR" --status "$STATUS" --body "$BODY" 2>&1
echo "REVIEW_POSTED status=$STATUS reviewer=$VERIFIER_DID author(s)=$ARTIFACT_AUTHORS cert=${CERT_ID:-none}"
