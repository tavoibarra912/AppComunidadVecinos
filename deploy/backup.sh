#!/usr/bin/env bash
# Ejecutar desde /home/quantum_system/comunidad. No contrata almacenamiento.
set -euo pipefail
umask 077
cd -- "$(dirname -- "$(realpath -- "$0")")/.."
test -f data/penarrubia.db
test -f .env
mkdir -p backups
available_kb=$(df -Pk . | awk 'NR==2 {print $4}')
required_kb=$(du -sk data uploads | awk '{sum+=$1} END {print sum+262144}')
if (( available_kb < required_kb )); then
  echo 'Espacio insuficiente: no se amplía disco ni se borran backups.' >&2
  exit 1
fi
docker compose -f deploy/compose.yml --env-file .env --project-directory . stop api
trap 'docker compose -f deploy/compose.yml --env-file .env --project-directory . start api' EXIT
tar -czf "backups/comunidad-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" data uploads .env
echo 'Backup privado completo. Copiar fuera de la VM para cubrir pérdida de disco.'
