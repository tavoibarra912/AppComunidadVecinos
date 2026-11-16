"""Instala la ruta en el gateway existente con backup y validación antes de recargar."""
from pathlib import Path
import shutil
import subprocess
import time

runtime = Path("/home/quantum_system/comunidad")
tls = Path("/home/quantum_system/opengym/deployment/tls")
config = tls / "nginx.conf"
include = "    include /etc/nginx/mygym/additional-https/*.conf;\n"
original = config.read_text()
updated = original
if include not in original:
    marker = "    client_max_body_size 112m;\n"
    if original.count(marker) != 1:
        raise RuntimeError("Configuración inesperada: no se cambia el gateway.")
    updated = original.replace(marker, marker + include)
snippets = tls / "additional-https"
snippets.mkdir(exist_ok=True)
route = snippets / "comunidad.conf"
if route.exists():
    raise RuntimeError("La ruta ya existe: revisar antes de reemplazarla.")
backups = runtime / "backups"
backups.mkdir(mode=0o700, exist_ok=True)
shutil.copy2(config, backups / ("nginx-before-" + str(time.time_ns()) + ".conf"))
route.write_text((runtime / "deploy/nginx-location.conf").read_text())
command = ["docker", "exec", "opengym-gateway-1", "nginx"]
try:
    config.write_text(updated)
    subprocess.run(command + ["-t", "-c", "/etc/nginx/mygym/nginx.conf"], check=True)
    subprocess.run(command + ["-s", "reload", "-c", "/etc/nginx/mygym/nginx.conf"], check=True)
except BaseException:
    config.write_text(original)
    route.unlink()
    raise
print("Ruta HTTPS instalada; el gateway ha validado la configuración.")
