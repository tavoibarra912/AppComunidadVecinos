#!/usr/bin/env bash
# Conserva las copias más recientes y retira las demás.
# Uso: prune-backups.sh <directorio> [conservar=2]
set -euo pipefail

dir=${1:?Uso: prune-backups.sh <directorio> [conservar]}
keep=${2:-2}

[[ "$keep" =~ ^[1-9][0-9]*$ ]] || {
  echo "Número de copias inválido: $keep" >&2
  exit 2
}
[[ -d "$dir" ]] || exit 0

shopt -s nullglob
files=("$dir"/comunidad-*.tar.gz)
(( ${#files[@]} <= keep )) && exit 0

mapfile -t ordered < <(ls -1t -- "${files[@]}")
for old in "${ordered[@]:keep}"; do
  rm -f -- "$old"
done
