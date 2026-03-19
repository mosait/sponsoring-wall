#!/bin/bash
set -e

# ============================================================
#  Al-Rahma Sponsoring Wall — Production Setup
#  Verwendung: bash setup.sh
# ============================================================

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
ADMIN_EMAIL="admin@alrahma-darmstadt.de"

# ------------------------------------------------------------
# Hilfsfunktionen: JWT-Generierung in bash (kein externes Tool nötig)
# ------------------------------------------------------------
b64url() {
  printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '='
}

generate_jwt() {
  local secret="$1"
  local role="$2"
  local now
  now=$(date +%s)
  local exp=$(( now + 157680000 ))   # +5 Jahre
  local header='{"alg":"HS256","typ":"JWT"}'
  local payload="{\"role\":\"${role}\",\"iss\":\"supabase\",\"iat\":${now},\"exp\":${exp}}"
  local h; h=$(b64url "$header")
  local p; p=$(b64url "$payload")
  local sig
  sig=$(printf '%s' "${h}.${p}" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr '+/' '-_' | tr -d '=')
  echo "${h}.${p}.${sig}"
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Al-Rahma Sponsoring Wall — Production Setup   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  3-Schichten Sicherheit: Basic Auth → Email+Passwort → TOTP"
echo ""

# --- Vorhandene Host-Einstellungen laden (nur SERVER_HOST / USE_HTTPS, keine Secrets) ---
if [ -f "$ENV_FILE" ]; then
  PREV_HOST=$(grep '^SERVER_HOST=' "$ENV_FILE" | cut -d'=' -f2-)
  PREV_HTTPS=$(grep '^USE_HTTPS=' "$ENV_FILE" | cut -d'=' -f2-)
  if [ -n "$PREV_HOST" ]; then
    SERVER_HOST="$PREV_HOST"
    USE_HTTPS="$PREV_HTTPS"
    echo "▶ Vorherige Host-Einstellung geladen: $SERVER_HOST"
    echo ""
    read -p "  Andere IP/Domain verwenden? [j/N] " CHANGE
    if [[ "$CHANGE" =~ ^[jJ]$ ]]; then
      unset SERVER_HOST USE_HTTPS
    fi
  fi
fi

if [ -z "$SERVER_HOST" ]; then
  DEFAULT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
  read -p "Server-IP oder Domain [$DEFAULT_IP]: " INPUT_HOST
  SERVER_HOST="${INPUT_HOST:-$DEFAULT_IP}"
fi

# HTTPS oder HTTP? Beeinflusst GoTrue-URLs und Supabase-URL im Frontend-Build
if [ -z "$USE_HTTPS" ]; then
  read -p "HTTPS verwenden? (Prod mit SSL-Zertifikat) [j/N] " HTTPS_INPUT
  if [[ "$HTTPS_INPUT" =~ ^[jJ]$ ]]; then
    USE_HTTPS="true"
  else
    USE_HTTPS="false"
  fi
fi

if [ "$USE_HTTPS" = "true" ]; then
  SCHEME="https"
  echo "  ✓ HTTPS — alle URLs werden mit https:// gesetzt"
else
  SCHEME="http"
  echo "  ✓ HTTP — lokaler Test-Modus"
fi
echo ""

# --- Secrets immer neu generieren (frische kryptografische Werte) ---
echo "--- Kryptografische Schlüssel ---"

JWT_SECRET=$(openssl rand -hex 32)
echo "  ✓ JWT_SECRET neu generiert"

POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '+/=' | cut -c1-32)
echo "  ✓ POSTGRES_PASSWORD neu generiert"

SECRET_KEY_BASE=$(openssl rand -hex 64)
echo "  ✓ SECRET_KEY_BASE neu generiert"

ENC_KEY=$(openssl rand -hex 8)
echo "  ✓ ENC_KEY neu generiert (16 Zeichen = 16 Bytes für AES-128)"

