#!/usr/bin/env bash
#
# test.sh — run every *.test.js next to the file it tests.
#
# Colocated deliberately: these are unit tests of small modules, and the thing you
# want when you open presence-roster.js is presence-roster.test.js beside it, not a
# parallel tree to navigate. The proxy's njs suites live under tests/ because they
# need a bundler; these need nothing but node.
#
# build.sh does NOT run these — a build should not depend on a test pass, and the
# floor checks it does run are about whether the code can execute at all, which is
# a different question.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
failed=0

for f in "$DIR"/common/*.test.js "$DIR"/modern/*.test.js; do
  [ -f "$f" ] || continue
  echo
  echo "=== $(basename "$(dirname "$f")")/$(basename "$f") ==="
  node "$f" || failed=$((failed + 1))
done

echo
if [ "$failed" -gt 0 ]; then
  echo "$failed test file(s) FAILED"
  exit 1
fi
echo "all test files passed"
