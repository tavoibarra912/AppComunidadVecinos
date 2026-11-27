#!/usr/bin/env bash
# Ejecutado desde releases/<SHA>, con la imagen ya cargada por el runner.
# Los datos y el .env permanecen en la raíz.
set -euo pipefail
umask 077

release_sha=${1:?Falta el SHA del commit}
[[ "$release_sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'SHA inválido' >&2; exit 1; }
app_root=$(realpath "${2:-/home/quantum_system/comunidad}")
source_root=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
[[ "$source_root" == "$app_root/releases/$release_sha" ]] || { echo 'La versión debe estar en releases/<SHA>' >&2; exit 1; }
cd "$app_root"
exec 9>.deploy.lock
flock -n 9 || { echo 'Ya hay otro despliegue en curso' >&2; exit 1; }
test -f .env
test -f data/penarrubia.db
test -d uploads
test -f deploy/compose.yml
docker compose version >/dev/null
docker network inspect opengym_default >/dev/null
compose=(docker compose --project-directory "$app_root" --env-file "$app_root/.env" -f "$app_root/deploy/compose.yml")
"${compose[@]}" config --quiet
mkdir -p backups/deploys
available_kb=$(df -Pk . | awk 'NR==2 {print $4}')
required_kb=$(du -sk data uploads | awk '{sum+=$1} END {print sum+1048576}')
(( available_kb >= required_kb )) || { echo 'Espacio insuficiente para imagen y backup; no se borra nada.' >&2; exit 1; }

image="comunidad:$release_sha"
# Solo aceptar la imagen del commit, sin construir en la VM de producción.
revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[[ "$revision" == "$release_sha" ]] || { echo 'La imagen cargada no corresponde al commit' >&2; exit 1; }
backup_dir="$app_root/backups/deploys"
backup="$backup_dir/comunidad-$(date -u +%Y%m%dT%H%M%S)-$release_sha.tar.gz"
backup_tmp=$(mktemp "$backup_dir/.comunidad.XXXXXX")
env_tmp=''
launch_started=false
cleanup() {
  status=$?
  if [[ -n "$backup_tmp" ]]; then rm -f -- "$backup_tmp"; fi
  if [[ -n "$env_tmp" ]]; then rm -f -- "$env_tmp"; fi
  if (( status != 0 )) && [[ "$launch_started" == false ]]; then "${compose[@]}" start api; fi
}
trap cleanup EXIT
"${compose[@]}" stop api
# La API permanece detenida entre el backup y el cambio de versión.
tar -czf "$backup_tmp" data uploads .env deploy/compose.yml
tar -tzf "$backup_tmp" >/dev/null
mv -- "$backup_tmp" "$backup"
backup_tmp=''

env_tmp=$(mktemp "$app_root/.env.release.XXXXXX")
awk -v image="$image" '
  /^COMUNIDAD_IMAGE=/ { if (!seen++) print "COMUNIDAD_IMAGE=" image; next }
  { print }
  END { if (!seen) print "COMUNIDAD_IMAGE=" image }
' .env > "$env_tmp"
mv "$env_tmp" .env
env_tmp=''
cp "$source_root/deploy/compose.yml" deploy/compose.yml
install -m 700 "$source_root/deploy/backup.sh" deploy/backup.sh
install -m 700 "$source_root/deploy/prune-backups.sh" deploy/prune-backups.sh
install -m 644 "$source_root/deploy/backup.cron" deploy/backup.cron
install -m 700 "$source_root/deploy/install-backup-schedule.sh" deploy/install-backup-schedule.sh
mkdir -p deploy/systemd
install -m 644 "$source_root"/deploy/systemd/* deploy/systemd/
launch_started=true
"${compose[@]}" up -d --no-deps --pull never api

for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T api node -e '
    fetch("http://127.0.0.1:3000/api/health", {signal: AbortSignal.timeout(3000)}).then(async r => {
      const d = await r.json();
      if (!r.ok || d.status !== "ok" || d.app !== "app-comunidad-vecinos" || d.release !== process.argv[1]) process.exit(1);
    }).catch(() => process.exit(1));
  ' "$release_sha" 2>/dev/null; then
    if ! bash "$source_root/deploy/prune-backups.sh" "$backup_dir" 2; then
      echo 'Aviso: no se pudieron retirar copias antiguas.' >&2
    fi
    printf '%s\n' "$release_sha" > .deployed-release
    echo "Versión $release_sha saludable. Backup privado: $backup"
    exit 0
  fi
  sleep 2
done
echo "ERROR: la versión no pasó salud. Se conserva el backup $backup y las imágenes anteriores. Revisar migraciones antes de restaurar." >&2
exit 1
