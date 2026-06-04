#!/bin/bash
# Set up the remaining acceptance-case PRs: tampered artifact, and a no-sidecar PR.
set -u
export PATH="/home/ryjin/.local/bin:/usr/local/bin:$PATH"
export GITLAWB_NODE=https://node.gitlawb.com
export HOME=/home/ryjin/mfp-verifier-home   # owner
WORK=/mnt/d/agentmanagerworks/mfp-verify-repo
cd "$WORK" || exit 12

echo "=== TAMPER branch (flip a byte of seal.txt, leave receipt) ==="
git checkout submit/seal-proof >/dev/null 2>&1
git checkout -qb submit/seal-tampered
printf 'X' >> seal.txt
git add seal.txt
git commit -qm "tampered: append a byte to seal.txt (receipt unchanged -> binding must fail)"
git push -u origin submit/seal-tampered 2>&1 | tail -3
gl pr create mfp-proof-verification --head submit/seal-tampered --base main \
  --title "Tampered seal.txt (artifact altered after receipt)" \
  --body "Artifact bytes changed; receipt unchanged. Verifier must flag CHANGES REQUESTED." 2>&1 | head -8

echo "=== NO-SIDECAR branch (plain change, no *.proof.json) ==="
git checkout main >/dev/null 2>&1
git checkout -qb submit/no-proof
printf 'a note with no proof receipt\n' > notes.txt
git add notes.txt
git commit -qm "no proof sidecar in this PR"
git push -u origin submit/no-proof 2>&1 | tail -3
gl pr create mfp-proof-verification --head submit/no-proof --base main \
  --title "Plain change, no proof receipt" \
  --body "PR does not claim proof. Verifier must skip silently (no review)." 2>&1 | head -8
