# ============================================================
# NagVis 3D – Docker Image
# Statisches Frontend: nginx serviert src/ direkt (kein Build-Step nötig)
# Three.js wird via Importmap aus CDN geladen
# ============================================================

FROM nginx:1.27-alpine

ARG BUILD_DATE
ARG VERSION="0.1.0"
ARG VCS_REF

LABEL org.opencontainers.image.title="NagVis 3D" \
      org.opencontainers.image.description="NagVis 3D – Three.js-basierte 3D-Netzwerkkarte" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/ks84597/nagvis3d-up-side-down"

# Statische Dateien + nginx-Konfiguration
COPY src/ /usr/share/nginx/html/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Korrekte Berechtigungen für nginx-User
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/index.html > /dev/null || exit 1
