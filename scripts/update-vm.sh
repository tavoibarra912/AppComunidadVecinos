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
mkdir -p backups
available_kb=$(df -Pk . | awk 'NR==2 {print $4}')
required_kb=$(du -sk data uploads | awk '{sum+=$1} END {print sum+1048576}')
(( available_kb >= required_kb )) || { echo 'Espacio insuficiente para imagen y backup; no se borra nada.' >&2; exit 1; }

image="comunidad:$release_sha"
# Solo aceptar la imagen del commit, sin construir en la VM de producción.
revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[[ "$revision" == "$release_sha" ]] || { echo 'La imagen cargada no corresponde al commit' >&2; exit 1; }
backup="$app_root/backups/comunidad-$(date -u +%Y%m%dT%H%M%S)-$release_sha.tar.gz"
"${compose[@]}" stop api
# Si falla la copia, volver a arrancar con la configuración anterior.
trap '"${compose[@]}" start api' EXIT
tar -czf "$backup" data uploads .env deploy/compose.yml
"${compose[@]}" start api
trap - EXIT

env_tmp=$(mktemp "$app_root/.env.release.XXXXXX")
trap 'rm -f "$env_tmp"' EXIT
awk -v image="$image" '
  /^COMUNIDAD_IMAGE=/ { if (!seen++) print "COMUNIDAD_IMAGE=" image; next }
  { print }
  END { if (!seen) print "COMUNIDAD_IMAGE=" image }
' .env > "$env_tmp"
mv "$env_tmp" .env
cp "$source_root/deploy/compose.yml" deploy/compose.yml
"${compose[@]}" up -d --no-deps --pull never api

for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T api node -e '
    fetch("http://127.0.0.1:3000/api/health", {signal: AbortSignal.timeout(3000)}).then(async r => {
      const d = await r.json();
      if (!r.ok || d.status !== "ok" || d.app !== "app-comunidad-vecinos" || d.release !== process.argv[1]) process.exit(1);
    }).catch(() => process.exit(1));
  ' "$release_sha" 2>/dev/null; then
    printf '%s\n' "$release_sha" > .deployed-release
    echo "Versión $release_sha saludable. Backup privado: $backup"
    exit 0
  fi
  sleep 2
done
echo "ERROR: la versión no pasó salud. Se conserva el backup $backup y las imágenes anteriores. Revisar migraciones antes de restaurar." >&2
exit 1
