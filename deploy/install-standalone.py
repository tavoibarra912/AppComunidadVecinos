"""Activa el virtual host gratuito sobre el gateway/IP/certbot existentes."""
from pathlib import Path
import shutil
import subprocess
import time

runtime = Path("/home/quantum_system/comunidad")
tls = Path("/home/quantum_system/opengym/deployment/tls")
certificate = tls.parent.parent / "letsencrypt/live/comunidad-vecinos/fullchain.pem"
if subprocess.run(["sudo", "test", "-f", str(certificate)]).returncode:
    raise RuntimeError("Falta el certificado HTTPS: no se cambia el gateway.")
config = tls / "nginx.conf"
original = config.read_text()
include = "  include /etc/nginx/mygym/additional-servers/*.conf;\n"
updated = original.replace("    listen 80;", "    listen 80 default_server;").replace(
    "    listen 8443 ssl;", "    listen 8443 ssl default_server;"
)
if include not in original:
    marker = "  resolver 127.0.0.11 valid=10s ipv6=off;\n"
    if original.count(marker) != 1:
        raise RuntimeError("Configuración inesperada: no se cambia el gateway.")
    updated = updated.replace(marker, marker + include)
snippets = tls / "additional-servers"
snippets.mkdir(exist_ok=True)
route = snippets / "comunidad.conf"
if route.exists():
    raise RuntimeError("El virtual host ya existe: revisar antes de reemplazarlo.")
backups = runtime / "backups"
backups.mkdir(mode=0o700, exist_ok=True)
shutil.copy2(config, backups / ("nginx-before-standalone-" + str(time.time_ns()) + ".conf"))
route.write_text((runtime / "deploy/nginx-standalone.conf").read_text())
command = ["docker", "exec", "opengym-gateway-1", "nginx"]
try:
    config.write_text(updated)
    subprocess.run(command + ["-t", "-c", "/etc/nginx/mygym/nginx.conf"], check=True)
    subprocess.run(command + ["-s", "reload", "-c", "/etc/nginx/mygym/nginx.conf"], check=True)
except BaseException:
    config.write_text(original)
    route.unlink()
    raise
print("Virtual host HTTPS activado sin nuevos recursos cloud.")
