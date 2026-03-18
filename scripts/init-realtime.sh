#!/bin/sh
set -e
# PGPASSWORD kommt aus der Container-Umgebung (docker-compose: POSTGRES_PASSWORD)
export PGPASSWORD="${POSTGRES_PASSWORD}"

psql -h db -U postgres -d postgres <<-EOSQL
  -- Tenant
  INSERT INTO public.tenants (id, name, external_id, jwt_secret, inserted_at, updated_at)
  VALUES (
    '3cad861d-0162-4f72-af23-087b2eb569cd',
    'realtime',
    'realtime',
    'JShMf/WxB79Vl0UXnTyeORlAZfVtSJshKtrHYj4QLGfYuvlVM/KlT6Q87bLZTRdI',
    now(),
    now()
  )
  ON CONFLICT (external_id) DO UPDATE SET
    jwt_secret = EXCLUDED.jwt_secret,
    updated_at = now();

  -- Extension (DB connection details encrypted with DB_ENC_KEY)
  INSERT INTO public.extensions (id, type, settings, tenant_external_id, inserted_at, updated_at)
  VALUES (
    'd1b6c5e1-9f93-4c5d-8b8a-d1df42779df5',
    'postgres_cdc_rls',
    '{"db_ssl": false, "region": "eu-west-1", "db_host": "EqEuAd9TKwG43AtguEISIQ==", "db_name": "YgVrE1S+NSxyw+hz6+zsSg==", "db_port": "uktrvo4yYWgOiq1ryH9PtQ==", "db_user": "YgVrE1S+NSxyw+hz6+zsSg==", "slot_name": "supabase_realtime_replication_slot", "db_password": "3wbs5TR/5j3Qu/OrinLXWKOia/Ug1sSOOklsd08OjFI=", "publication": "supabase_realtime", "ssl_enforced": false, "poll_interval_ms": 100, "poll_max_changes": 100, "poll_max_record_bytes": 1048576}',
    'realtime',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = now();
EOSQL
