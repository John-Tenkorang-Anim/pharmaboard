#!/usr/bin/env sh
# Enforces the dependency directions fixed by docs/architecture/module-
# boundaries.md and docs/technical-design.md section 8. A module may import
# another module's package only if it appears in that module's allowlist
# below; every other cross-module import is a boundary violation.
set -eu

module_prefix='github.com/John-Tenkorang-Anim/pharmaboard/internal/modules/'
failed=0

allowed_deps() {
  case "$1" in
    identity)  echo "" ;;
    notices)   echo "identity" ;;
    community) echo "identity" ;;
    sync)      echo "" ;;
    media)     echo "identity" ;;
    workspace) echo "identity" ;;
    messaging) echo "identity" ;;
    admin)     echo "identity notices community" ;;
    *)         echo "" ;;
  esac
}

for module_dir in internal/modules/*/; do
  module=$(basename "$module_dir")
  allowed=$(allowed_deps "$module")

  imported=$(grep -RIhoE "${module_prefix}[a-z]+" "$module_dir" --include='*.go' \
    | sed "s#${module_prefix}##" | sort -u || true)

  for dep in $imported; do
    if [ "$dep" = "$module" ]; then
      continue
    fi
    case " $allowed " in
      *" $dep "*) ;;
      *)
        echo "Boundary violation: module '$module' imports '$dep', which is not in its allowed dependency list ($allowed)."
        failed=1
        ;;
    esac
  done
done

if [ "$failed" -ne 0 ]; then
  exit 1
fi

echo "Module boundary check passed."