# ANON_KEY und SERVICE_KEY aus dem neuen JWT_SECRET signieren
ANON_KEY=$(generate_jwt "$JWT_SECRET" "anon")
SERVICE_KEY=$(generate_jwt "$JWT_SECRET" "service_role")
echo "  ✓ ANON_KEY signiert"
echo "  ✓ SERVICE_KEY signiert"
echo ""

# --- init-realtime.sh dynamisch generieren (ENC_KEY + POSTGRES_PASSWORD + JWT_SECRET) ---
echo "--- Realtime-Konfiguration generieren ---"
if ! command -v node > /dev/null 2>&1; then
  echo "  ✗ Node.js nicht gefunden — init-realtime.sh NICHT aktualisiert!"
  echo "  ⚠ Realtime wird nicht funktionieren ohne korrekte Verschlüsselung."
else
  # AES-128-ECB PKCS7 mit Node.js (gleiche Methode wie Supabase Realtime Crypto.ex)
  _enc() {
    node -e "
const c=require('crypto');
const key=process.argv[1], val=process.argv[2];
const k=Buffer.from(key).slice(0,16),v=Buffer.from(val),p=16-(v.length%16);
const pad=Buffer.concat([v,Buffer.alloc(p,p)]),ci=c.createCipheriv('aes-128-ecb',k,null);
ci.setAutoPadding(false);
process.stdout.write(Buffer.concat([ci.update(pad),ci.final()]).toString('base64'));
" "$1" "$2"
  }

  ENC_JWT=$(_enc "$ENC_KEY" "$JWT_SECRET")
  ENC_HOST=$(_enc "$ENC_KEY" "db")
  ENC_NAME=$(_enc "$ENC_KEY" "postgres")
  ENC_PORT=$(_enc "$ENC_KEY" "5432")
  ENC_USER=$(_enc "$ENC_KEY" "postgres")
  ENC_PASS=$(_enc "$ENC_KEY" "$POSTGRES_PASSWORD")

  cat > scripts/init-realtime.sh <<SHEOF
#!/bin/sh
set -e
# Auto-generiert von setup.sh — nicht manuell bearbeiten
export PGPASSWORD="\${POSTGRES_PASSWORD}"

