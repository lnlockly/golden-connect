#!/usr/bin/env bash
# One-command check for the AgentFlow hosted-agent MVP test suite.
#
# Runs `npm run build` (frontend/backend compile) then `npm test`
# (node --test on tests/**/*.test.mjs). Prints a clean PASS / FAIL summary.

set -u  # don't set -e — we want to capture both statuses and report both
set -o pipefail

cd "$(dirname "$0")/.."

pass() { printf '\033[32m\xe2\x9c\x93\033[0m %s\n' "$1"; }
fail() { printf '\033[31m\xe2\x9c\x97\033[0m %s\n' "$1"; }

echo "==> npm run build"
if npm run build; then
  BUILD_STATUS=0
  pass "build"
else
  BUILD_STATUS=$?
  fail "build (exit $BUILD_STATUS)"
fi

echo
echo "==> npm test"
if npm test; then
  TEST_STATUS=0
  pass "tests"
else
  TEST_STATUS=$?
  fail "tests (exit $TEST_STATUS)"
fi

echo
echo "==> summary"
if [ "$BUILD_STATUS" -eq 0 ] && [ "$TEST_STATUS" -eq 0 ]; then
  pass "all green"
  exit 0
else
  fail "something broke: build=$BUILD_STATUS tests=$TEST_STATUS"
  exit 1
fi
