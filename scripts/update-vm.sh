#!/usr/bin/env bash
# Actualiza el contenedor del backend en la VM de producción.
# Se ejecuta desde /home/<user>/comunidad después del git pull.
# Prefiere docker compose si existe; si no, recrea el contenedor 'comunidad-app'
# conservando los volúmenes de datos (data/ y uploads/ viven fuera de la imagen).
set -euo pipefail

cd "$(dirname "$0")/.."

# 1) Reconstruir la imagen con el código actual (Node 24, sin dev deps)
if command -v docker >/dev/null 2>&1; then
  RUNTIME=docker
elif command -v podman >/dev/null 2>&1; then
  RUNTIME=podman
else
  echo "No se encontró docker ni podman en la VM" >&2
  exit 1
fi
echo "Runtime: ${RUNTIME}"

if [ -f docker-compose.yml ] || [ -f compose.yaml ] || [ -f compose.yml ]; then
  echo "Usando docker compose"
  ${RUNTIME} compose up -d --build
  exit 0
fi

# 2) Fallback: build + recrear el contenedor por nombre
${RUNTIME} build -t comunidad-app .

CONTAINER="comunidad-app"
if ${RUNTIME} ps -q --filter "name=${CONTAINER}" | grep -q .; then
  ${RUNTIME} stop "${CONTAINER}" || true
  ${RUNTIME} rm "${CONTAINER}" || true
fi

# Determinar la red del contenedor anterior si la hubiera (conserva el proxy).
NETWORK=""
if [ -d "/home/${SUDO_USER:-$(whoami)}/comunidad" ] && [ -f .deploy-networks ]; then
  NETWORK=$(cat .deploy-networks)
fi

${RUNTIME} run -d --name "${CONTAINER}" --restart unless-stopped \
  ${NETWORK:+--network "${NETWORK}"} \
  -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=3000 \
  -e APP_DATA_DIR=/app/data -e APP_UPLOADS_DIR=/app/uploads \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/uploads:/app/uploads" \
  comunidad-app

echo "Backend actualizado y en ejecución."