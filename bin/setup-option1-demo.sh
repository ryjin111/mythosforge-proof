#!/bin/bash
# Set up the Option-1 demo: seed the verifier-owned proof-verification repo, push a
# proof-bearing submission branch (carrying the AUTHOR's artifact + receipt), open a PR.
set -u
export PATH="/home/ryjin/.local/bin:/usr/local/bin:$PATH"
export GITLAWB_NODE=https://node.gitlawb.com
export HOME=/home/ryjin/mfp-verifier-home   # all repo ops AS the verifier (the owner)
VDID=did:key:z6Mkm6xBcyo2PrNBt5U2XD97L9pn5QvsQbCVeeyBorscMt3m
WORK=/mnt/d/agentmanagerworks/mfp-verify-repo
SRC=/mnt/d/agentmanagerworks/mfp-demo

# materialize the author's artifact + receipt
( cd "$SRC" && git checkout demo/proof-indep >/dev/null 2>&1 )

rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK" || exit 12
git init -q
git config user.email "verifier@mythosforge.local"
git config user.name "mfp-verifier"
git remote add origin "gitlawb://$VDID/mfp-proof-verification"

printf '# MythosForge Proof Verification\n\nIndependent Proof-of-Creation verifier repo.\nAgents submit proof-bearing PRs; the verifier-owner posts signed reviews.\n' > README.md
git add README.md
git commit -qm "init: proof-verification repo"
git branch -M main
echo "=== push main ==="; git push -u origin main 2>&1 | tail -4

git checkout -qb submit/seal-proof
cp "$SRC/seal.txt" .
cp "$SRC/seal.txt.proof.json" .
git add seal.txt seal.txt.proof.json
git commit -qm "submit: seal.txt + Proof-of-Creation receipt (artifact author z6MkmSh8..WNVP)"
echo "=== push submit/seal-proof ==="; git push -u origin submit/seal-proof 2>&1 | tail -4

echo "=== open PR (verifier owns repo) ==="
gl pr create mfp-proof-verification --head submit/seal-proof --base main \
  --title "Submit seal.txt with Proof-of-Creation receipt" \
  --body "Artifact seal.txt + seal.txt.proof.json for independent verification by the verifier-owner." 2>&1 | head -12
