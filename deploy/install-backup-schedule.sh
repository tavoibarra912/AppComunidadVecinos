#!/usr/bin/env bash
# Activar durante la ventana de mantenimiento. No se ejecuta desde el deploy normal.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Ejecutar con sudo.' >&2; exit 1; }
root=/home/quantum_system/comunidad
cd "$root"
test -f deploy/backup.sh
test -f .env
test -f data/penarrubia.db
id quantum_system >/dev/null
units=(comunidad-backup@.service comunidad-backup-daily.timer comunidad-backup-weekly.timer)
for unit in "${units[@]}"; do test -f "deploy/systemd/$unit"; done
systemd-analyze verify "${units[@]/#/deploy/systemd/}"

# Guardar el cron anterior y retirar únicamente la programación antigua de esta app.
saved=$(mktemp)
filtered=$(mktemp)
trap 'rm -f -- "$saved" "$filtered"' EXIT
if ! LC_ALL=C crontab -u quantum_system -l > "$saved" 2> "$filtered"; then
  grep -q 'no crontab for' "$filtered" || { cat "$filtered" >&2; exit 1; }
  : > "$saved"
fi
install -d -o quantum_system -m 700 backups/schedules
install -o quantum_system -m 600 "$saved" "backups/schedules/crontab-before-$(date -u +%Y%m%dT%H%M%S).txt"
awk '!/^[[:space:]]*#/ && /deploy\/backup\.sh/ {next} {print}' "$saved" > "$filtered"
for unit in "${units[@]}"; do install -m 644 "deploy/systemd/$unit" "/etc/systemd/system/$unit"; done
systemctl daemon-reload
# Primero habilitar los timers: si esto falla, el cron anterior sigue instalado.
systemctl enable --now comunidad-backup-daily.timer comunidad-backup-weekly.timer
crontab -u quantum_system "$filtered"
systemctl list-timers comunidad-backup-daily.timer comunidad-backup-weekly.timer --no-pager
echo 'Horario Europe/Madrid. Persistent=true recupera ejecuciones omitidas; puede iniciar una copia al activar.'
