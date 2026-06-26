-- 1. ROLLEN
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT anon TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;

-- GoTrue benötigt diesen User für seine DB-Migrationen
-- ALTER statt CREATE weil supabase/postgres ihn bereits ohne Passwort anlegt
ALTER ROLE supabase_auth_admin LOGIN PASSWORD 'qZ7_pX92_mK4_vL1_sR8_db_pass';
GRANT supabase_auth_admin TO postgres;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path TO auth;

-- 2. SCHEMAS
CREATE SCHEMA IF NOT EXISTS public;

-- 3. TABELLEN (public)
CREATE TABLE IF NOT EXISTS public.sponsors (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    iban TEXT,
    sq_meters INTEGER NOT NULL DEFAULT 1,
    mandate_accepted BOOLEAN DEFAULT FALSE,
    is_anonymous BOOLEAN DEFAULT FALSE,
    total_amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Realtime CDC braucht FULL für UPDATE/DELETE Events
ALTER TABLE public.sponsors REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS public.project_settings (
    id SERIAL PRIMARY KEY,
    goal_sq_meters NUMERIC DEFAULT 2480,
    price_per_unit NUMERIC DEFAULT 15,
    dashboard_locked BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.project_settings (goal_sq_meters, price_per_unit, dashboard_locked)
SELECT 2480, 15, FALSE WHERE NOT EXISTS (SELECT 1 FROM public.project_settings);

-- 5. SICHERE VIEW für öffentlichen Zugriff (kein IBAN, Email, Phone)
CREATE OR REPLACE VIEW public.sponsors_public AS
SELECT
  id,
  full_name,
  sq_meters,
  is_anonymous,
  total_amount,
  (iban = 'CASH') AS is_cash,
  created_at
FROM public.sponsors;

-- 5a. RECHTE — erst alles entziehen, dann gezielt vergeben
REVOKE ALL ON public.sponsors FROM anon;
REVOKE ALL ON public.sponsors FROM authenticated;
REVOKE ALL ON public.project_settings FROM anon;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- anon: sichere View lesen + in sponsors einfügen/updaten (kein direktes SELECT auf sponsors/settings)
GRANT SELECT ON public.sponsors_public TO anon;
GRANT INSERT, UPDATE ON public.sponsors TO anon;
-- project_settings: kein direkter SELECT für anon — nur via get_public_settings() Funktion

-- authenticated (Admin): voller Zugriff auf sponsors
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO authenticated;
GRANT SELECT ON public.sponsors_public TO authenticated;
GRANT SELECT ON public.project_settings TO authenticated;

-- Sequences für INSERT
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Globaler Suchpfad
ALTER ROLE anon SET search_path TO public, extensions;
ALTER ROLE authenticated SET search_path TO public, extensions;
ALTER ROLE postgres SET search_path TO public, extensions;
ALTER DATABASE postgres SET search_path TO public, extensions;

-- 5b. RLS
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;

-- anon darf einfügen (Registrierung) und updaten (Beitrag erhöhen) via SECURITY DEFINER Funktionen
-- kein direktes SELECT — verhindert Zugriff auf IBAN/Email/Telefon durch anon
DROP POLICY IF EXISTS "sponsors_insert" ON public.sponsors;
CREATE POLICY "sponsors_insert" ON public.sponsors FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "anon_select_boost" ON public.sponsors;
DROP POLICY IF EXISTS "anon_update_boost" ON public.sponsors;
-- authenticated (Admin) darf alles lesen
DROP POLICY IF EXISTS "sponsors_select_auth" ON public.sponsors;
CREATE POLICY "sponsors_select_auth" ON public.sponsors FOR SELECT
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'authenticated');

-- authenticated (Admin) darf bearbeiten und löschen
DROP POLICY IF EXISTS "sponsors_update_auth" ON public.sponsors;
CREATE POLICY "sponsors_update_auth" ON public.sponsors FOR UPDATE
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'authenticated');
DROP POLICY IF EXISTS "sponsors_delete_auth" ON public.sponsors;
CREATE POLICY "sponsors_delete_auth" ON public.sponsors FOR DELETE
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'authenticated');

