# ============================================================
# NagVis 3D – Docker Image
# Statisches Frontend: nginx serviert src/ direkt (keine Build-Step nötig)
# Three.js wird via Importmap aus CDN geladen
# ============================================================

FROM nginx:1.27-alpine

# Statische Dateien
COPY src/ /usr/share/nginx/html/

# nginx-Konfiguration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/index.html > /dev/null || exit 1
