#!/usr/bin/env bash
# L'interface web ne parle jamais de Home Assistant : ni textes, ni traductions.
set -euo pipefail

hits=$(grep -rniE "home[ -]?assistant|hass\b" web/src web/public/locales web/index.html 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' || true)
if [ -n "$hits" ]; then
  echo "$hits"
  echo "::error::L'interface web ne doit pas mentionner Home Assistant (voir ci-dessus)."
  exit 1
fi
