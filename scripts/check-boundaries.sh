#!/usr/bin/env sh
set -eu

violations=$(rg -n 'github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/' \
  internal/modules -g '*.go' || true)

if [ -n "$violations" ]; then
  echo "Direct module-to-module imports are not allowed:"
  echo "$violations"
  exit 1
fi

echo "Module boundary check passed."
