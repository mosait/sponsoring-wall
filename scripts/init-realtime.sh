#!/bin/sh
set -e
# Auto-generiert von setup.sh — nicht manuell bearbeiten
export PGPASSWORD="${POSTGRES_PASSWORD}"

psql -h db -U postgres -d postgres <<EOSQL
  INSERT INTO public.tenants (id, name, external_id, jwt_secret, inserted_at, updated_at)
  VALUES (
    '3cad861d-0162-4f72-af23-087b2eb569cd',
    'realtime',
    'realtime',
    'H4JnomRF7cWYc7tk7nUo3lCBXdsOokUmyPk14a/Gsg4+kvYsxaUcLZj8JZIjQOz/yT90mc4Hf57byjHI8bt+UqvE7IdyQ19ZRzdhSCELWs4=',
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
    '{"db_ssl": false, "region": "eu-west-1", "db_host": "nzdz03bUlHaOyc3C3wz4hA==", "db_name": "21fGq2uRFvJuQpLyBQF0kA==", "db_port": "KWEgEKTpCKGmbMdsxE1WBA==", "db_user": "21fGq2uRFvJuQpLyBQF0kA==", "slot_name": "supabase_realtime_replication_slot", "db_password": "q2OIGBq+m7YkB46EII98SLO8scZxb9O/2IlL0kvBgRmrxOyHckNfWUc3YUghC1rO", "publication": "supabase_realtime", "ssl_enforced": false, "poll_interval_ms": 100, "poll_max_changes": 100, "poll_max_record_bytes": 1048576}',
    'realtime',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = now();
EOSQL