-- project_settings: nur authenticated darf lesen (anon nutzt get_public_settings())
DROP POLICY IF EXISTS "settings_select" ON public.project_settings;
CREATE POLICY "settings_select" ON public.project_settings FOR SELECT
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'authenticated');
DROP POLICY IF EXISTS "settings_update_auth" ON public.project_settings;
CREATE POLICY "settings_update_auth" ON public.project_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 5c. Realtime-interne Tabellen absichern (tenants, extensions)
-- Diese enthalten verschlüsselte Secrets und DB-Credentials
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'tenants' AND schemaname = 'public') THEN
    REVOKE ALL ON public.tenants FROM anon;
    REVOKE ALL ON public.tenants FROM authenticated;
    GRANT ALL ON public.tenants TO service_role;
    ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'extensions' AND schemaname = 'public') THEN
    REVOKE ALL ON public.extensions FROM anon;
    REVOKE ALL ON public.extensions FROM authenticated;
    GRANT ALL ON public.extensions TO service_role;
    ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 6. SECURITY DEFINER Funktionen (anon-Gateway — kein direkter Tabellenzugriff nötig)

-- Gibt nur id, sq_meters, total_amount zurück (kein IBAN/Email/Phone)
-- Wird von der Registrierungsseite verwendet, um Duplikate zu erkennen
CREATE OR REPLACE FUNCTION public.get_sponsor_for_registration(p_iban TEXT)
RETURNS TABLE(id INT, sq_meters INT, total_amount NUMERIC)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, sq_meters, total_amount FROM public.sponsors WHERE iban = p_iban LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_sponsor_for_registration(TEXT) TO anon;

-- Sucht Sponsor per IBAN und addiert sq_meters + total_amount (kein SELECT nach außen)
-- Wird vom Boost-Modal auf der Registrierungsseite verwendet
CREATE OR REPLACE FUNCTION public.boost_update_sponsor(p_iban TEXT, p_add_sqm INT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_sq INT;
  v_amount NUMERIC;
  v_price NUMERIC;
BEGIN
  SELECT price_per_unit INTO v_price FROM public.project_settings LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT id, sq_meters, total_amount INTO v_id, v_sq, v_amount
    FROM public.sponsors WHERE iban = p_iban LIMIT 1;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  UPDATE public.sponsors
    SET sq_meters = v_sq + p_add_sqm,
        total_amount = v_amount + (p_add_sqm * v_price)
    WHERE id = v_id;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.boost_update_sponsor(TEXT, INT) TO anon;

-- Gibt nur die öffentlich benötigten Settings zurück (kein direkter Tabellenzugriff für anon)
-- Dashboard: goal_sq_meters, dashboard_locked | Register: price_per_unit
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(goal_sq_meters NUMERIC, price_per_unit NUMERIC, dashboard_locked BOOLEAN, register_stop_mode TEXT)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT goal_sq_meters, price_per_unit, dashboard_locked, register_stop_mode FROM public.project_settings LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon;

-- Registrierung: INSERT neuer Sponsor oder UPDATE bei bekannter IBAN (atomisch, kein direkter Tabellenzugriff für anon nötig)
CREATE OR REPLACE FUNCTION public.register_sponsor(
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_iban TEXT,
    p_sq_meters INT,
    p_mandate_accepted BOOLEAN,
    p_is_anonymous BOOLEAN,
    p_total_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id INT;
    v_sq INT;
    v_amount NUMERIC;
BEGIN
    SELECT id, sq_meters, total_amount
    INTO v_id, v_sq, v_amount
    FROM public.sponsors
    WHERE iban = p_iban
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.sponsors SET
            full_name        = p_full_name,
            email            = p_email,
            phone            = p_phone,
            sq_meters        = v_sq + p_sq_meters,
            total_amount     = v_amount + p_total_amount,
            mandate_accepted = p_mandate_accepted,
            is_anonymous     = p_is_anonymous
        WHERE id = v_id;
        RETURN jsonb_build_object('id', v_id, 'action', 'updated');
    ELSE
        INSERT INTO public.sponsors
            (full_name, email, phone, iban, sq_meters, mandate_accepted, is_anonymous, total_amount)
        VALUES
            (p_full_name, p_email, p_phone, p_iban, p_sq_meters, p_mandate_accepted, p_is_anonymous, p_total_amount)
        RETURNING id INTO v_id;
        RETURN jsonb_build_object('id', v_id, 'action', 'inserted');
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_sponsor(TEXT, TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, NUMERIC) TO anon;

-- 7. REALTIME
DO $$
BEGIN
    DROP PUBLICATION IF EXISTS supabase_realtime;
    CREATE PUBLICATION supabase_realtime FOR TABLE public.sponsors;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- PostgREST benachrichtigen
NOTIFY pgrst, 'reload schema';