psql -h db -U postgres -d postgres <<EOSQL
  INSERT INTO public.tenants (id, name, external_id, jwt_secret, inserted_at, updated_at)
  VALUES (
    '3cad861d-0162-4f72-af23-087b2eb569cd',
    'realtime',
    'realtime',
    '${ENC_JWT}',
    now(),
    now()
  )
  ON CONFLICT (external_id) DO UPDATE SET
    jwt_secret = EXCLUDED.jwt_secret,
    updated_at = now();

  INSERT INTO public.extensions (id, type, settings, tenant_external_id, inserted_at, updated_at)
  VALUES (
    'd1b6c5e1-9f93-4c5d-8b8a-d1df42779df5',
    'postgres_cdc_rls',
    '{"db_ssl": false, "region": "eu-west-1", "db_host": "${ENC_HOST}", "db_name": "${ENC_NAME}", "db_port": "${ENC_PORT}", "db_user": "${ENC_USER}", "slot_name": "supabase_realtime_replication_slot", "db_password": "${ENC_PASS}", "publication": "supabase_realtime", "ssl_enforced": false, "poll_interval_ms": 100, "poll_max_changes": 100, "poll_max_record_bytes": 1048576}',
    'realtime',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = now();
EOSQL
SHEOF

  chmod +x scripts/init-realtime.sh
  echo "  ✓ init-realtime.sh generiert (JWT_SECRET + ENC_KEY synchronisiert)"
fi
echo ""

# ============================================================
# SCHICHT 1: HTTP Basic Auth (nginx) — immer Pflicht
# ============================================================
echo "--- Schicht 1: HTTP Basic Auth (nginx) ---"
echo "  Benutzername: admin"
while true; do
  read -s -p "  Passwort (mind. 12 Zeichen): " ADMIN_HTTP_PASSWORD
  echo ""
  if [ ${#ADMIN_HTTP_PASSWORD} -ge 12 ]; then
    read -s -p "  Passwort bestätigen: " ADMIN_HTTP_PASSWORD2
    echo ""
    if [ "$ADMIN_HTTP_PASSWORD" = "$ADMIN_HTTP_PASSWORD2" ]; then
      echo "  ✓ Basic-Auth Passwort gesetzt"
      break
    else
      echo "  ✗ Passwörter stimmen nicht überein."
    fi
  else
    echo "  ✗ Zu kurz — mindestens 12 Zeichen."
  fi
done
echo ""

# ============================================================
# SCHICHT 2: Admin E-Mail + Passwort (Supabase GoTrue)
# ============================================================
echo "--- Schicht 2: Admin E-Mail + Passwort ---"
echo "  E-Mail: $ADMIN_EMAIL"
while true; do
  read -s -p "  Passwort (mind. 12 Zeichen): " ADMIN_PASS
  echo ""
  if [ ${#ADMIN_PASS} -ge 12 ]; then
    read -s -p "  Passwort bestätigen: " ADMIN_PASS2
    echo ""
    if [ "$ADMIN_PASS" = "$ADMIN_PASS2" ]; then
      echo "  ✓ Admin-Passwort gesetzt"
      break
    else
      echo "  ✗ Passwörter stimmen nicht überein."
    fi
  else
    echo "  ✗ Zu kurz — mindestens 12 Zeichen."
  fi
done
echo ""
echo "  Schicht 3: TOTP wird beim ersten Admin-Login eingerichtet"
echo "             (Google Authenticator / Authy — QR-Code im Browser)"
echo ""

# --- IP-Allowlist für /admin (optional) ---
echo "--- IP-Allowlist für /admin (optional) ---"
echo "  Beispiel: 192.168.1.10,10.0.0.0/24"
read -p "  Erlaubte IPs/Bereiche (leer = keine Einschränkung): " ADMIN_ALLOWED_IPS
echo ""

# --- .env.prod schreiben ---
# ADMIN_PASS wird NICHT gespeichert — nur für API-Aufruf in dieser Session
cat > "$ENV_FILE" <<EOF
SERVER_HOST=${SERVER_HOST}
USE_HTTPS=${USE_HTTPS}
SCHEME=${SCHEME}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_KEY=${SERVICE_KEY}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
ENC_KEY=${ENC_KEY}
ADMIN_HTTP_USER=admin
ADMIN_HTTP_PASSWORD=${ADMIN_HTTP_PASSWORD}
ADMIN_ALLOWED_IPS=${ADMIN_ALLOWED_IPS}
EOF
chmod 600 "$ENV_FILE"
echo "✓ $ENV_FILE geschrieben (Secrets generiert, nicht hardcodiert)"
echo "  Berechtigungen: $(ls -la $ENV_FILE | awk '{print $1, $3, $4}')"
echo ""

# --- DB Backup (falls bereits läuft) ---
if docker ps --format '{{.Names}}' | grep -q "sponsoring-wall-db"; then
  echo "--- Datenbank-Backup ---"
  BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
  docker exec sponsoring-wall-db pg_dump -U postgres -d postgres \
    --table=public.sponsors \
    --table=public.project_settings \
    --data-only --no-privileges \
    > "$BACKUP_FILE" 2>/dev/null && echo "✓ Backup: $BACKUP_FILE" || echo "⚠ Backup übersprungen (keine Daten)"
  echo ""
fi

# --- Alles stoppen & Frontend bauen ---
echo "--- Services bauen & starten ---"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache frontend

# Schritt 1: Nur DB + Realtime starten (auth noch NICHT — falsches PW würde crashen)
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db realtime
echo ""

# --- Warten bis DB bereit ---
DB_CONTAINER="sponsoring-wall-db"
echo "--- Warte auf Datenbank..."
for i in $(seq 1 40); do
  if docker exec "$DB_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; then
    echo "✓ Datenbank bereit"
    break
  fi
  [ "$i" = "40" ] && echo "✗ Datenbank nicht bereit. Logs: docker logs $DB_CONTAINER" && exit 1
  printf "."
  sleep 2
done
echo ""

# --- DB-User konfigurieren ---
echo "--- DB-User konfigurieren ---"
docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -q -c "
  ALTER ROLE postgres SUPERUSER;
  ALTER SCHEMA realtime OWNER TO postgres;
" && echo "✓ postgres Superuser gesetzt"

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q -c "
  ALTER USER postgres PASSWORD '${POSTGRES_PASSWORD}';
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      CREATE ROLE supabase_auth_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}';
    ELSE
      ALTER ROLE supabase_auth_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}';
    END IF;
  END \$\$;
  GRANT supabase_auth_admin TO postgres;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
  ALTER ROLE supabase_auth_admin SET search_path TO auth;
" && echo "✓ DB-User konfiguriert"
echo ""

# Schritt 2: Auth + Rest + Kong + Frontend starten (Auth zuerst, dann Rest)
echo "--- Auth starten ---"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d auth
echo ""

# Schritt 3: Rest + Kong + Frontend (jetzt wo Auth mit korrektem PW läuft)
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d rest kong frontend
echo ""

# --- Warten bis Kong/Auth erreichbar ---
echo "--- Warte auf API (Kong)..."
for i in $(seq 1 40); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/auth/v1/health" 2>/dev/null || echo "000")
  [ "$STATUS" = "200" ] && echo "✓ API bereit" && break
  [ "$i" = "40" ] && echo "✗ API nicht erreichbar. Logs: docker logs supabase-kong" && exit 1
  printf "."
  sleep 2
done
echo ""

# --- Admin-User anlegen oder Passwort aktualisieren ---
echo "--- Admin-User (Schicht 2) konfigurieren ---"
USER_ID=$(curl -s \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  "http://localhost:8000/auth/v1/admin/users" 2>/dev/null \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

if [ -z "$USER_ID" ]; then
  RESULT=$(curl -s -X POST "http://localhost:8000/auth/v1/admin/users" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"email_confirm\":true}" 2>/dev/null)
  echo "$RESULT" | grep -q '"id"' && echo "✓ Admin-User erstellt: $ADMIN_EMAIL" \
    || { echo "✗ Fehler: $RESULT"; exit 1; }
else
  RESULT=$(curl -s -X PUT "http://localhost:8000/auth/v1/admin/users/$USER_ID" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"$ADMIN_PASS\",\"email_confirm\":true}" 2>/dev/null)
  echo "$RESULT" | grep -q '"id"' && echo "✓ Admin-Passwort aktualisiert: $ADMIN_EMAIL" \
    || { echo "✗ Fehler: $RESULT"; exit 1; }
fi
# ADMIN_PASS aus dem Speicher löschen
unset ADMIN_PASS ADMIN_PASS2 ADMIN_HTTP_PASSWORD ADMIN_HTTP_PASSWORD2
echo ""

# --- Realtime-Setup starten ---
echo "--- Realtime initialisieren ---"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d realtime-setup
echo "✓ Realtime-Setup gestartet"
echo ""

# --- Fertig ---
echo "╔══════════════════════════════════════════════════╗"
echo "║                    ✓ FERTIG                     ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  App:     ${SCHEME}://${SERVER_HOST}"
echo "║  Admin:   ${SCHEME}://${SERVER_HOST}/admin"
echo "║  API:     ${SCHEME}://${SERVER_HOST}:8000"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Login-Ablauf (3 Schichten):                    ║"
echo "║  1. HTTP Basic Auth  → Benutzername: admin      ║"
echo "║  2. E-Mail + Passwort → $ADMIN_EMAIL"
echo "║  3. TOTP-Code        → Google Authenticator     ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Update: bash setup.sh  (Backup + Neustart)     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
