#!/usr/bin/env bash
# Régénère la description Swagger et échoue si docs/ n'était pas à jour.
set -euo pipefail
cd "$(dirname "$0")/.."
go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g docs/handler.go -o docs --parseInternal --quiet
if ! git diff --quiet -- docs/docs.go docs/swagger.json docs/swagger.yaml; then
  echo "::error::La description Swagger n'est pas à jour : lancez bash scripts/check-swagger.sh et ajoutez docs/ au commit."
  git --no-pager diff --stat -- docs/
  exit 1
fi
