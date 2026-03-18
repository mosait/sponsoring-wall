#!/bin/sh
set -e

# Nginx-Config aus Template frisch kopieren (idempotent bei Neustarts)
cp /etc/nginx/nginx.prod.conf.template /etc/nginx/conf.d/default.conf

# Port ersetzen
sed -i "s/listen 80;/listen ${PORT:-80};/g" /etc/nginx/conf.d/default.conf

# HTTP Basic Auth — Schicht 1, immer Pflicht
# Passwort muss via ADMIN_HTTP_PASSWORD gesetzt sein (setup.sh erzwingt dies)
if [ -z "$ADMIN_HTTP_PASSWORD" ]; then
    echo "FEHLER: ADMIN_HTTP_PASSWORD ist nicht gesetzt. Bitte 'bash setup.sh' ausführen." >&2
    exit 1
fi
htpasswd -B -b -c /etc/nginx/.htpasswd "${ADMIN_HTTP_USER:-admin}" "$ADMIN_HTTP_PASSWORD"
sed -i 's|ADMIN_BASIC_AUTH_CONFIG|auth_basic "Admin-Bereich";\n        auth_basic_user_file /etc/nginx/.htpasswd;|' /etc/nginx/conf.d/default.conf

# IP-Allowlist — kommagetrennte Liste z.B. "192.168.1.10,10.0.0.0/24"
if [ -n "$ADMIN_ALLOWED_IPS" ]; then
    RULES=$(printf '%s' "$ADMIN_ALLOWED_IPS" | tr ',' '\n' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | awk '{print "allow " $0 ";"}')
    RULES="${RULES}
deny all;"
    awk -v rules="$RULES" '{ gsub(/ADMIN_IP_RULES/, rules); print }' /etc/nginx/conf.d/default.conf > /tmp/nginx.conf && mv /tmp/nginx.conf /etc/nginx/conf.d/default.conf
else
    sed -i 's|ADMIN_IP_RULES||' /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
