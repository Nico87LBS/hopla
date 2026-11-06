#!/usr/bin/env bash
# VERSION est X.Y.Z et monte à chaque PR qui change autre chose que de la documentation.
# Usage : bash scripts/check-version.sh <base>   (par exemple origin/main)
set -euo pipefail

base="${1:-origin/main}"
version=$(tr -d '[:space:]' < VERSION)
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "::error file=VERSION::VERSION doit être X.Y.Z, pas « $version »"; exit 1; }

previous=$(git show "$base:VERSION" 2>/dev/null | tr -d '[:space:]' || true)
[ -z "$previous" ] && exit 0

# Seule la documentation et la CI ne demandent pas de nouvelle version.
changed=$(git diff --name-only "$base"...HEAD | grep -vE '(\.md$|^\.github/|^docs/)' || true)
[ -z "$changed" ] && exit 0

highest=$(printf '%s\n%s\n' "$previous" "$version" | sort -V | tail -1)
if [ "$version" = "$previous" ] || [ "$highest" != "$version" ]; then
  echo "::error file=VERSION::VERSION est $version, elle doit dépasser $previous (1.2.3 → 1.2.4 pour une correction, 1.3.0 pour une nouveauté)."
  exit 1
fi
