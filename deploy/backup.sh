#!/usr/bin/env bash
# Ejecutar desde /home/quantum_system/comunidad. No contrata almacenamiento.
set -euo pipefail
umask 077
cd -- "$(dirname -- "$(realpath -- "$0")")/.."
test -f data/penarrubia.db
test -f .env
kind=${1:-daily}
case "$kind" in daily|weekly) ;; *) echo 'Uso: backup.sh [daily|weekly]' >&2; exit 2 ;; esac
directory="backups/$kind"
mkdir -p "$directory"

# Mismo cerrojo que update-vm.sh: no copiar mientras se está desplegando.
exec 9>.deploy.lock
flock -w 600 9 || {
  echo 'Hay un despliegue en curso; no se hace backup.' >&2
  exit 1
}

available_kb=$(df -Pk . | awk 'NR==2 {print $4}')
required_kb=$(du -sk data uploads | awk '{sum+=$1} END {print sum+262144}')
if (( available_kb < required_kb )); then
  echo 'Espacio insuficiente: no se amplía disco ni se borran backups.' >&2
  exit 1
fi

tmp=''
cleanup() {
  if [[ -n "$tmp" ]]; then rm -f -- "$tmp"; fi
  docker compose -f deploy/compose.yml --env-file .env --project-directory . start api
}
trap cleanup EXIT
docker compose -f deploy/compose.yml --env-file .env --project-directory . stop api

final="$directory/comunidad-$kind.tar.gz"
# Reemplazo atómico: una copia fallida nunca destruye la anterior.
tmp=$(mktemp "$directory/.comunidad.XXXXXX")
tar -czf "$tmp" data uploads .env deploy/compose.yml
# Un archivo truncado o corrupto no debe llegar nunca a la retención.
tar -tzf "$tmp" >/dev/null
mv -- "$tmp" "$final"
tmp=''
echo "Backup $kind verificado: $final. Copiar fuera de la VM para cubrir pérdida de disco."
