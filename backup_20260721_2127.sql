--
-- PostgreSQL database dump
--

\restrict KTV2GKQQIYJ3ViZvuWTj808L2eQgfo9P1Cxoa1AJjk2t676oTDYCzYCVJNnMctz

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO supabase_admin;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO postgres;

--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql;


ALTER SCHEMA graphql OWNER TO supabase_admin;

--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql_public;


ALTER SCHEMA graphql_public OWNER TO supabase_admin;

--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: pgbouncer
--

CREATE SCHEMA pgbouncer;


ALTER SCHEMA pgbouncer OWNER TO pgbouncer;

--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA realtime;


ALTER SCHEMA realtime OWNER TO supabase_admin;

--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA storage;


ALTER SCHEMA storage OWNER TO supabase_admin;

--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA vault;


ALTER SCHEMA vault OWNER TO supabase_admin;

--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


ALTER TYPE auth.aal_level OWNER TO supabase_auth_admin;

--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


ALTER TYPE auth.code_challenge_method OWNER TO supabase_auth_admin;

--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


ALTER TYPE auth.factor_status OWNER TO supabase_auth_admin;

--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


ALTER TYPE auth.factor_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


ALTER TYPE auth.oauth_authorization_status OWNER TO supabase_auth_admin;

--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


ALTER TYPE auth.oauth_client_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


ALTER TYPE auth.oauth_registration_type OWNER TO supabase_auth_admin;

--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


ALTER TYPE auth.oauth_response_type OWNER TO supabase_auth_admin;

--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


ALTER TYPE auth.one_time_token_type OWNER TO supabase_auth_admin;

--
-- Name: action; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


ALTER TYPE realtime.action OWNER TO supabase_realtime_admin;

--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


ALTER TYPE realtime.equality_op OWNER TO supabase_realtime_admin;

--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


ALTER TYPE realtime.user_defined_filter OWNER TO supabase_realtime_admin;

--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


ALTER TYPE realtime.wal_column OWNER TO supabase_realtime_admin;

--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


ALTER TYPE realtime.wal_rls OWNER TO supabase_realtime_admin;

--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE storage.buckettype OWNER TO supabase_storage_admin;

--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;

--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;

--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
begin
    if not exists (
        select 1
        from pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


ALTER FUNCTION extensions.grant_pg_graphql_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_drop_watch() OWNER TO supabase_admin;

--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


ALTER FUNCTION extensions.set_graphql_placeholder() OWNER TO supabase_admin;

--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: supabase_admin
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


ALTER FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) OWNER TO supabase_admin;

--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: supabase_admin
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


ALTER FUNCTION pgbouncer.get_auth(p_usename text) OWNER TO supabase_admin;

--
-- Name: check_booking_coach_conflict(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_booking_coach_conflict() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_coach_id uuid;
  v_session_date date;
  v_start_time time;
BEGIN
  SELECT cs.coach_id, cs.session_date, cs.start_time
  INTO v_coach_id, v_session_date, v_start_time
  FROM class_sessions cs
  WHERE cs.id = NEW.class_session_id;

  IF EXISTS (
    SELECT 1 FROM bookings b
    JOIN class_sessions cs ON cs.id = b.class_session_id
    WHERE cs.coach_id = v_coach_id
      AND cs.session_date = v_session_date
      AND cs.start_time = v_start_time
      AND cs.id != NEW.class_session_id
      AND b.status NOT IN ('cancelled', 'pending_partner')
  ) THEN
    RAISE EXCEPTION 'coach_timeslot_conflict: 此時段教練已有其他課程';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_booking_coach_conflict() OWNER TO postgres;

--
-- Name: check_coach_timeslot_conflict(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_coach_timeslot_conflict() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 只在新 session 被建立時檢查(INSERT),或 enrolled_count 從 0 變成有人時
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.enrolled_count = 0 AND NEW.enrolled_count > 0)) THEN
    IF EXISTS (
      SELECT 1 FROM class_sessions
      WHERE coach_id = NEW.coach_id
        AND session_date = NEW.session_date
        AND start_time = NEW.start_time
        AND status = 'open'
        AND enrolled_count > 0
        AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'coach_timeslot_conflict: 此時段教練已有其他課程';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_coach_timeslot_conflict() OWNER TO postgres;

--
-- Name: check_level_upgrade(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_level_upgrade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_skill_level_id UUID;
  v_current_level INTEGER;
  v_total_skills INTEGER;
  v_completed_skills INTEGER;
BEGIN
  SELECT level_id INTO v_skill_level_id FROM skills WHERE id = NEW.skill_id;

  SELECT COUNT(*) INTO v_total_skills
  FROM skills WHERE level_id = v_skill_level_id AND is_active = TRUE;

  SELECT COUNT(*) INTO v_completed_skills
  FROM student_skill_progress ssp
  JOIN skills sk ON sk.id = ssp.skill_id
  WHERE ssp.student_id = NEW.student_id
  AND sk.level_id = v_skill_level_id
  AND ssp.progress_percent = 100;

  IF v_total_skills > 0 AND v_completed_skills >= v_total_skills THEN
    SELECT current_level INTO v_current_level FROM students WHERE id = NEW.student_id;
    IF v_current_level < 9 THEN
      UPDATE students SET current_level = v_current_level + 1 WHERE id = NEW.student_id;
      INSERT INTO level_upgrades (student_id, from_level, to_level, upgraded_by)
      VALUES (NEW.student_id, v_current_level, v_current_level + 1, NEW.last_updated_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_level_upgrade() OWNER TO postgres;

--
-- Name: check_max_students_per_parent(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_max_students_per_parent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (SELECT COUNT(*) FROM students WHERE parent_id = NEW.parent_id AND is_active = TRUE) >= 3 THEN
    RAISE EXCEPTION 'A parent account can have a maximum of 3 students.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_max_students_per_parent() OWNER TO postgres;

--
-- Name: decrement_enrolled(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decrement_enrolled(session_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE class_sessions
  SET enrolled_count = GREATEST(0, enrolled_count - 1)
  WHERE id = session_id;
END;
$$;


ALTER FUNCTION public.decrement_enrolled(session_id uuid) OWNER TO postgres;

--
-- Name: decrement_used_credits(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.decrement_used_credits(credit_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update lesson_credits set used_credits = greatest(0, used_credits - 1) where id = credit_id;
$$;


ALTER FUNCTION public.decrement_used_credits(credit_id uuid) OWNER TO postgres;

--
-- Name: get_next_invoice_seq(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_next_invoice_seq() RETURNS integer
    LANGUAGE sql
    AS $$
  SELECT nextval('invoice_seq')::INTEGER;
$$;


ALTER FUNCTION public.get_next_invoice_seq() OWNER TO postgres;

--
-- Name: get_students_ready_for_upgrade(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_students_ready_for_upgrade() RETURNS TABLE(student_id uuid, student_name text, current_level text, next_level text, skill_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as student_id,
    s.full_name as student_name,
    s.current_level,
    (s.current_level::int + 1)::text as next_level,
    COUNT(ssp.id) as skill_count
  FROM students s
  JOIN student_skill_progress ssp ON ssp.student_id = s.id
  JOIN skills sk ON sk.id = ssp.skill_id
  JOIN levels l ON l.id = sk.level_id AND l.level_number::text = s.current_level
  WHERE ssp.progress_percent = 100
    AND s.is_active = true
    AND s.current_level::int < 9
  GROUP BY s.id, s.full_name, s.current_level
  HAVING COUNT(ssp.id) = 8
    AND COUNT(ssp.id) = (
      SELECT COUNT(*) FROM skills sk2 
      JOIN levels l2 ON l2.id = sk2.level_id 
      WHERE l2.level_number::text = s.current_level
      AND sk2.is_active = true
    );
END;
$$;


ALTER FUNCTION public.get_students_ready_for_upgrade() OWNER TO postgres;

--
-- Name: increment_credit(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_credit(credit_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE lesson_credits
  SET used_credits = GREATEST(used_credits - 1, 0)
  WHERE id = credit_id;
END;
$$;


ALTER FUNCTION public.increment_credit(credit_id uuid) OWNER TO postgres;

--
-- Name: increment_enrolled(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_enrolled(session_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE class_sessions
  SET enrolled_count = enrolled_count + 1
  WHERE id = session_id;
END;
$$;


ALTER FUNCTION public.increment_enrolled(session_id uuid) OWNER TO postgres;

--
-- Name: increment_used_credits(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_used_credits(credit_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update lesson_credits set used_credits = used_credits + 1 where id = credit_id;
$$;


ALTER FUNCTION public.increment_used_credits(credit_id uuid) OWNER TO postgres;

--
-- Name: increment_used_tokens(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_used_tokens(token_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  update token_packages set used_tokens = used_tokens + 1, updated_at = now() where id = token_id;
$$;


ALTER FUNCTION public.increment_used_tokens(token_id uuid) OWNER TO postgres;

--
-- Name: update_enrolled_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_enrolled_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare v_session_id uuid;
begin
  v_session_id := coalesce(new.class_session_id, old.class_session_id);
  update class_sessions set
    enrolled_count = (
      select count(*) from bookings
      where class_session_id = v_session_id
        and status in ('confirmed', 'completed', 'pending_payment', 'in_cart')
    ),
    status = case
      when (select count(*) from bookings where class_session_id = v_session_id
              and status in ('confirmed', 'completed', 'pending_payment', 'in_cart'))
        >= (select max_students from class_sessions where id = v_session_id)
      then 'full' else 'open'
    end
  where id = v_session_id;
  return new;
end;
$$;


ALTER FUNCTION public.update_enrolled_count() OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


ALTER FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) OWNER TO supabase_realtime_admin;

--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


ALTER FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) OWNER TO supabase_realtime_admin;

--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


ALTER FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) OWNER TO supabase_realtime_admin;

--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


ALTER FUNCTION realtime."cast"(val text, type_ regtype) OWNER TO supabase_realtime_admin;

--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


ALTER FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) OWNER TO supabase_realtime_admin;

--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


ALTER FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) OWNER TO supabase_realtime_admin;

--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


ALTER FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) OWNER TO supabase_realtime_admin;

--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


ALTER FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) OWNER TO supabase_realtime_admin;

--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


ALTER FUNCTION realtime.quote_wal2json(entity regclass) OWNER TO supabase_realtime_admin;

--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) OWNER TO supabase_realtime_admin;

--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


ALTER FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) OWNER TO supabase_realtime_admin;

--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$$;


ALTER FUNCTION realtime.subscription_check_filters() OWNER TO supabase_realtime_admin;

--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


ALTER FUNCTION realtime.to_regrole(role_name text) OWNER TO supabase_realtime_admin;

--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


ALTER FUNCTION realtime.topic() OWNER TO supabase_realtime_admin;

--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


ALTER FUNCTION realtime.wal2json_escape_identifier(name text) OWNER TO supabase_realtime_admin;

--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


ALTER FUNCTION storage.allow_any_operation(expected_operations text[]) OWNER TO supabase_storage_admin;

--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


ALTER FUNCTION storage.allow_only_operation(expected_operation text) OWNER TO supabase_storage_admin;

--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) OWNER TO supabase_storage_admin;

--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION storage.enforce_bucket_name_length() OWNER TO supabase_storage_admin;

--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION storage.extension(name text) OWNER TO supabase_storage_admin;

--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION storage.filename(name text) OWNER TO supabase_storage_admin;

--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


ALTER FUNCTION storage.foldername(name text) OWNER TO supabase_storage_admin;

--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) OWNER TO supabase_storage_admin;

--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION storage.get_size_by_bucket() OWNER TO supabase_storage_admin;

--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer, next_key_token text, next_upload_token text) OWNER TO supabase_storage_admin;

--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer, start_after text, next_token text, sort_order text) OWNER TO supabase_storage_admin;

--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION storage.operation() OWNER TO supabase_storage_admin;

--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION storage.protect_delete() OWNER TO supabase_storage_admin;

--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer, search text, sortcolumn text, sortorder text) OWNER TO supabase_storage_admin;

--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) OWNER TO supabase_storage_admin;

--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer, levels integer, start_after text, sort_order text, sort_column text, sort_column_after text) OWNER TO supabase_storage_admin;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION storage.update_updated_at_column() OWNER TO supabase_storage_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE auth.audit_log_entries OWNER TO supabase_auth_admin;

--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


ALTER TABLE auth.custom_oauth_providers OWNER TO supabase_auth_admin;

--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


ALTER TABLE auth.flow_state OWNER TO supabase_auth_admin;

--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE auth.identities OWNER TO supabase_auth_admin;

--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.instances OWNER TO supabase_auth_admin;

--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


ALTER TABLE auth.mfa_amr_claims OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


ALTER TABLE auth.mfa_challenges OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


ALTER TABLE auth.mfa_factors OWNER TO supabase_auth_admin;

--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


ALTER TABLE auth.oauth_authorizations OWNER TO supabase_auth_admin;

--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE auth.oauth_client_states OWNER TO supabase_auth_admin;

--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


ALTER TABLE auth.oauth_clients OWNER TO supabase_auth_admin;

--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


ALTER TABLE auth.oauth_consents OWNER TO supabase_auth_admin;

--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


ALTER TABLE auth.one_time_tokens OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin;

--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: supabase_auth_admin
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.refresh_tokens_id_seq OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: supabase_auth_admin
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


ALTER TABLE auth.saml_providers OWNER TO supabase_auth_admin;

--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


ALTER TABLE auth.saml_relay_states OWNER TO supabase_auth_admin;

--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin;

--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;

--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


ALTER TABLE auth.sso_domains OWNER TO supabase_auth_admin;

--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


ALTER TABLE auth.sso_providers OWNER TO supabase_auth_admin;

--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


ALTER TABLE auth.users OWNER TO supabase_auth_admin;

--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


ALTER TABLE auth.webauthn_challenges OWNER TO supabase_auth_admin;

--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


ALTER TABLE auth.webauthn_credentials OWNER TO supabase_auth_admin;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'admin'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admins_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'super_admin'::text])))
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- Name: ai_tool_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_tool_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    parent_id uuid,
    tool_name text NOT NULL,
    input jsonb,
    output jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_tool_logs OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    student_id uuid NOT NULL,
    class_session_id uuid NOT NULL,
    checked_in_at timestamp with time zone DEFAULT now(),
    check_in_method text DEFAULT 'qr'::text,
    checked_in_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    is_chained boolean DEFAULT false NOT NULL,
    CONSTRAINT attendance_check_in_method_check CHECK ((check_in_method = ANY (ARRAY['qr'::text, 'manual'::text])))
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: booking_students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attended boolean,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.booking_students OWNER TO postgres;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_session_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    lesson_credit_id uuid,
    status text DEFAULT 'confirmed'::text,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    cancelled_by text,
    makeup_credit_issued boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    student_id uuid,
    is_trial boolean DEFAULT false NOT NULL,
    partner_parent_id uuid,
    partner_booking_id uuid,
    pending_action text,
    pending_expires_at timestamp with time zone,
    pending_new_session_id uuid,
    is_guest boolean DEFAULT false,
    partnership_id uuid,
    original_booking_id uuid,
    stripe_session_id text,
    block_notice_sent_at timestamp with time zone,
    token_package_id uuid,
    reminder_sent_at timestamp with time zone,
    CONSTRAINT bookings_cancelled_by_check CHECK ((cancelled_by = ANY (ARRAY['parent'::text, 'admin'::text, 'system'::text]))),
    CONSTRAINT bookings_credit_token_exclusive_check CHECK ((NOT ((lesson_credit_id IS NOT NULL) AND (token_package_id IS NOT NULL)))),
    CONSTRAINT bookings_pending_action_check CHECK ((pending_action = ANY (ARRAY['confirm'::text, 'reschedule'::text, 'reschedule_initiator'::text, 'cancel'::text]))),
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'rescheduled'::text, 'pending_partner'::text, 'pending_payment'::text, 'in_cart'::text])))
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    sender_type text,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    ai_handled boolean DEFAULT false NOT NULL,
    metadata jsonb,
    sender_admin_id uuid,
    CONSTRAINT chat_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['parent'::text, 'ai'::text, 'admin'::text, 'system'::text])))
);


ALTER TABLE public.chat_messages OWNER TO postgres;

--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chat_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    status text DEFAULT 'open'::text,
    last_message_at timestamp with time zone,
    last_message_preview text,
    unread_by_admin boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    mode text DEFAULT 'ai'::text NOT NULL,
    escalation_summary text,
    handled_by uuid,
    ai_context_from timestamp with time zone,
    CONSTRAINT chat_threads_mode_check CHECK ((mode = ANY (ARRAY['ai'::text, 'human'::text]))),
    CONSTRAINT chat_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


ALTER TABLE public.chat_threads OWNER TO postgres;

--
-- Name: class_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_type_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    session_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    max_students integer NOT NULL,
    enrolled_count integer DEFAULT 0,
    status text DEFAULT 'open'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT class_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'cancelled'::text, 'completed'::text])))
);


ALTER TABLE public.class_sessions OWNER TO postgres;

--
-- Name: coach_availability; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coach_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT coach_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


ALTER TABLE public.coach_availability OWNER TO postgres;

--
-- Name: coach_availability_zones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coach_availability_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    zone_type text NOT NULL,
    kind text NOT NULL,
    weekday integer,
    override_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    team_tier_id uuid,
    group_level_min integer,
    group_level_max integer,
    CONSTRAINT chk_team_tier CHECK (((zone_type <> 'team'::text) OR (team_tier_id IS NOT NULL))),
    CONSTRAINT coach_availability_zones_check CHECK ((start_time < end_time)),
    CONSTRAINT coach_availability_zones_check1 CHECK ((((kind = 'weekly'::text) AND (weekday IS NOT NULL) AND (override_date IS NULL)) OR ((kind = 'date'::text) AND (override_date IS NOT NULL) AND (weekday IS NULL)))),
    CONSTRAINT coach_availability_zones_check2 CHECK (((zone_type <> 'closed'::text) OR (kind = 'date'::text))),
    CONSTRAINT coach_availability_zones_kind_check CHECK ((kind = ANY (ARRAY['weekly'::text, 'date'::text]))),
    CONSTRAINT coach_availability_zones_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6))),
    CONSTRAINT coach_availability_zones_zone_type_check CHECK ((zone_type = ANY (ARRAY['private'::text, 'group'::text, 'team'::text, 'closed'::text])))
);


ALTER TABLE public.coach_availability_zones OWNER TO postgres;

--
-- Name: coach_time_off; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coach_time_off (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    date date NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    start_time time without time zone,
    end_time time without time zone,
    block_type text DEFAULT 'time_off'::text NOT NULL,
    CONSTRAINT coach_time_off_block_type_check CHECK ((block_type = ANY (ARRAY['time_off'::text, 'admin_block'::text]))),
    CONSTRAINT coach_time_off_time_range_check CHECK ((((start_time IS NULL) AND (end_time IS NULL)) OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (start_time < end_time))))
);


ALTER TABLE public.coach_time_off OWNER TO postgres;

--
-- Name: coaches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coaches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text,
    profile_photo_url text,
    bio text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pin_hash text
);


ALTER TABLE public.coaches OWNER TO postgres;

--
-- Name: coupons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value integer NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0,
    valid_from timestamp with time zone DEFAULT now(),
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT coupons_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])))
);


ALTER TABLE public.coupons OWNER TO postgres;

--
-- Name: course_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    max_students integer NOT NULL,
    duration_minutes integer NOT NULL,
    is_fixed_schedule boolean DEFAULT false,
    is_open_enrollment boolean DEFAULT false,
    description text,
    color text DEFAULT '#0066CC'::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.course_types OWNER TO postgres;

--
-- Name: email_otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    otp_code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.email_otps OWNER TO postgres;

--
-- Name: invoice_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_seq OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    parent_id uuid,
    lesson_credit_id uuid,
    amount numeric(10,2) NOT NULL,
    payment_method text DEFAULT 'stripe'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    stripe_payment_intent_id text,
    notes text,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    student_id uuid,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text])))
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: lesson_credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lesson_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    purchase_id uuid,
    course_type_id uuid,
    total_credits integer NOT NULL,
    used_credits integer DEFAULT 0,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    parent_id uuid,
    stripe_session_id text,
    is_trial boolean DEFAULT false NOT NULL,
    converted_to_token_at timestamp with time zone
);


ALTER TABLE public.lesson_credits OWNER TO postgres;

--
-- Name: lesson_packages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lesson_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    lesson_count integer NOT NULL,
    price_cents integer NOT NULL,
    course_type_id uuid,
    description text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lesson_packages OWNER TO postgres;

--
-- Name: level_recommendations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.level_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    recommended_level integer NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    final_level integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    previous_recommended_level integer,
    CONSTRAINT level_recommendations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'modified'::text, 'rejected'::text])))
);


ALTER TABLE public.level_recommendations OWNER TO postgres;

--
-- Name: level_upgrades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.level_upgrades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    from_level integer NOT NULL,
    to_level integer NOT NULL,
    upgraded_by uuid,
    upgraded_at timestamp with time zone DEFAULT now(),
    notes text
);


ALTER TABLE public.level_upgrades OWNER TO postgres;

--
-- Name: levels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_number integer NOT NULL,
    name text NOT NULL,
    description text,
    badge_color text DEFAULT '#0066CC'::text,
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT levels_level_number_check CHECK (((level_number >= 1) AND (level_number <= 9)))
);


ALTER TABLE public.levels OWNER TO postgres;

--
-- Name: makeup_credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.makeup_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    booking_id uuid,
    course_type_id uuid,
    issued_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    used_at timestamp with time zone,
    used_booking_id uuid,
    status text DEFAULT 'available'::text,
    CONSTRAINT makeup_credits_status_check CHECK ((status = ANY (ARRAY['available'::text, 'used'::text, 'expired'::text])))
);


ALTER TABLE public.makeup_credits OWNER TO postgres;

--
-- Name: message_threads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.message_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    subject text,
    status text DEFAULT 'open'::text,
    last_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT message_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'closed'::text])))
);


ALTER TABLE public.message_threads OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['parent'::text, 'admin'::text, 'coach'::text])))
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    type text NOT NULL,
    category text NOT NULL,
    recipient text NOT NULL,
    subject text,
    body text,
    status text DEFAULT 'sent'::text,
    sent_at timestamp with time zone DEFAULT now(),
    error_message text,
    CONSTRAINT notification_log_category_check CHECK ((category = ANY (ARRAY['booking_confirmed'::text, 'booking_cancelled'::text, 'booking_changed'::text, 'reminder_24h'::text, 'waitlist_available'::text, 'level_upgrade'::text, 'invoice'::text, 'makeup_credit'::text, 'general'::text]))),
    CONSTRAINT notification_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'pending'::text]))),
    CONSTRAINT notification_log_type_check CHECK ((type = ANY (ARRAY['email'::text, 'sms'::text])))
);


ALTER TABLE public.notification_log OWNER TO postgres;

--
-- Name: parent_partnerships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.parent_partnerships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    initiator_parent_id uuid NOT NULL,
    partner_parent_id uuid NOT NULL,
    invite_code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT parent_partnerships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'revoked'::text])))
);


ALTER TABLE public.parent_partnerships OWNER TO postgres;

--
-- Name: parents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.parents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text,
    street_address text,
    city text,
    state text,
    zip_code text,
    waiver_signed boolean DEFAULT false,
    waiver_signed_at timestamp with time zone,
    emergency_contact_name text,
    emergency_contact_phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    registered_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    last_login_at timestamp with time zone,
    newsletter_subscribed boolean DEFAULT false,
    address_line1 text,
    address_line2 text,
    last_activity_at timestamp with time zone,
    activity_reviewed_at timestamp with time zone,
    terms_version text,
    waiver_accepted_at timestamp with time zone,
    waiver_version text,
    media_release_accepted boolean DEFAULT false NOT NULL,
    media_release_at timestamp with time zone
);


ALTER TABLE public.parents OWNER TO postgres;

--
-- Name: phone_otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.phone_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    otp_code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.phone_otps OWNER TO postgres;

--
-- Name: progress_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.progress_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    coach_id uuid,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    session_date date,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    class_session_id uuid,
    CONSTRAINT progress_history_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text])))
);


ALTER TABLE public.progress_history OWNER TO postgres;

--
-- Name: purchases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    student_id uuid,
    lesson_package_id uuid,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    amount_cents integer NOT NULL,
    discount_cents integer DEFAULT 0,
    coupon_code text,
    status text DEFAULT 'pending'::text,
    paid_at timestamp with time zone,
    invoice_sent_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    stripe_session_id text,
    amount numeric,
    payment_method text DEFAULT 'stripe_checkout'::text NOT NULL,
    recorded_by uuid,
    CONSTRAINT purchases_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text, 'failed'::text])))
);


ALTER TABLE public.purchases OWNER TO postgres;

--
-- Name: skills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.skills OWNER TO postgres;

--
-- Name: student_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    content text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.student_notes OWNER TO postgres;

--
-- Name: student_skill_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_skill_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    progress_percent integer DEFAULT 0,
    last_updated_by uuid,
    last_updated_at timestamp with time zone DEFAULT now(),
    notes text,
    CONSTRAINT student_skill_progress_progress_percent_check CHECK (((progress_percent >= 0) AND (progress_percent <= 100)))
);


ALTER TABLE public.student_skill_progress OWNER TO postgres;

--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    full_name text NOT NULL,
    date_of_birth date NOT NULL,
    gender text,
    current_level integer DEFAULT 1,
    medical_notes text,
    profile_photo_url text,
    qr_code text DEFAULT (gen_random_uuid())::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    trial_used_at timestamp with time zone,
    added_by_parent boolean DEFAULT false,
    legal_full_name text,
    uci_number text,
    service_code text,
    CONSTRAINT students_current_level_check CHECK (((current_level >= 1) AND (current_level <= 9))),
    CONSTRAINT students_sort_order_check CHECK (((sort_order >= 1) AND (sort_order <= 3)))
);


ALTER TABLE public.students OWNER TO postgres;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: team_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    team_tier_id uuid NOT NULL,
    practice_date date NOT NULL,
    start_time time without time zone NOT NULL,
    check_in_method text,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.team_attendance OWNER TO postgres;

--
-- Name: team_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    team_tier_id uuid NOT NULL,
    stripe_subscription_id text,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'cancelled'::text])))
);


ALTER TABLE public.team_memberships OWNER TO postgres;

--
-- Name: team_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    level_min integer NOT NULL,
    level_max integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT team_tiers_check CHECK ((level_min <= level_max))
);


ALTER TABLE public.team_tiers OWNER TO postgres;

--
-- Name: token_packages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.token_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    course_type_id uuid NOT NULL,
    total_tokens integer NOT NULL,
    used_tokens integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    source text NOT NULL,
    source_credit_id uuid,
    source_booking_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_packages_source_check CHECK ((source = ANY (ARRAY['expiry'::text, 'cancellation'::text, 'manual'::text, 'school_cancellation'::text]))),
    CONSTRAINT token_packages_total_tokens_check CHECK ((total_tokens > 0)),
    CONSTRAINT token_packages_used_tokens_check CHECK ((used_tokens >= 0))
);


ALTER TABLE public.token_packages OWNER TO postgres;

--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_session_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    student_id uuid NOT NULL,
    "position" integer NOT NULL,
    status text DEFAULT 'waiting'::text,
    notified_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT waitlist_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'notified'::text, 'booked'::text, 'expired'::text])))
);


ALTER TABLE public.waitlist OWNER TO postgres;

--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
)
PARTITION BY RANGE (inserted_at);


ALTER TABLE realtime.messages OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_19; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_19 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_19 OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_20; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_20 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_20 OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_21; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_21 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_21 OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_22; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_22 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_22 OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_23; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_23 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_23 OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_24; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_24 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_24 OWNER TO supabase_realtime_admin;

--
-- Name: messages_2026_07_25; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.messages_2026_07_25 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea,
    CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL)))
);


ALTER TABLE realtime.messages_2026_07_25 OWNER TO supabase_realtime_admin;

--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: supabase_admin
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


ALTER TABLE realtime.schema_migrations OWNER TO supabase_admin;

--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


ALTER TABLE realtime.subscription OWNER TO supabase_realtime_admin;

--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;

--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


ALTER TABLE storage.buckets_analytics OWNER TO supabase_storage_admin;

--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.buckets_vectors OWNER TO supabase_storage_admin;

--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE storage.migrations OWNER TO supabase_storage_admin;

--
-- Name: objects; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


ALTER TABLE storage.objects OWNER TO supabase_storage_admin;

--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: supabase_storage_admin
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


ALTER TABLE storage.s3_multipart_uploads OWNER TO supabase_storage_admin;

--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.s3_multipart_uploads_parts OWNER TO supabase_storage_admin;

--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE storage.vector_indexes OWNER TO supabase_storage_admin;

--
-- Name: messages_2026_07_19; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_19 FOR VALUES FROM ('2026-07-19 00:00:00') TO ('2026-07-20 00:00:00');


--
-- Name: messages_2026_07_20; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_20 FOR VALUES FROM ('2026-07-20 00:00:00') TO ('2026-07-21 00:00:00');


--
-- Name: messages_2026_07_21; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_21 FOR VALUES FROM ('2026-07-21 00:00:00') TO ('2026-07-22 00:00:00');


--
-- Name: messages_2026_07_22; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_22 FOR VALUES FROM ('2026-07-22 00:00:00') TO ('2026-07-23 00:00:00');


--
-- Name: messages_2026_07_23; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_23 FOR VALUES FROM ('2026-07-23 00:00:00') TO ('2026-07-24 00:00:00');


--
-- Name: messages_2026_07_24; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_24 FOR VALUES FROM ('2026-07-24 00:00:00') TO ('2026-07-25 00:00:00');


--
-- Name: messages_2026_07_25; Type: TABLE ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_07_25 FOR VALUES FROM ('2026-07-25 00:00:00') TO ('2026-07-26 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) FROM stdin;
\.


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.custom_oauth_providers (id, provider_type, identifier, name, client_id, client_secret, acceptable_client_ids, scopes, pkce_enabled, attribute_mapping, authorization_params, enabled, email_optional, issuer, discovery_url, skip_nonce_check, cached_discovery, discovery_cached_at, authorization_url, token_url, userinfo_url, jwks_uri, created_at, updated_at, custom_claims_allowlist) FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type, provider_access_token, provider_refresh_token, created_at, updated_at, authentication_method, auth_code_issued_at, invite_token, referrer, oauth_client_state_id, linking_target_id, email_optional) FROM stdin;
ab346347-82ff-494d-a1f0-1f1d99cb906e	416ffe2b-c010-4a5b-b1d3-72d2f20372f6	2bc9eeb6-a1f1-4200-a46f-76eeb110118d	s256	hk7edTeHZg1Y1iTVsHDfB2gJA2lUhL5UmvqZbVtuX4g	email			2026-06-11 18:45:44.438383+00	2026-06-11 18:45:44.438383+00	email/signup	\N	\N	\N	\N	\N	f
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;
c79771df-ca4c-4fa7-90e9-3faa379080f6	c79771df-ca4c-4fa7-90e9-3faa379080f6	{"sub": "c79771df-ca4c-4fa7-90e9-3faa379080f6", "email": "hsiaoyungchou@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-06-13 17:53:48.310785+00	2026-06-13 17:53:48.310843+00	2026-06-13 17:53:48.310843+00	235de7f7-0cc1-45d4-b9d5-580bbc1f80ba
a1e2b1c0-fa92-44d6-97da-52e6180031a1	a1e2b1c0-fa92-44d6-97da-52e6180031a1	{"sub": "a1e2b1c0-fa92-44d6-97da-52e6180031a1", "email": "shaioking@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-07-15 07:42:49.817815+00	2026-07-15 07:42:49.817916+00	2026-07-15 07:42:49.817916+00	9638a562-06fd-42ed-aa2d-6abdb16eb60e
0b084ecd-b4ae-4920-8aba-dde52ce531be	0b084ecd-b4ae-4920-8aba-dde52ce531be	{"sub": "0b084ecd-b4ae-4920-8aba-dde52ce531be", "email": "sportzimitzi@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-07-15 07:43:30.203746+00	2026-07-15 07:43:30.203815+00	2026-07-15 07:43:30.203815+00	4108bb93-8643-4f18-8f17-426b94433063
e38f39f6-0b14-48cf-87f0-ca3777069213	e38f39f6-0b14-48cf-87f0-ca3777069213	{"sub": "e38f39f6-0b14-48cf-87f0-ca3777069213", "email": "swimmingmitch@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-07-15 07:44:13.844774+00	2026-07-15 07:44:13.844828+00	2026-07-15 07:44:13.844828+00	24bcd26c-e820-4aab-ada0-3d87dfd95618
8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	{"sub": "8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7", "email": "wixmanta@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-07-15 08:00:21.408579+00	2026-07-15 08:00:21.408634+00	2026-07-15 08:00:21.408634+00	101c4e09-6507-40fe-858f-cf8235eeb070
6299be2d-8dd1-40d9-b83f-2e797ea4410b	6299be2d-8dd1-40d9-b83f-2e797ea4410b	{"sub": "6299be2d-8dd1-40d9-b83f-2e797ea4410b", "email": "mantamantatest1@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-07-15 08:22:04.72881+00	2026-07-15 08:22:04.728879+00	2026-07-15 08:22:04.728879+00	71ed19a6-dc42-49e6-a660-1e027f0afe34
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.instances (id, uuid, raw_base_config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_amr_claims (session_id, created_at, updated_at, authentication_method, id) FROM stdin;
2aafef11-1175-4407-982a-7a469d288969	2026-07-14 04:53:19.587956+00	2026-07-14 04:53:19.587956+00	password	1ab607c2-43cd-48bc-95d4-bcea9fa24e24
373a1f25-0b75-44fd-ba2e-b9eff6b8d0da	2026-07-15 08:00:21.465834+00	2026-07-15 08:00:21.465834+00	password	bd097b5d-2e19-4167-89e4-9c7ad42c3423
dd87ca60-67fc-402f-a97b-6cbc428cbde1	2026-07-15 08:22:04.794051+00	2026-07-15 08:22:04.794051+00	password	4cdc90ec-a970-4106-94be-b22693096f78
bcf19341-ac3f-4fad-83fb-46e32b899602	2026-07-18 21:33:25.571588+00	2026-07-18 21:33:25.571588+00	password	ac454036-a0b0-45fe-911b-b19bba35617b
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_challenges (id, factor_id, created_at, verified_at, ip_address, otp_code, web_authn_session_data) FROM stdin;
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, phone, last_challenged_at, web_authn_credential, web_authn_aaguid, last_webauthn_challenge_data) FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_authorizations (id, authorization_id, client_id, user_id, redirect_uri, scope, state, resource, code_challenge, code_challenge_method, response_type, status, authorization_code, created_at, expires_at, approved_at, nonce) FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_client_states (id, provider_type, code_verifier, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_clients (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, client_uri, logo_uri, created_at, updated_at, deleted_at, client_type, token_endpoint_auth_method) FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) FROM stdin;
00000000-0000-0000-0000-000000000000	989	bbb43mfjjysh	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 06:26:14.072319+00	2026-07-15 07:24:41.528266+00	q2pgybzzy3wm	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	993	xjgvwfttg5jg	6299be2d-8dd1-40d9-b83f-2e797ea4410b	t	2026-07-15 08:22:04.765482+00	2026-07-21 22:39:07.956662+00	\N	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	990	mmt3lm7m6eij	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 07:24:41.546204+00	2026-07-15 08:23:01.531832+00	bbb43mfjjysh	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	992	lduck4z62mv3	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-15 08:00:21.448079+00	2026-07-15 09:09:15.433446+00	\N	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	994	5iyeosz6hbbq	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 08:23:01.538631+00	2026-07-15 09:32:11.644975+00	mmt3lm7m6eij	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	995	kp7t7uwiziuo	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-15 09:09:15.451165+00	2026-07-15 10:35:17.741671+00	lduck4z62mv3	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	996	cfdwesk6hg5o	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 09:32:11.66096+00	2026-07-15 10:42:12.036216+00	5iyeosz6hbbq	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	998	rgqskuxdsmie	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 10:42:12.047678+00	2026-07-15 11:43:28.581534+00	cfdwesk6hg5o	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	999	emlaujuqg6vv	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 11:43:28.601795+00	2026-07-15 12:42:25.479152+00	rgqskuxdsmie	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1000	ggrjdmllnvkj	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 12:42:25.491259+00	2026-07-15 13:47:35.718516+00	emlaujuqg6vv	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1001	bjxgisroablm	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 13:47:35.732094+00	2026-07-15 14:48:40.715215+00	ggrjdmllnvkj	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1002	mwsxsgbp3rj7	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 14:48:40.723536+00	2026-07-15 15:50:41.623981+00	bjxgisroablm	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1003	2xkprymabknu	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 15:50:41.640707+00	2026-07-15 17:18:19.575163+00	mwsxsgbp3rj7	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1004	xvhqrw2kcopr	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 17:18:19.585698+00	2026-07-15 18:16:53.892139+00	2xkprymabknu	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	997	lrweifahlpi2	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-15 10:35:17.761829+00	2026-07-15 19:08:12.45485+00	kp7t7uwiziuo	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	969	u7zey73lojgk	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 04:53:19.582249+00	2026-07-14 05:55:12.126549+00	\N	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1005	ra4mjftdm2mu	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 18:16:53.907436+00	2026-07-15 19:15:21.919467+00	xvhqrw2kcopr	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	970	xr3vfdmrisrv	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 05:55:12.146987+00	2026-07-14 17:38:52.967039+00	u7zey73lojgk	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1006	x2v4ttaeyrpe	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-15 19:08:12.47036+00	2026-07-16 01:55:58.429045+00	lrweifahlpi2	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	971	n74sj5p3iau2	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 17:38:52.985103+00	2026-07-14 18:37:00.152193+00	xr3vfdmrisrv	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1007	rosyafiin37e	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 19:15:21.930607+00	2026-07-16 03:53:19.42016+00	ra4mjftdm2mu	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1008	pkdbhynoporu	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 01:55:58.450819+00	2026-07-16 03:53:19.420245+00	x2v4ttaeyrpe	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	973	64qz3cin6aw4	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 18:37:00.170711+00	2026-07-14 19:35:19.141105+00	n74sj5p3iau2	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	975	acr5y6pkytw2	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 19:35:19.156165+00	2026-07-14 20:33:46.64703+00	64qz3cin6aw4	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1009	mhvzqg5ed2ma	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 03:53:19.437822+00	2026-07-16 04:53:43.042213+00	pkdbhynoporu	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	976	passvkqtg2ms	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 20:33:46.669661+00	2026-07-14 21:35:34.891549+00	acr5y6pkytw2	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	977	y6qvnpco2x64	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 21:35:34.908432+00	2026-07-14 22:47:46.15175+00	passvkqtg2ms	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1011	e77w74thj6sh	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 04:53:43.059298+00	2026-07-16 06:07:08.927076+00	mhvzqg5ed2ma	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	978	iyxkmgdlvis4	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 22:47:46.167108+00	2026-07-14 23:57:06.559361+00	y6qvnpco2x64	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	979	jzhnxze6mmr6	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-14 23:57:06.565554+00	2026-07-15 01:00:46.361859+00	iyxkmgdlvis4	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1010	s7w3n3a7r2al	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-16 03:53:19.437406+00	2026-07-16 06:57:22.634527+00	rosyafiin37e	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	980	5wsonzpgrunj	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 01:00:46.374844+00	2026-07-15 02:07:23.887283+00	jzhnxze6mmr6	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	981	76sctpml5jiv	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 02:07:23.901534+00	2026-07-15 03:05:24.755742+00	5wsonzpgrunj	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1012	vzi2kfvkjvjd	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 06:07:08.936984+00	2026-07-16 07:17:53.870423+00	e77w74thj6sh	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1014	6wwzzgxglzqu	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 07:17:53.883033+00	2026-07-16 08:16:06.695319+00	vzi2kfvkjvjd	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	982	qdfqtwpqgxfa	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 03:05:24.780504+00	2026-07-15 04:22:34.243187+00	76sctpml5jiv	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1015	ns34uejsyixc	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 08:16:06.713585+00	2026-07-16 09:35:05.900767+00	6wwzzgxglzqu	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1016	xwe4tes5zv63	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 09:35:05.918652+00	2026-07-16 11:40:09.310776+00	ns34uejsyixc	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	985	ipeirdnrgx2m	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 04:22:34.244034+00	2026-07-15 05:26:27.919573+00	qdfqtwpqgxfa	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1017	k5xkgtr2ubcl	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 11:40:09.329749+00	2026-07-16 13:15:24.733131+00	xwe4tes5zv63	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	987	q2pgybzzy3wm	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-15 05:26:27.93008+00	2026-07-15 06:26:14.064962+00	ipeirdnrgx2m	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1018	i7ro4t5fkhab	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 13:15:24.755969+00	2026-07-16 14:58:43.135812+00	k5xkgtr2ubcl	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1019	pbcu3t2ujsti	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 14:58:43.145115+00	2026-07-16 16:39:08.286213+00	i7ro4t5fkhab	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1020	j6bnkir2z5wp	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 16:39:08.301006+00	2026-07-16 18:23:45.598215+00	pbcu3t2ujsti	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1013	3bgxxw7ng5od	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-16 06:57:22.64337+00	2026-07-16 18:31:21.755989+00	s7w3n3a7r2al	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1021	733xwepkmoih	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 18:23:45.610082+00	2026-07-16 19:22:21.894635+00	j6bnkir2z5wp	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1022	bfefgl6bjcxl	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-16 18:31:21.770178+00	2026-07-16 19:36:00.907564+00	3bgxxw7ng5od	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1023	enk55qdtr6qo	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 19:22:21.907026+00	2026-07-16 21:13:12.806113+00	733xwepkmoih	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1024	xole7gnnvsz2	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-16 19:36:00.912075+00	2026-07-16 22:01:38.900446+00	bfefgl6bjcxl	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1025	bpyzlxkwcztz	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 21:13:12.831631+00	2026-07-16 22:11:15.003597+00	enk55qdtr6qo	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1051	qiijzgsxmw2e	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 14:49:08.489472+00	2026-07-17 15:48:03.636627+00	zkbi2fodtv4o	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1052	tbs6of4lml7k	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 15:25:20.999635+00	2026-07-17 16:28:31.144924+00	dxgreq7obhh7	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1027	zij7nlvcqmza	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 22:11:15.017802+00	2026-07-16 23:09:25.717927+00	bpyzlxkwcztz	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1132	5awefoowb5vo	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 15:21:10.376528+00	2026-07-19 16:33:28.584634+00	orrlw4v7tfdd	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1028	y46gdhcng5wx	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-16 23:09:25.72717+00	2026-07-17 00:12:29.373568+00	zij7nlvcqmza	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1053	gjmdaxzqqx2g	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 15:48:03.644417+00	2026-07-17 17:25:18.952009+00	qiijzgsxmw2e	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1029	p7rqqfh4f3mv	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 00:12:29.387697+00	2026-07-17 01:13:28.785395+00	y46gdhcng5wx	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1030	5jxyt6qn3ymh	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 01:13:28.80032+00	2026-07-17 02:15:44.837447+00	p7rqqfh4f3mv	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1054	wxfsi5vljuhx	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 16:28:31.157277+00	2026-07-17 17:32:40.105968+00	tbs6of4lml7k	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1031	2czjgzftqark	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 02:15:44.850254+00	2026-07-17 03:14:10.676566+00	5jxyt6qn3ymh	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1032	ji3xaixs7hju	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 03:14:10.686989+00	2026-07-17 04:15:33.2826+00	2czjgzftqark	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1055	3oqhosq2s7ld	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 17:25:18.960826+00	2026-07-17 18:23:39.822731+00	gjmdaxzqqx2g	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1033	a7lwqubixsdw	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 04:15:33.299241+00	2026-07-17 05:17:16.957524+00	ji3xaixs7hju	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1034	qyg73a527gh6	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 05:17:16.975901+00	2026-07-17 06:15:37.996437+00	a7lwqubixsdw	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1056	jxtmcpjivcmn	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 17:32:40.11434+00	2026-07-17 18:31:04.892328+00	wxfsi5vljuhx	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1035	eg3p3gynljho	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 06:15:38.007546+00	2026-07-17 07:13:52.968111+00	qyg73a527gh6	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1026	ix3cjprinnk2	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-16 22:01:38.912856+00	2026-07-17 07:32:57.595699+00	xole7gnnvsz2	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1057	24t3p7lpcn4v	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 18:23:39.840174+00	2026-07-17 19:21:50.679046+00	3oqhosq2s7ld	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1036	gy3xgkuhriaj	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 07:13:52.983091+00	2026-07-17 08:12:22.378654+00	eg3p3gynljho	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1037	iysq6iofyv4b	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 07:32:57.614064+00	2026-07-17 08:32:40.409926+00	ix3cjprinnk2	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1058	lv4k46qyc7ng	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 18:31:04.900508+00	2026-07-17 19:29:18.024657+00	jxtmcpjivcmn	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1038	zxssekjntyej	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 08:12:22.389333+00	2026-07-17 09:17:07.41631+00	gy3xgkuhriaj	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1039	dtz2h3dzy3lb	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 08:32:40.428471+00	2026-07-17 09:33:40.704034+00	iysq6iofyv4b	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1059	yipobmoc5tr5	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 19:21:50.689222+00	2026-07-17 20:20:08.800199+00	24t3p7lpcn4v	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1040	grczz2v5nldb	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 09:17:07.439537+00	2026-07-17 10:19:13.723857+00	zxssekjntyej	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1041	md5r5f3gwwld	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 09:33:40.715462+00	2026-07-17 10:35:46.851919+00	dtz2h3dzy3lb	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1060	mp54b4dxjj5q	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 19:29:18.03646+00	2026-07-17 20:27:20.212722+00	lv4k46qyc7ng	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1042	szndodu4rou6	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 10:19:13.73629+00	2026-07-17 11:19:11.355523+00	grczz2v5nldb	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1043	kmbqgfqomebq	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 10:35:46.865195+00	2026-07-17 11:35:48.513231+00	md5r5f3gwwld	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1061	kdghkdga6r7t	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 20:20:08.80899+00	2026-07-17 21:19:46.16565+00	yipobmoc5tr5	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1044	tgwgcjevaopl	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 11:19:11.366342+00	2026-07-17 12:23:19.340682+00	szndodu4rou6	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1045	cxqyll33qtmx	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 11:35:48.517483+00	2026-07-17 12:40:55.447172+00	kmbqgfqomebq	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1062	z3vqwkj3wvof	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 20:27:20.220688+00	2026-07-17 21:25:36.035163+00	mp54b4dxjj5q	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1046	epw6f5fgbckv	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 12:23:19.346634+00	2026-07-17 13:25:21.6377+00	tgwgcjevaopl	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1047	ynu4xau7b5bh	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 12:40:55.460023+00	2026-07-17 13:46:07.728155+00	cxqyll33qtmx	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1063	we7eej4ry7y2	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 21:19:46.18228+00	2026-07-17 22:21:11.682152+00	kdghkdga6r7t	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1048	6efjlznrthqe	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 13:25:21.648942+00	2026-07-17 14:25:09.428021+00	epw6f5fgbckv	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1049	zkbi2fodtv4o	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 13:46:07.733767+00	2026-07-17 14:49:08.482638+00	ynu4xau7b5bh	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1050	dxgreq7obhh7	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 14:25:09.439918+00	2026-07-17 15:25:20.993359+00	6efjlznrthqe	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1064	zfspgcdn3dgg	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 21:25:36.047339+00	2026-07-17 22:24:27.881621+00	z3vqwkj3wvof	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1065	4x4kciy7fzjz	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 22:21:11.700324+00	2026-07-17 23:20:04.573047+00	we7eej4ry7y2	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1066	cals5aatlptf	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 22:24:27.889384+00	2026-07-17 23:23:16.682259+00	zfspgcdn3dgg	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1067	ijttgdb46zq2	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-17 23:20:04.589211+00	2026-07-18 00:22:12.96903+00	4x4kciy7fzjz	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1068	xm7iriysnaly	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-17 23:23:16.688076+00	2026-07-18 00:24:13.919707+00	cals5aatlptf	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1070	jbp26mwr3x2h	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 00:24:13.923978+00	2026-07-18 01:25:16.400051+00	xm7iriysnaly	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1069	l7z7xxbadenu	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 00:22:12.982942+00	2026-07-18 01:27:18.254742+00	ijttgdb46zq2	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1071	g7uftcsf7zny	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 01:25:16.414162+00	2026-07-18 02:23:47.155833+00	jbp26mwr3x2h	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1072	3rsqjh7p3bvh	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 01:27:18.263972+00	2026-07-18 02:25:41.047817+00	l7z7xxbadenu	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1073	vru5sylop466	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 02:23:47.17361+00	2026-07-18 03:21:51.47522+00	g7uftcsf7zny	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1074	rnogkkpvyjbo	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 02:25:41.059006+00	2026-07-18 03:24:03.278765+00	3rsqjh7p3bvh	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1075	62fmla7s4y75	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 03:21:51.490973+00	2026-07-18 04:23:56.156065+00	vru5sylop466	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1076	kszisqurkfc3	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 03:24:03.292235+00	2026-07-18 04:23:25.997967+00	rnogkkpvyjbo	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1122	br3gdk7grb6n	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-19 05:06:40.722188+00	2026-07-20 22:34:11.572646+00	yn6rt6htbiqd	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1077	ye2xid32m4l6	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 04:23:26.009925+00	2026-07-18 05:22:26.015143+00	kszisqurkfc3	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1078	hoj4h5fhllvs	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 04:23:56.160096+00	2026-07-18 05:24:34.076697+00	62fmla7s4y75	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1079	bqrhpah6m4jn	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 05:22:26.028252+00	2026-07-18 06:21:47.899596+00	ye2xid32m4l6	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1080	xnfd6mn6imeh	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 05:24:34.088595+00	2026-07-18 06:25:18.211189+00	hoj4h5fhllvs	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1081	d63sq44yendc	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 06:21:47.909453+00	2026-07-18 07:19:56.599966+00	bqrhpah6m4jn	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1082	3y2bhkfksmwr	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 06:25:18.22007+00	2026-07-18 07:23:25.93906+00	xnfd6mn6imeh	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1083	qvlicwnfpkc3	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 07:19:56.618676+00	2026-07-18 08:19:10.875319+00	d63sq44yendc	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1084	vxddrqpph6ld	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 07:23:25.947728+00	2026-07-18 08:25:24.337148+00	3y2bhkfksmwr	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1085	rzfvgvgmm754	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 08:19:10.89086+00	2026-07-18 09:18:05.193669+00	qvlicwnfpkc3	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1086	5lfbry6jd7ks	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 08:25:24.345071+00	2026-07-18 09:27:28.787548+00	vxddrqpph6ld	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1087	wsxiyxd7ziqn	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 09:18:05.210073+00	2026-07-18 10:19:10.059096+00	rzfvgvgmm754	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1088	mojghby7ivxp	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 09:27:28.795359+00	2026-07-18 10:27:21.640429+00	5lfbry6jd7ks	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1089	7dtf64tc6ryz	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 10:19:10.075644+00	2026-07-18 11:17:14.806073+00	wsxiyxd7ziqn	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1090	pfkslsoqmyjp	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 10:27:21.64671+00	2026-07-18 11:26:33.497048+00	mojghby7ivxp	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1091	jekllbzpal3t	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 11:17:14.820395+00	2026-07-18 12:17:15.032548+00	7dtf64tc6ryz	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1092	5txp32urupqj	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 11:26:33.50278+00	2026-07-18 12:27:32.785005+00	pfkslsoqmyjp	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1093	rl4qlkelcyak	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 12:17:15.044319+00	2026-07-18 13:15:58.803529+00	jekllbzpal3t	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1094	gpawnkw7sjw4	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 12:27:32.794282+00	2026-07-18 13:29:39.061881+00	5txp32urupqj	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1095	r4ynaat7sihr	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 13:15:58.817877+00	2026-07-18 14:14:02.63188+00	rl4qlkelcyak	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1096	d2ce4lk6g7ny	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 13:29:39.067356+00	2026-07-18 14:28:33.142537+00	gpawnkw7sjw4	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1097	brc4deo3omsq	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 14:14:02.644401+00	2026-07-18 15:15:11.441734+00	r4ynaat7sihr	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1098	cdrucywzbuln	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 14:28:33.15157+00	2026-07-18 15:27:31.557099+00	d2ce4lk6g7ny	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1099	xnipem4mjbdl	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 15:15:11.453517+00	2026-07-18 16:15:09.214669+00	brc4deo3omsq	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1100	teke6fyhjahk	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 15:27:31.563866+00	2026-07-18 16:26:30.523935+00	cdrucywzbuln	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1101	bsbcgyi5jyn3	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 16:15:09.226176+00	2026-07-18 17:18:15.72859+00	xnipem4mjbdl	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1102	ww456zhuol25	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 16:26:30.531789+00	2026-07-18 17:25:25.348979+00	teke6fyhjahk	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1103	olfuj7utzxor	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 17:18:15.740822+00	2026-07-18 18:19:12.45019+00	bsbcgyi5jyn3	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1104	cfiybizbi66d	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 17:25:25.354151+00	2026-07-18 18:26:27.803801+00	ww456zhuol25	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1105	efmh6cdkv5yv	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 18:19:12.466092+00	2026-07-18 19:18:05.474537+00	olfuj7utzxor	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1106	6qogwsflqwh5	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 18:26:27.810536+00	2026-07-18 19:27:33.904658+00	cfiybizbi66d	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1108	fguc3isz6bny	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 19:27:33.912852+00	2026-07-18 20:26:27.442586+00	6qogwsflqwh5	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1107	2fp76rr2ivf5	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 19:18:05.486232+00	2026-07-18 21:07:09.717949+00	efmh6cdkv5yv	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1109	dsumj4udxz4q	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 20:26:27.454915+00	2026-07-18 21:24:38.673363+00	fguc3isz6bny	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1112	2e4qmmdh64cl	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	f	2026-07-18 21:33:25.559558+00	2026-07-18 21:33:25.559558+00	\N	bcf19341-ac3f-4fad-83fb-46e32b899602
00000000-0000-0000-0000-000000000000	1111	d3lbui4qfsn7	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 21:24:38.686259+00	2026-07-18 22:26:25.414239+00	dsumj4udxz4q	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1113	ytur4j3io7kx	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 22:26:25.425705+00	2026-07-18 23:27:54.27797+00	d3lbui4qfsn7	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1114	kdpffmjbbbii	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-18 23:27:54.289692+00	2026-07-19 00:25:56.449286+00	ytur4j3io7kx	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1115	32mkkycwpi3s	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 00:25:56.46369+00	2026-07-19 01:36:10.158127+00	kdpffmjbbbii	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1116	7jrlfoo3vuw7	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 01:36:10.170385+00	2026-07-19 02:41:16.596367+00	32mkkycwpi3s	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1110	ec7bx7mqe2wy	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-18 21:07:09.729646+00	2026-07-19 03:10:22.672581+00	2fp76rr2ivf5	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1117	kwlcova4t2xm	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 02:41:16.606756+00	2026-07-19 03:39:20.42595+00	7jrlfoo3vuw7	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1118	xdvckv4xig45	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-19 03:10:22.68073+00	2026-07-19 04:08:27.040497+00	ec7bx7mqe2wy	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1119	t7a45eom7gty	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 03:39:20.435119+00	2026-07-19 04:37:45.492529+00	kwlcova4t2xm	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1120	yn6rt6htbiqd	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-19 04:08:27.058662+00	2026-07-19 05:06:40.703306+00	xdvckv4xig45	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1121	j74kewmzsmig	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 04:37:45.503101+00	2026-07-19 05:35:49.701183+00	t7a45eom7gty	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1123	uzxgqfm5b6zf	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 05:35:49.713821+00	2026-07-19 06:37:52.527158+00	j74kewmzsmig	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1124	7m74ae7p4qxg	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 06:37:52.541545+00	2026-07-19 07:37:53.29815+00	uzxgqfm5b6zf	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1125	ruiuaqgsmnhg	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 07:37:53.305741+00	2026-07-19 08:36:51.276398+00	7m74ae7p4qxg	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1131	orrlw4v7tfdd	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 14:14:01.182425+00	2026-07-19 15:21:10.356508+00	jsxcpuv5f332	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1126	g4n6isvjysyn	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 08:36:51.288631+00	2026-07-19 10:08:54.706898+00	ruiuaqgsmnhg	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1133	vs5xbnzkfjv2	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 16:33:28.597959+00	2026-07-19 17:38:47.958223+00	5awefoowb5vo	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1127	gfzesd52dp7o	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 10:08:54.727113+00	2026-07-19 11:08:53.611562+00	g4n6isvjysyn	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1128	osbgf4pbg3yq	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 11:08:53.625085+00	2026-07-19 12:10:58.936094+00	gfzesd52dp7o	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1134	pa3qzr6zeydd	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 17:38:47.97081+00	2026-07-19 19:43:10.565834+00	vs5xbnzkfjv2	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1129	unhlnehj644x	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 12:10:58.953024+00	2026-07-19 13:15:00.688924+00	osbgf4pbg3yq	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1130	jsxcpuv5f332	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 13:15:00.701303+00	2026-07-19 14:14:01.168191+00	unhlnehj644x	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1135	2jibmz7op5xk	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 19:43:10.585698+00	2026-07-19 21:48:57.928423+00	pa3qzr6zeydd	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1136	t6ao6rs35vo3	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 21:48:57.942453+00	2026-07-19 23:48:04.868827+00	2jibmz7op5xk	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1137	2wh67l4zdawq	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-19 23:48:04.890536+00	2026-07-20 01:24:15.850668+00	t6ao6rs35vo3	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1138	edmv7mhr7zni	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 01:24:15.867626+00	2026-07-20 02:59:53.374728+00	2wh67l4zdawq	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1139	mdxfpvdnxynq	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 02:59:53.385043+00	2026-07-20 05:27:19.698509+00	edmv7mhr7zni	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1140	b5xg3rrlodix	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 05:27:19.717791+00	2026-07-20 08:29:20.384629+00	mdxfpvdnxynq	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1141	c5v3zeb2nfgp	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 08:29:20.397504+00	2026-07-20 10:22:03.006369+00	b5xg3rrlodix	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1142	juwezq52ifvh	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 10:22:03.031487+00	2026-07-20 11:38:31.663949+00	c5v3zeb2nfgp	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1143	2wiuin24dntb	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 11:38:31.674219+00	2026-07-20 12:41:37.31264+00	juwezq52ifvh	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1144	b3ejhtf5yfbc	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 12:41:37.333021+00	2026-07-20 13:55:01.670815+00	2wiuin24dntb	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1145	3d6qf4ignto6	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 13:55:01.690244+00	2026-07-20 16:30:11.204276+00	b3ejhtf5yfbc	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1146	666t2ckfutkw	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 16:30:11.224537+00	2026-07-20 17:43:50.235647+00	3d6qf4ignto6	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1147	yzc64kcd4ah6	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 17:43:50.247375+00	2026-07-20 21:04:15.251149+00	666t2ckfutkw	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1148	wglpn5qt7oxj	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 21:04:15.276189+00	2026-07-20 22:19:24.18714+00	yzc64kcd4ah6	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1149	37aytp3a44vl	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 22:19:24.195437+00	2026-07-20 23:17:35.142033+00	wglpn5qt7oxj	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1150	2wuyz6zx7qia	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-20 22:34:11.58314+00	2026-07-20 23:32:35.051297+00	br3gdk7grb6n	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1151	3ne2ayigrtvz	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-20 23:17:35.153188+00	2026-07-21 00:15:36.653371+00	37aytp3a44vl	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1152	g2gbcdnnd4f3	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-20 23:32:35.06768+00	2026-07-21 00:31:01.622095+00	2wuyz6zx7qia	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1153	p5hhjzkuxfa3	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 00:15:36.665357+00	2026-07-21 01:13:57.740022+00	3ne2ayigrtvz	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1154	ec5yefswmbwg	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 00:31:01.63581+00	2026-07-21 01:29:12.00365+00	g2gbcdnnd4f3	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1155	hgozpkrar6gf	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 01:13:57.755871+00	2026-07-21 02:12:07.162082+00	p5hhjzkuxfa3	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1156	smp5o7trnqbr	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 01:29:12.014352+00	2026-07-21 02:27:41.315734+00	ec5yefswmbwg	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1157	n5omvuzmji7b	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 02:12:07.174462+00	2026-07-21 03:10:37.743224+00	hgozpkrar6gf	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1158	jwmjmer67h26	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 02:27:41.321194+00	2026-07-21 03:26:03.783608+00	smp5o7trnqbr	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1159	hlpugbm5tozs	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 03:10:37.760253+00	2026-07-21 04:09:06.546249+00	n5omvuzmji7b	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1160	nsrwkibwunld	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 03:26:03.794289+00	2026-07-21 04:24:07.551153+00	jwmjmer67h26	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1161	trxkhmyze4eb	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 04:09:06.557814+00	2026-07-21 05:07:41.433371+00	hlpugbm5tozs	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1163	yybo4svxxmk5	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 05:07:41.444186+00	2026-07-21 06:06:06.162579+00	trxkhmyze4eb	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1162	prrd2whjdtya	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 04:24:07.561678+00	2026-07-21 06:07:36.468728+00	nsrwkibwunld	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1164	52hptmz6vgwr	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 06:06:06.171483+00	2026-07-21 07:07:17.111621+00	yybo4svxxmk5	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1165	wakbjzaqvs3b	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 06:07:36.47571+00	2026-07-21 07:08:19.824911+00	prrd2whjdtya	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1166	5uinebgsxy6e	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 07:07:17.126221+00	2026-07-21 08:08:16.675977+00	52hptmz6vgwr	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1167	wilcvlhhruqn	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 07:08:19.835443+00	2026-07-21 08:12:21.682556+00	wakbjzaqvs3b	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1168	amnkvjefrf5n	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 08:08:16.690312+00	2026-07-21 09:08:15.1708+00	5uinebgsxy6e	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1169	udwikywijk3t	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 08:12:21.695455+00	2026-07-21 09:14:26.122314+00	wilcvlhhruqn	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1170	faj5am6xlumj	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 09:08:15.178953+00	2026-07-21 10:11:18.531637+00	amnkvjefrf5n	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1171	qfm35anaezys	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 09:14:26.132701+00	2026-07-21 10:15:27.404409+00	udwikywijk3t	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1172	xl3wmmuzqpqv	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 10:11:18.549679+00	2026-07-21 11:12:25.143997+00	faj5am6xlumj	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1173	rppqptb75oyf	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 10:15:27.410677+00	2026-07-21 11:17:29.163517+00	qfm35anaezys	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1174	i43km6ily4r2	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 11:12:25.15596+00	2026-07-21 12:13:21.789189+00	xl3wmmuzqpqv	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1175	26wdzcrc4kqq	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 11:17:29.173204+00	2026-07-21 12:18:30.274273+00	rppqptb75oyf	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1176	zmxim4f7m264	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 12:13:21.801984+00	2026-07-21 13:12:22.11629+00	i43km6ily4r2	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1177	btz65fxm7ret	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 12:18:30.278938+00	2026-07-21 13:19:38.366942+00	26wdzcrc4kqq	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1178	3m5mdbvlowof	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 13:12:22.128924+00	2026-07-21 14:14:23.671026+00	zmxim4f7m264	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1179	jna764ihkjoq	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 13:19:38.37634+00	2026-07-21 14:20:32.534767+00	btz65fxm7ret	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1180	ifsfmbvvs4nj	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 14:14:23.685775+00	2026-07-21 15:17:29.611424+00	3m5mdbvlowof	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1181	boxddcv772cb	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 14:20:32.542762+00	2026-07-21 15:21:34.274311+00	jna764ihkjoq	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1182	mj2yed76oe4m	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 15:17:29.624976+00	2026-07-21 16:20:30.756097+00	ifsfmbvvs4nj	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1183	2ylk5f46sebe	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 15:21:34.288461+00	2026-07-21 16:21:38.166053+00	boxddcv772cb	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1185	didj7i3l4ans	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 16:21:38.174601+00	2026-07-21 17:53:35.762697+00	2ylk5f46sebe	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1184	bgugc6tvw2fp	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 16:20:30.769938+00	2026-07-21 17:53:35.763242+00	mj2yed76oe4m	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1186	rlhbfss6bzbn	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 17:53:35.784602+00	2026-07-21 18:52:03.707595+00	bgugc6tvw2fp	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1187	hqfcomyeberc	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 17:53:35.784739+00	2026-07-21 19:16:13.359326+00	didj7i3l4ans	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1188	yikk5xxpqu3m	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 18:52:03.716694+00	2026-07-21 19:50:43.749092+00	rlhbfss6bzbn	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1189	6ipxdvibuvbz	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 19:16:13.371159+00	2026-07-21 20:14:26.406811+00	hqfcomyeberc	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1190	xjzoqfr2rbxr	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 19:50:43.757866+00	2026-07-21 20:48:50.053201+00	yikk5xxpqu3m	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1191	lmvvvisyef5k	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 20:14:26.417531+00	2026-07-21 21:13:40.10165+00	6ipxdvibuvbz	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1192	g6l3tbbafhvm	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 20:48:50.066367+00	2026-07-21 21:46:51.015966+00	xjzoqfr2rbxr	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1193	ilkawrvhkhqx	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 21:13:40.114767+00	2026-07-21 22:12:34.324388+00	lmvvvisyef5k	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1194	qojjejttgb27	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 21:46:51.029041+00	2026-07-21 22:45:07.765601+00	g6l3tbbafhvm	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1195	cin7onepmppb	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 22:12:34.336463+00	2026-07-21 23:10:47.147111+00	ilkawrvhkhqx	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1196	627ruyeln2jw	6299be2d-8dd1-40d9-b83f-2e797ea4410b	t	2026-07-21 22:39:07.966845+00	2026-07-21 23:37:12.833021+00	xjgvwfttg5jg	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	1197	hrjmvpcqp7kn	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 22:45:07.777321+00	2026-07-21 23:43:45.701227+00	qojjejttgb27	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1198	atdvivge3t7b	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-21 23:10:47.162308+00	2026-07-22 00:10:10.761058+00	cin7onepmppb	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1199	2us3vxkwnmcn	6299be2d-8dd1-40d9-b83f-2e797ea4410b	t	2026-07-21 23:37:12.851169+00	2026-07-22 00:35:14.485573+00	627ruyeln2jw	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	1200	jdundecxxsby	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-21 23:43:45.710335+00	2026-07-22 00:41:58.457462+00	hrjmvpcqp7kn	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1201	wmtr7znmaidc	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-22 00:10:10.779183+00	2026-07-22 01:24:23.8053+00	atdvivge3t7b	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1202	wrnu7qp67nol	6299be2d-8dd1-40d9-b83f-2e797ea4410b	t	2026-07-22 00:35:14.499966+00	2026-07-22 01:34:08.636674+00	2us3vxkwnmcn	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	1203	hsjo2ob5rxy5	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-22 00:41:58.463985+00	2026-07-22 01:43:38.213916+00	jdundecxxsby	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1204	km2vsy5qhsgn	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-22 01:24:23.824197+00	2026-07-22 02:22:40.396945+00	wmtr7znmaidc	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1205	3gqty64wa4f3	6299be2d-8dd1-40d9-b83f-2e797ea4410b	t	2026-07-22 01:34:08.646142+00	2026-07-22 02:32:32.60492+00	wrnu7qp67nol	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	1206	t7xtgvw6xyxf	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-22 01:43:38.220717+00	2026-07-22 02:41:46.455278+00	hsjo2ob5rxy5	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1207	bvbdqfqryijr	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-22 02:22:40.411799+00	2026-07-22 03:20:57.541574+00	km2vsy5qhsgn	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1208	w5pzoc3rk6es	6299be2d-8dd1-40d9-b83f-2e797ea4410b	t	2026-07-22 02:32:32.624035+00	2026-07-22 03:31:50.901294+00	3gqty64wa4f3	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	1211	vhkrymaindtg	6299be2d-8dd1-40d9-b83f-2e797ea4410b	f	2026-07-22 03:31:50.910146+00	2026-07-22 03:31:50.910146+00	w5pzoc3rk6es	dd87ca60-67fc-402f-a97b-6cbc428cbde1
00000000-0000-0000-0000-000000000000	1209	kqebjpuaacba	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	t	2026-07-22 02:41:46.46594+00	2026-07-22 03:41:05.056972+00	t7xtgvw6xyxf	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1212	ynxngmaphili	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	f	2026-07-22 03:41:05.062863+00	2026-07-22 03:41:05.062863+00	kqebjpuaacba	373a1f25-0b75-44fd-ba2e-b9eff6b8d0da
00000000-0000-0000-0000-000000000000	1210	jkc6jm35xl7g	c79771df-ca4c-4fa7-90e9-3faa379080f6	t	2026-07-22 03:20:57.555664+00	2026-07-22 04:19:29.551317+00	bvbdqfqryijr	2aafef11-1175-4407-982a-7a469d288969
00000000-0000-0000-0000-000000000000	1213	nj56n6tjaqw4	c79771df-ca4c-4fa7-90e9-3faa379080f6	f	2026-07-22 04:19:29.559913+00	2026-07-22 04:19:29.559913+00	jkc6jm35xl7g	2aafef11-1175-4407-982a-7a469d288969
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.saml_providers (id, sso_provider_id, entity_id, metadata_xml, metadata_url, attribute_mapping, created_at, updated_at, name_id_format) FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.saml_relay_states (id, sso_provider_id, request_id, for_email, redirect_to, created_at, updated_at, flow_state_id) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
20240612123726
20240729123726
20240802193726
20240806073726
20241009103726
20250717082212
20250731150234
20250804100000
20250901200500
20250903112500
20250904133000
20250925093508
20251007112900
20251104100000
20251111201300
20251201000000
20260115000000
20260121000000
20260219120000
20260302000000
20260625000000
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes) FROM stdin;
bcf19341-ac3f-4fad-83fb-46e32b899602	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	2026-07-18 21:33:25.541478+00	2026-07-18 21:33:25.541478+00	\N	aal1	\N	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	76.32.33.125	\N	\N	\N	\N	\N
dd87ca60-67fc-402f-a97b-6cbc428cbde1	6299be2d-8dd1-40d9-b83f-2e797ea4410b	2026-07-15 08:22:04.749981+00	2026-07-22 03:31:50.944109+00	\N	aal1	\N	2026-07-22 03:31:50.931495	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	76.32.33.125	\N	\N	\N	\N	\N
373a1f25-0b75-44fd-ba2e-b9eff6b8d0da	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	2026-07-15 08:00:21.434698+00	2026-07-22 03:41:05.080495+00	\N	aal1	\N	2026-07-22 03:41:05.080376	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15	76.32.33.125	\N	\N	\N	\N	\N
2aafef11-1175-4407-982a-7a469d288969	c79771df-ca4c-4fa7-90e9-3faa379080f6	2026-07-14 04:53:19.571649+00	2026-07-22 04:19:29.570602+00	\N	aal1	\N	2026-07-22 04:19:29.570507	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36	76.32.33.125	\N	\N	\N	\N	\N
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sso_domains (id, sso_provider_id, domain, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.sso_providers (id, resource_id, created_at, updated_at, disabled) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
00000000-0000-0000-0000-000000000000	e38f39f6-0b14-48cf-87f0-ca3777069213	authenticated	authenticated	swimmingmitch@gmail.com	$2a$10$AgYsIQat8JAXCcS2nIWope6gsVG8kpqaUdj.BmH70rhFbXe5iyP/C	2026-07-15 07:44:13.84635+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"email_verified": true}	\N	2026-07-15 07:44:13.842824+00	2026-07-15 07:44:13.847091+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	a1e2b1c0-fa92-44d6-97da-52e6180031a1	authenticated	authenticated	shaioking@gmail.com	$2a$10$UVrfirF3C56xf7vYADz1VeqfSs7qyJt70hft7FOjHXTDeGGuPm.rW	2026-07-15 07:42:49.828513+00	\N		\N		2026-07-15 07:44:57.601293+00			\N	2026-07-15 07:44:58.066184+00	{"provider": "email", "providers": ["email"]}	{"email_verified": true}	\N	2026-07-15 07:42:49.805706+00	2026-07-15 07:44:58.089703+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	0b084ecd-b4ae-4920-8aba-dde52ce531be	authenticated	authenticated	sportzimitzi@gmail.com	$2a$10$KCk7CbnaPp.8FBN9ruxMKOOi7e9XJypRwwIbjICi7tIzJef6VKCx6	2026-07-15 07:43:30.208788+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"email_verified": true}	\N	2026-07-15 07:43:30.188774+00	2026-07-15 07:43:30.20958+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	6299be2d-8dd1-40d9-b83f-2e797ea4410b	authenticated	authenticated	mantamantatest1@gmail.com	$2a$10$dUeY05OwhnnBMem2MfYmzeuseVerDGTj62jfGnZ7HBqwh4y5LUodi	2026-07-15 08:22:04.739327+00	\N		\N		\N			\N	2026-07-15 08:22:04.74986+00	{"provider": "email", "providers": ["email"]}	{"sub": "6299be2d-8dd1-40d9-b83f-2e797ea4410b", "email": "mantamantatest1@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-07-15 08:22:04.694121+00	2026-07-22 03:31:50.914999+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	authenticated	authenticated	wixmanta@gmail.com	$2a$10$bOnOIBl23FwBOzlC4/Bfb.sQdQOI22jqSDLK9wnfjPVzZaFIunTrG	2026-07-15 08:00:21.420335+00	\N		\N		\N			\N	2026-07-18 21:33:25.540249+00	{"provider": "email", "providers": ["email"]}	{"sub": "8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7", "email": "wixmanta@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-07-15 08:00:21.373009+00	2026-07-22 03:41:05.068086+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	c79771df-ca4c-4fa7-90e9-3faa379080f6	authenticated	authenticated	hsiaoyungchou@gmail.com	$2a$10$dcMW59CRICrk3PRBgjg23.nPxLnmbMnNtYZu6ktAfwLxsRzN/afji	2026-06-13 17:53:48.315081+00	\N		\N		\N			\N	2026-07-14 04:53:19.571555+00	{"provider": "email", "providers": ["email"]}	{"sub": "c79771df-ca4c-4fa7-90e9-3faa379080f6", "email": "hsiaoyungchou@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-06-13 17:53:48.29684+00	2026-07-22 04:19:29.56638+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.webauthn_challenges (id, user_id, challenge_type, session_data, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.webauthn_credentials (id, user_id, credential_id, public_key, attestation_type, aaguid, sign_count, transports, backup_eligible, backed_up, friendly_name, created_at, updated_at, last_used_at) FROM stdin;
\.


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admins (id, auth_user_id, first_name, last_name, email, role, created_at) FROM stdin;
ffa7f78f-f0c6-49cd-bb12-dd1ab72a687b	c79771df-ca4c-4fa7-90e9-3faa379080f6	Hsiao Yung	Chou	hsiaoyungchou@gmail.com	super_admin	2026-06-14 16:25:41.972571+00
\.


--
-- Data for Name: ai_tool_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_tool_logs (id, thread_id, parent_id, tool_name, input, output, created_at) FROM stdin;
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, booking_id, student_id, class_session_id, checked_in_at, check_in_method, checked_in_by, created_at, is_chained) FROM stdin;
\.


--
-- Data for Name: booking_students; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.booking_students (id, booking_id, student_id, attended, created_at) FROM stdin;
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bookings (id, class_session_id, parent_id, lesson_credit_id, status, cancelled_at, cancellation_reason, cancelled_by, makeup_credit_issued, notes, created_at, updated_at, student_id, is_trial, partner_parent_id, partner_booking_id, pending_action, pending_expires_at, pending_new_session_id, is_guest, partnership_id, original_booking_id, stripe_session_id, block_notice_sent_at, token_package_id, reminder_sent_at) FROM stdin;
063c2d78-c586-4a08-a05b-e5e2cf1b976e	0aa9e3e0-a517-4f04-b840-cb6ffa35a920	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	fc231f1f-c854-4bc0-9255-1e9e41325f6c	confirmed	\N	\N	\N	f	\N	2026-07-22 03:05:31.443191+00	2026-07-22 03:05:31.443191+00	8d9b2324-8014-4770-9f03-1ee71b681580	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
6586ba38-6f45-4df8-8857-9b5fa45b13fd	0aa9e3e0-a517-4f04-b840-cb6ffa35a920	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	fc231f1f-c854-4bc0-9255-1e9e41325f6c	confirmed	\N	\N	\N	f	\N	2026-07-22 03:05:56.189555+00	2026-07-22 03:05:56.189555+00	ae86c943-dedd-4640-b34b-ab19c622d6e1	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
84b1313c-ac41-46c1-9637-7c85de394462	053f8e8c-7caf-40c1-97a2-5f6c6245e95e	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	fc231f1f-c854-4bc0-9255-1e9e41325f6c	confirmed	\N	\N	\N	f	\N	2026-07-22 03:12:51.328573+00	2026-07-22 03:12:59.054536+00	8d9b2324-8014-4770-9f03-1ee71b681580	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
738cb017-a22f-48fc-9fed-930236f67f32	629b65b5-f754-4c7f-b6f9-97cdb84879ea	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	a7ff148e-ab66-4071-acf9-2ef4a18bbafa	confirmed	\N	\N	\N	f	\N	2026-07-22 03:12:56.641639+00	2026-07-22 03:12:59.103373+00	8d9b2324-8014-4770-9f03-1ee71b681580	f	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_messages (id, thread_id, sender_type, body, created_at, ai_handled, metadata, sender_admin_id) FROM stdin;
\.


--
-- Data for Name: chat_threads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_threads (id, parent_id, status, last_message_at, last_message_preview, unread_by_admin, created_at, mode, escalation_summary, handled_by, ai_context_from) FROM stdin;
\.


--
-- Data for Name: class_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_sessions (id, course_type_id, coach_id, session_date, start_time, end_time, max_students, enrolled_count, status, notes, created_at, updated_at) FROM stdin;
8ffd69f5-0c4a-456e-8888-4c4bf3b72b7c	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-17	01:00:00	01:30:00	4	0	open	\N	2026-07-17 07:38:05.96283+00	2026-07-17 07:38:05.96283+00
330f8330-dd11-4b01-86a2-6fc95c73efdb	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-17	18:00:00	18:30:00	4	0	open	\N	2026-07-17 07:38:05.96283+00	2026-07-17 07:38:05.96283+00
bb81884d-5800-4a5e-9856-36ad0ffc8fa4	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-17	16:00:00	16:30:00	4	0	open	\N	2026-07-17 19:03:34.897461+00	2026-07-22 03:01:12.010077+00
4ddb2ab5-ab9b-4c11-8135-73760a2aaf49	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-17	09:00:00	09:30:00	4	0	open	\N	2026-07-17 07:54:34.746951+00	2026-07-22 03:01:12.010077+00
b751d1a4-985b-45db-bfa9-40381b21085c	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-17	10:00:00	10:30:00	4	0	open	\N	2026-07-17 07:58:43.41691+00	2026-07-22 03:01:12.010077+00
cd65dc80-9371-4fb2-ba80-030833cd4673	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-18	15:30:00	16:00:00	4	0	open	\N	2026-07-18 21:35:11.078937+00	2026-07-22 03:01:12.010077+00
0aa9e3e0-a517-4f04-b840-cb6ffa35a920	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	286c4edd-dbdb-486d-8edb-a4211bbc4b67	2026-07-22	11:00:00	11:30:00	4	2	open	\N	2026-07-22 03:05:31.283922+00	2026-07-22 03:05:56.189555+00
d4baa098-58be-4247-b9a2-78d390962ee0	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-18	10:00:00	10:30:00	4	0	open	\N	2026-07-17 20:19:25.90711+00	2026-07-22 03:01:12.010077+00
ff734336-eccf-4149-a660-f6b30150210f	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-18	09:00:00	09:30:00	4	0	open	\N	2026-07-17 19:56:18.238193+00	2026-07-22 03:01:12.010077+00
fb6a6d58-7a7b-4fe9-a989-e49170f5f651	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-19	12:30:00	13:00:00	4	0	open	\N	2026-07-18 21:38:32.751089+00	2026-07-22 03:01:12.010077+00
f5349825-b4c4-49ce-a52a-7c770d415e8f	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-19	14:30:00	15:00:00	4	0	open	\N	2026-07-18 21:38:06.008411+00	2026-07-22 03:01:12.010077+00
c2afea39-c8d3-478e-b683-bedad962a3cf	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-20	08:00:00	08:30:00	4	0	open	\N	2026-07-18 19:35:32.42721+00	2026-07-22 03:01:12.010077+00
053f8e8c-7caf-40c1-97a2-5f6c6245e95e	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-23	09:00:00	09:30:00	4	1	open	\N	2026-07-20 09:35:37.732926+00	2026-07-22 03:12:59.054536+00
20f84fe3-04cf-4dd8-852e-b50ab5457a23	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-20	09:30:00	10:00:00	4	0	open	\N	2026-07-19 04:31:27.502822+00	2026-07-22 03:01:12.010077+00
629b65b5-f754-4c7f-b6f9-97cdb84879ea	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-23	09:30:00	10:00:00	4	1	open	\N	2026-07-22 03:12:56.615443+00	2026-07-22 03:12:59.103373+00
50d8f241-72a0-46a1-9fb3-14794941ad7d	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-21	09:00:00	09:30:00	4	0	open	\N	2026-07-19 16:11:56.539789+00	2026-07-22 03:01:12.010077+00
b49c0077-5042-4372-9cfb-a004a382b1d3	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-22	09:00:00	09:30:00	4	0	open	\N	2026-07-20 09:35:04.859067+00	2026-07-22 03:01:12.010077+00
295a66ca-a67f-4ecc-90d3-ed8f7daf1b60	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-22	09:30:00	10:00:00	4	0	open	\N	2026-07-21 02:51:38.423556+00	2026-07-22 03:01:12.010077+00
10b9093c-5de4-4556-aa50-0d2588c49394	d963831d-aad2-4ad9-9310-d01efae9e5a3	286c4edd-dbdb-486d-8edb-a4211bbc4b67	2026-07-25	09:00:00	09:30:00	2	0	open	\N	2026-07-21 20:47:22.301296+00	2026-07-22 03:01:12.010077+00
5e3813f2-e671-48f0-a97f-526ccfea0b34	d963831d-aad2-4ad9-9310-d01efae9e5a3	286c4edd-dbdb-486d-8edb-a4211bbc4b67	2026-07-26	09:00:00	09:30:00	2	0	open	\N	2026-07-21 20:57:44.79918+00	2026-07-22 03:01:12.010077+00
9a95b1ad-e559-4613-8a0f-e6ff497ea9b4	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-24	10:00:00	10:30:00	4	0	open	\N	2026-07-21 22:38:20.055311+00	2026-07-22 03:01:12.010077+00
e5857824-2cf1-4807-8792-ebf59dc4cd15	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-17	17:00:00	17:30:00	4	0	open	\N	2026-07-17 08:02:36.229168+00	2026-07-22 03:01:12.010077+00
29d07d89-9c94-4ea4-a064-dc9ca5d3c9eb	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-24	11:30:00	12:00:00	4	0	open	\N	2026-07-22 02:25:28.28806+00	2026-07-22 03:01:12.010077+00
\.


--
-- Data for Name: coach_availability; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coach_availability (id, coach_id, day_of_week, start_time, end_time, is_active, created_at) FROM stdin;
9c68bae2-bb73-4980-9591-01f3b013fae3	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	0	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
f463775c-4922-4291-ae95-bfa78fe65d50	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	1	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
5e77d0ce-c766-4e19-965b-57039f39989e	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
6698da16-f88a-4935-950c-fc4288898fcb	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	3	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
1c0f874d-539f-408f-8d34-0ae9d87966fd	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	4	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
672e70ee-086b-483f-917b-fe24f13d5b02	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	5	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
0ac4f2de-819c-46d4-ad22-b0910ab4c75c	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	6	09:00:00	18:00:00	t	2026-07-17 08:02:14.911001+00
c71d4d27-f37f-4fae-8947-a6e7710358e5	286c4edd-dbdb-486d-8edb-a4211bbc4b67	0	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
c7566a31-885f-484d-b3bc-abf32e4047c5	286c4edd-dbdb-486d-8edb-a4211bbc4b67	1	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
4c38f638-5c0e-459f-8607-6f76019e66c2	286c4edd-dbdb-486d-8edb-a4211bbc4b67	2	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
33c65478-3e65-43e9-b60f-de6829e27b46	286c4edd-dbdb-486d-8edb-a4211bbc4b67	3	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
1a3e326c-c04e-4fa6-b8bf-45a3761045e4	286c4edd-dbdb-486d-8edb-a4211bbc4b67	4	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
2ab26631-f207-4a34-9684-69e04513ab56	286c4edd-dbdb-486d-8edb-a4211bbc4b67	5	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
a27d4574-4a28-44f5-a6f5-cf6a6967e00b	286c4edd-dbdb-486d-8edb-a4211bbc4b67	6	09:00:00	18:00:00	t	2026-07-21 20:46:57.829195+00
\.


--
-- Data for Name: coach_availability_zones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coach_availability_zones (id, coach_id, zone_type, kind, weekday, override_date, start_time, end_time, created_at, updated_at, team_tier_id, group_level_min, group_level_max) FROM stdin;
d162b26b-e7ad-42b2-af99-fba11b83eee1	286c4edd-dbdb-486d-8edb-a4211bbc4b67	group	weekly	3	\N	10:00:00	11:00:00	2026-07-21 23:06:58.015562+00	2026-07-21 23:06:58.015562+00	\N	1	2
6d235577-34c1-417f-b403-8efb0702af22	286c4edd-dbdb-486d-8edb-a4211bbc4b67	group	weekly	3	\N	11:00:00	12:00:00	2026-07-21 23:06:58.015562+00	2026-07-21 23:06:58.015562+00	\N	3	4
744de578-191e-4d77-8737-2af1955e20ad	286c4edd-dbdb-486d-8edb-a4211bbc4b67	group	weekly	3	\N	12:00:00	13:00:00	2026-07-21 23:06:58.015562+00	2026-07-21 23:06:58.015562+00	\N	5	6
b1ab80b8-aeff-4d5a-b87d-b126b2a95674	286c4edd-dbdb-486d-8edb-a4211bbc4b67	group	weekly	3	\N	13:00:00	14:00:00	2026-07-21 23:06:58.015562+00	2026-07-21 23:06:58.015562+00	\N	7	9
5ebf94e3-060f-46cf-9378-3df1232c01fd	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	date	\N	2026-07-23	09:00:00	10:00:00	2026-07-22 03:12:36.209802+00	2026-07-22 03:12:36.209802+00	\N	3	4
9584b415-f6de-4623-84b0-bcd867ad692f	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	date	\N	2026-07-23	10:00:00	18:00:00	2026-07-22 03:12:36.209802+00	2026-07-22 03:12:36.209802+00	\N	\N	\N
659be808-c0db-4197-9764-61931d847053	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	date	\N	2026-07-24	09:00:00	11:30:00	2026-07-21 06:35:39.371422+00	2026-07-21 06:35:39.371422+00	\N	\N	\N
d501120a-7f5f-4e89-a426-3c7cf4db9a5a	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	date	\N	2026-07-24	11:30:00	13:00:00	2026-07-21 06:35:39.371422+00	2026-07-21 06:35:39.371422+00	\N	\N	\N
1384ad91-4fff-453b-8cfa-16b24193f097	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	date	\N	2026-07-24	13:00:00	18:00:00	2026-07-21 06:35:39.371422+00	2026-07-21 06:35:39.371422+00	\N	\N	\N
e16b3b64-57a6-4acd-bd35-30a4d49c45ed	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	closed	date	\N	2026-07-26	00:00:00	23:59:00	2026-07-21 06:45:08.049739+00	2026-07-21 06:45:08.049739+00	\N	\N	\N
887c9a48-f097-481f-9ba0-30b65dbf33d0	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	0	\N	06:00:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
d5282e57-e48b-4de5-beea-8df47ecfaa05	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	1	\N	09:00:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
b8e2acf6-f3cc-415f-b074-fb47b8e51ac6	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	2	\N	09:00:00	13:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
f2fae54c-74d7-426e-a355-a228ce4d4a09	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	2	\N	14:00:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
b6739025-19b1-40eb-93d8-040bf7d1b708	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	3	\N	09:00:00	10:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
e9f2fbb2-7ccc-46cb-9d0f-93c519188d79	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	team	weekly	3	\N	10:30:00	12:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	638702cb-a2e7-4961-94dc-bca1b17bda83	\N	\N
3a0f3289-2bdc-4b6d-99ce-5c1c72bcabdb	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	3	\N	12:00:00	13:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
65adef34-dd1f-4207-a2cb-d7a026b5ddaa	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	team	weekly	3	\N	13:00:00	14:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	f5737be6-c2ee-4e31-83e1-dbcf9b8aa68b	\N	\N
caa8323d-a27c-4297-9798-505c6167e6d4	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	3	\N	15:00:00	15:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
c6507087-206c-4bde-b20d-ddab3ae88205	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	team	weekly	3	\N	16:00:00	17:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	74d3c84f-62c6-48d0-97b5-77c5289cd5cb	\N	\N
76bb3921-57a5-407b-afc1-3c4d5d113aa7	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	3	\N	17:30:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
7453b478-3215-4313-8f29-1b8aa4384ee5	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	4	\N	09:00:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
862fcf11-11d0-4da4-95e7-ca528ef989f1	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	weekly	5	\N	09:00:00	11:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	3	4
ae1cdc1d-53ea-403a-ac5f-a3cf200f1b12	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	weekly	5	\N	11:00:00	11:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	1	2
e6755b8b-bb99-4fc6-8f2d-bd04fe857393	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	weekly	5	\N	11:30:00	12:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	5	6
12b8bfde-5cdb-412f-8387-b1d22bd41cab	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	weekly	5	\N	12:30:00	13:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	7	9
d2adf656-ace9-4ccc-89a9-91dadba1cec6	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	group	weekly	5	\N	13:30:00	14:30:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	1	2
29a2254b-446d-4dd1-b537-15ac3df0b4b9	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	5	\N	14:30:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
08c9dbb9-65c3-41a5-a785-7f80796dafaf	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	private	weekly	6	\N	09:00:00	18:00:00	2026-07-22 03:04:24.776975+00	2026-07-22 03:04:24.776975+00	\N	\N	\N
\.


--
-- Data for Name: coach_time_off; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coach_time_off (id, coach_id, date, reason, created_at, start_time, end_time, block_type) FROM stdin;
5e39ecec-cb40-417d-98a2-9f71064e9402	8ed5c940-191a-4380-b9d9-a4b71e67fa8f	2026-07-16	\N	2026-07-15 19:27:41.876636+00	10:00:00	13:00:00	admin_block
\.


--
-- Data for Name: coaches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coaches (id, auth_user_id, first_name, last_name, email, phone, profile_photo_url, bio, is_active, created_at, updated_at, pin_hash) FROM stdin;
286c4edd-dbdb-486d-8edb-a4211bbc4b67	0b084ecd-b4ae-4920-8aba-dde52ce531be	Mitzi	Ting	sportzimitzi@gmail.com	\N	\N	\N	t	2026-07-15 07:43:30.254058+00	2026-07-15 07:43:30.254058+00	33a7d3da476a32ac237b3f603a1be62fad00299e0d4b5a8db8d913104edec629
2adb59f0-b5da-442b-b084-636057db5b67	e38f39f6-0b14-48cf-87f0-ca3777069213	Mitch	Ting	swimmingmitch@gmail.com	\N	\N	\N	t	2026-07-15 07:44:13.893914+00	2026-07-15 07:44:13.893914+00	afb47e00531153e93808589e43d02c11f6398c5bc877f7924cebca8211c8dd18
8ed5c940-191a-4380-b9d9-a4b71e67fa8f	a1e2b1c0-fa92-44d6-97da-52e6180031a1	Shane	Chou	shaioking@gmail.com	\N	\N	\N	t	2026-07-15 07:42:49.875484+00	2026-07-15 07:47:00.983101+00	ee79976c9380d5e337fc1c095ece8c8f22f91f306ceeb161fa51fecede2c4ba1
\.


--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.coupons (id, code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: course_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course_types (id, name, slug, max_students, duration_minutes, is_fixed_schedule, is_open_enrollment, description, color, is_active, sort_order, created_at, updated_at) FROM stdin;
cb380ad9-6142-495e-8a62-3cdb7d85889c	1-on-1 Private	1on1	1	30	f	f	\N	#0066CC	t	1	2026-06-13 19:15:03.190439+00	2026-06-13 19:15:03.190439+00
d963831d-aad2-4ad9-9310-d01efae9e5a3	1-on-2 Semi-Private	1on2	2	30	f	f	\N	#0066CC	t	2	2026-06-13 19:15:03.190439+00	2026-06-13 19:15:03.190439+00
2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	1-on-4 Group	1on4	4	30	f	t	\N	#0066CC	t	3	2026-06-13 19:15:03.190439+00	2026-06-13 19:15:03.190439+00
c6320884-c262-4274-89d8-a12bedd76a06	Swim Team	team	24	90	t	t	\N	#0066CC	t	4	2026-06-13 19:15:03.190439+00	2026-06-13 19:15:03.190439+00
\.


--
-- Data for Name: email_otps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_otps (id, email, otp_code, expires_at, verified, created_at) FROM stdin;
b2aefbb4-69e4-41c9-a919-b61442607c40	wixmanta@gmail.com	580577	2026-07-15 07:57:43.406+00	t	2026-07-15 07:47:43.459385+00
c69817bd-39e9-45d2-a83c-b554e35ac3e4	wixmanta@gmail.com	436031	2026-07-15 08:05:19.199+00	t	2026-07-15 07:55:19.26468+00
f2c059ca-91af-4953-aa7e-0da03e041316	mitziting13@gmail.com	306874	2026-07-15 08:19:00.968+00	t	2026-07-15 08:09:01.019167+00
8e0a5c48-222f-4b58-b13b-564b67fd7f23	mantamantatest1@gmail.com	226819	2026-07-15 08:29:44.972+00	t	2026-07-15 08:19:45.026665+00
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, invoice_number, parent_id, lesson_credit_id, amount, payment_method, items, status, stripe_payment_intent_id, notes, issued_at, created_at, student_id) FROM stdin;
71ec29e2-c574-453e-8bfc-35c06783f178	MSA-2026-0037	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	fc231f1f-c854-4bc0-9255-1e9e41325f6c	400.00	stripe	[{"name": "1-on-4 Group · 10 Sessions", "quantity": 10, "unit_price": 40}]	sent	pi_3TtulWL3kkHqgZOD1FRQF8Ss	\N	2026-07-16 19:16:18.44667+00	2026-07-16 19:16:18.44667+00	\N
dbdd3d87-5074-4f89-ab5b-4ca9ed4f8b45	MSA-2026-0038	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	a7ff148e-ab66-4071-acf9-2ef4a18bbafa	400.00	stripe	[{"name": "1-on-4 Group · 10 Sessions", "quantity": 10, "unit_price": 40}]	sent	pi_3Ttv8TL3kkHqgZOD0q1OaA4D	\N	2026-07-16 19:40:02.248116+00	2026-07-16 19:40:02.248116+00	\N
a9639242-22f9-4865-982c-1a07a19a8276	MSA-2026-0039	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	7f05ac57-eae9-4fff-88da-a99cedd1b59e	400.00	stripe	[{"name": "1-on-4 Group · 10 Sessions", "quantity": 10, "unit_price": 40}]	sent	pi_3TtvFnL3kkHqgZOD0B4NVWhB	\N	2026-07-16 19:47:34.018232+00	2026-07-16 19:47:34.018232+00	\N
5414ed29-5b5d-4073-9e73-674394ff9e3c	MSA-2026-0040	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	36bbceb4-0e8b-4a8a-a758-e266589e1fa8	650.00	stripe	[{"name": "1-on-1 Private · 10 Sessions", "quantity": 10, "unit_price": 65}]	sent	pi_3TvXIAL3kkHqgZOD1D7WVjhb	\N	2026-07-21 06:36:40.640243+00	2026-07-21 06:36:40.640243+00	\N
0da0a366-bb14-4345-824d-ba9d62b155e7	MSA-2026-0041	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	d5d9bfee-1734-450d-98c4-f6e07ec3ead1	1050.00	stripe	[{"name": "1-on-2 Semi-Private · 10 Sessions", "quantity": 10, "unit_price": 105}]	sent	pi_3TvkWKL3kkHqgZOD1FF30oyU	\N	2026-07-21 20:44:12.560237+00	2026-07-21 20:44:12.560237+00	\N
123fbdec-43fd-407b-ab98-0525199868ed	MSA-2026-0042	8567ecae-b8a1-4f77-aec8-93e15b34fe0e	51a6a1af-ffce-4c94-ab84-40cea642a347	760.00	stripe	[{"name": "1-on-4 Group · 20 Sessions", "quantity": 20, "unit_price": 38}]	sent	pi_3TvmKAL3kkHqgZOD1DACk4E0	\N	2026-07-21 22:39:44.747158+00	2026-07-21 22:39:44.747158+00	\N
\.


--
-- Data for Name: lesson_credits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lesson_credits (id, student_id, purchase_id, course_type_id, total_credits, used_credits, expires_at, created_at, updated_at, parent_id, stripe_session_id, is_trial, converted_to_token_at) FROM stdin;
955947a3-1d48-448b-936b-9370301e599d	\N	242f212d-02dd-40c4-a188-61cc8a2abcb4	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	2	0	2026-07-16 07:13:22.111821+00	2026-07-17 07:13:22.111821+00	2026-07-17 21:17:03.801178+00	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	f	2026-07-17 07:25:56.255+00
7f05ac57-eae9-4fff-88da-a99cedd1b59e	\N	242f212d-02dd-40c4-a188-61cc8a2abcb4	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	10	0	2026-11-16 19:47:33.585+00	2026-07-16 19:47:33.618755+00	2026-07-17 21:17:03.801178+00	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	f	\N
51a6a1af-ffce-4c94-ab84-40cea642a347	\N	a151ce34-d038-4b5e-8c2c-267257b07d53	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	20	0	2027-03-21 22:39:44.493+00	2026-07-21 22:39:44.521977+00	2026-07-22 02:45:42.727612+00	8567ecae-b8a1-4f77-aec8-93e15b34fe0e	\N	f	\N
fc231f1f-c854-4bc0-9255-1e9e41325f6c	\N	64e3419c-7dbb-4e1c-af06-ed93168782fc	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	10	10	2026-11-16 19:16:16.94+00	2026-07-16 19:16:16.969418+00	2026-07-22 03:12:59.079723+00	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	f	\N
a7ff148e-ab66-4071-acf9-2ef4a18bbafa	\N	9e4e7421-8b3c-43a2-b782-5cba13b8df58	2b65ca6b-d07c-4fb1-9878-c520cfb2de5d	10	1	2026-11-16 19:40:00.714+00	2026-07-16 19:40:00.764661+00	2026-07-22 03:12:59.130452+00	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	f	\N
36bbceb4-0e8b-4a8a-a758-e266589e1fa8	\N	332cde8a-e805-4830-b884-6b685bc98650	cb380ad9-6142-495e-8a62-3cdb7d85889c	10	0	2026-11-21 06:36:40.158+00	2026-07-21 06:36:40.181111+00	2026-07-21 06:36:40.181111+00	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	f	\N
d5d9bfee-1734-450d-98c4-f6e07ec3ead1	\N	239dd522-6a65-449e-9c04-b8691ad71e56	d963831d-aad2-4ad9-9310-d01efae9e5a3	10	0	2026-11-21 20:44:11.277+00	2026-07-21 20:44:11.311053+00	2026-07-21 20:58:20.503947+00	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	f	\N
\.


--
-- Data for Name: lesson_packages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lesson_packages (id, name, lesson_count, price_cents, course_type_id, description, is_active, sort_order, created_at, updated_at) FROM stdin;
339a49db-a055-419c-86ca-5e8c73838fe7	10-Class Pack	10	100000	\N	\N	t	1	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
962ebfd1-3a7f-4e59-a8ab-1c62fcf5f2c6	20-Class Pack	20	180000	\N	\N	t	2	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
2cb24172-10e6-4a43-8d69-28fd6d053a64	30-Class Pack	30	250000	\N	\N	t	3	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
557cd072-e0dc-4e32-91cb-334b01f0f7de	50-Class Pack	50	380000	\N	\N	t	4	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
\.


--
-- Data for Name: level_recommendations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.level_recommendations (id, student_id, coach_id, recommended_level, notes, status, reviewed_by, final_level, created_at, reviewed_at, previous_recommended_level) FROM stdin;
\.


--
-- Data for Name: level_upgrades; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.level_upgrades (id, student_id, from_level, to_level, upgraded_by, upgraded_at, notes) FROM stdin;
\.


--
-- Data for Name: levels; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.levels (id, level_number, name, description, badge_color, sort_order, created_at, updated_at) FROM stdin;
11cb28cf-df84-4c36-85c0-f95e66bf95de	1	Level 1	\N	#0066CC	1	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
a7508f3b-90e1-442a-9543-c2ee39ece05a	2	Level 2	\N	#0066CC	2	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
d43bd4ad-818a-47cc-b984-340f1a86778e	3	Level 3	\N	#0066CC	3	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
ed7884c1-bf10-4725-830a-981ee8b52246	4	Level 4	\N	#0066CC	4	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
83479c5f-2ca6-45db-a09b-d2aaa919162b	5	Level 5	\N	#0066CC	5	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
627c3128-814c-481c-9925-7b435a2a6dc4	6	Level 6	\N	#0066CC	6	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
4469a2ca-f251-40d6-a280-3b1df7fb15a1	7	Level 7	\N	#0066CC	7	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
12043d23-0ca3-443f-9c1b-b03cca9d940c	8	Level 8	\N	#0066CC	8	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
0eaaeab3-64bb-433d-8a92-bad24fde96f8	9	Level 9	\N	#0066CC	9	2026-06-10 17:58:20.989598+00	2026-06-10 17:58:20.989598+00
\.


--
-- Data for Name: makeup_credits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.makeup_credits (id, student_id, booking_id, course_type_id, issued_at, expires_at, used_at, used_booking_id, status) FROM stdin;
\.


--
-- Data for Name: message_threads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.message_threads (id, parent_id, subject, status, last_message_at, created_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, thread_id, sender_type, sender_id, body, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: notification_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_log (id, parent_id, type, category, recipient, subject, body, status, sent_at, error_message) FROM stdin;
\.


--
-- Data for Name: parent_partnerships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.parent_partnerships (id, initiator_parent_id, partner_parent_id, invite_code, status, created_at, accepted_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: parents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.parents (id, auth_user_id, first_name, last_name, email, phone, street_address, city, state, zip_code, waiver_signed, waiver_signed_at, emergency_contact_name, emergency_contact_phone, notes, created_at, updated_at, registered_at, terms_accepted_at, last_login_at, newsletter_subscribed, address_line1, address_line2, last_activity_at, activity_reviewed_at, terms_version, waiver_accepted_at, waiver_version, media_release_accepted, media_release_at) FROM stdin;
8567ecae-b8a1-4f77-aec8-93e15b34fe0e	6299be2d-8dd1-40d9-b83f-2e797ea4410b	Manta	1	mantamantatest1@gmail.com	+19093239573	\N	Pomona	CA	91767	f	\N	\N	\N	\N	2026-07-15 08:22:05.096377+00	2026-07-22 04:26:24.55719+00	2026-07-15 08:22:04.196+00	2026-07-15 08:22:04.196+00	2026-07-15 08:22:04.196+00	t	2771 North Garey Avenue	APT100	2026-07-22 04:26:24.5+00	2026-07-19 04:21:52.788+00	2026-07-04	2026-07-15 08:22:04.196+00	2026-07-02	t	2026-07-15 08:22:04.196+00
dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	8df245f6-f5e9-4ef3-9fe1-fc6ce9b7b4d7	Simon	Lee	wixmanta@gmail.com	+19093239531	\N	Diamond Bar	CA	91765	f	\N	\N	\N	\N	2026-07-15 08:00:21.718666+00	2026-07-22 04:26:59.841922+00	2026-07-15 08:00:20.965+00	2026-07-15 08:00:20.965+00	2026-07-18 21:33:26.34+00	t	21018 Blossom Way	\N	2026-07-22 04:26:59.785+00	2026-07-21 20:42:29.079+00	2026-07-04	2026-07-15 08:00:20.965+00	2026-07-02	t	2026-07-15 08:00:20.965+00
\.


--
-- Data for Name: phone_otps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.phone_otps (id, phone, otp_code, expires_at, verified, created_at) FROM stdin;
545e4546-c8a3-460a-b5d8-217e915341f5	+19093239531	190968	2026-07-15 07:58:14.169+00	t	2026-07-15 07:48:14.216429+00
25262d22-174e-4776-ac43-5b473626365b	+19093239531	657762	2026-07-15 08:05:23.448+00	t	2026-07-15 07:55:23.498588+00
162bfadc-35a4-42ae-9f0b-d85323de163b	+19093239145	859145	2026-07-15 08:19:05.582+00	t	2026-07-15 08:09:05.648595+00
7b996ece-8247-46cf-b6d8-63f9bc2fc719	+19093239573	713287	2026-07-15 08:30:03.488+00	t	2026-07-15 08:20:03.540134+00
\.


--
-- Data for Name: progress_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.progress_history (id, student_id, coach_id, snapshot, created_at, status, session_date, reviewed_by, reviewed_at, class_session_id) FROM stdin;
\.


--
-- Data for Name: purchases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchases (id, parent_id, student_id, lesson_package_id, stripe_payment_intent_id, stripe_invoice_id, amount_cents, discount_cents, coupon_code, status, paid_at, invoice_sent_at, notes, created_at, stripe_session_id, amount, payment_method, recorded_by) FROM stdin;
64e3419c-7dbb-4e1c-af06-ed93168782fc	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	\N	\N	\N	40000	0	\N	paid	2026-07-16 19:16:16.826+00	\N	\N	2026-07-16 19:16:16.900905+00	cs_test_a1F6Cs74vFL6EFopaZXyu6Ta8QCmQ1ofrTYjeQYrItdPCmxRxZOSTlj4br	\N	stripe_checkout	\N
9e4e7421-8b3c-43a2-b782-5cba13b8df58	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	\N	\N	\N	40000	0	\N	paid	2026-07-16 19:40:00.274+00	\N	\N	2026-07-16 19:40:00.661652+00	cs_test_a1RmpM54ATkqBSqrHuoHad9f8IMdcULbeyeTAyWCiON0jmQpctYb57n0go	\N	stripe_checkout	\N
242f212d-02dd-40c4-a188-61cc8a2abcb4	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	\N	\N	\N	40000	0	\N	paid	2026-07-16 19:47:33.366+00	\N	\N	2026-07-16 19:47:33.405904+00	cs_test_a1czbFo97qtKGn26sUbzDIPymS1yBAMbfdJ12kLmPbxXF72ByuHJ8DYGnT	\N	stripe_checkout	\N
332cde8a-e805-4830-b884-6b685bc98650	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	\N	\N	\N	65000	0	\N	paid	2026-07-21 06:36:40.067+00	\N	\N	2026-07-21 06:36:40.12362+00	cs_test_a1PrUSjXIeqhoJlgoqzwPrjjlYp9KCStNcO8F1JFrCj4le1sDUpXU8CqkK	\N	stripe_checkout	\N
239dd522-6a65-449e-9c04-b8691ad71e56	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	\N	\N	\N	\N	105000	0	\N	paid	2026-07-21 20:44:11.196+00	\N	\N	2026-07-21 20:44:11.246297+00	cs_test_a1h8FC0cB4FvhRafmOIOOH8XKWUaAFaBOFAWwa4kWTNCmdWdBZguH5GHzw	\N	stripe_checkout	\N
a151ce34-d038-4b5e-8c2c-267257b07d53	8567ecae-b8a1-4f77-aec8-93e15b34fe0e	\N	\N	\N	\N	76000	0	\N	paid	2026-07-21 22:39:44.446+00	\N	\N	2026-07-21 22:39:44.484725+00	cs_test_a18gyV0mTXyKMit9vnn2tHyuo3Y8N1Ab8e2EAGPJHsJ6vqLIbP9LY9fupQ	\N	stripe_checkout	\N
\.


--
-- Data for Name: skills; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.skills (id, level_id, name, description, sort_order, is_active, created_at, updated_at) FROM stdin;
3aa56665-8ce2-4524-819d-efcf30057a02	11cb28cf-df84-4c36-85c0-f95e66bf95de	Safe Entry and Recognition	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
a5ec094e-4338-4259-9e43-4b913cd02ca3	11cb28cf-df84-4c36-85c0-f95e66bf95de	Wall Grasping	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
2eb2c769-054f-4e44-9769-779c7972318b	11cb28cf-df84-4c36-85c0-f95e66bf95de	Kicking on Land	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
0d151d1b-8492-49bc-824e-c4e26a657046	11cb28cf-df84-4c36-85c0-f95e66bf95de	Underwater Bubble Blowing	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
92751613-6a3c-465f-bcdb-251754df1dff	11cb28cf-df84-4c36-85c0-f95e66bf95de	Assisted Floating	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
52ad780b-a73d-418d-988f-f49651cbc088	11cb28cf-df84-4c36-85c0-f95e66bf95de	Float-to-Stand Transition	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
58842492-eacd-4c4d-9506-a18e562c64b5	11cb28cf-df84-4c36-85c0-f95e66bf95de	Water Walking	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
d6915327-5d9d-4907-be40-b59ad3536c8d	11cb28cf-df84-4c36-85c0-f95e66bf95de	Superman Glide	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
f0b828a0-63a5-4aea-8000-13e1b05b1682	a7508f3b-90e1-442a-9543-c2ee39ece05a	Safe Exit	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
35250d84-1461-4c39-85fc-7686d9576753	a7508f3b-90e1-442a-9543-c2ee39ece05a	Bubble Jumps (Basic)	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7	a7508f3b-90e1-442a-9543-c2ee39ece05a	Underwater Breath Holding	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
ed0e69e4-3edb-4668-84d8-a39064fe2425	a7508f3b-90e1-442a-9543-c2ee39ece05a	Object Retrieval	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
b46c9773-7e09-4da4-8beb-d79050075710	a7508f3b-90e1-442a-9543-c2ee39ece05a	Push-Off Float	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
4fd1fce7-9293-475e-a142-5a8d2ecf954d	a7508f3b-90e1-442a-9543-c2ee39ece05a	Freestyle Kicking (Basic)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
77dcafb5-fee7-4fde-8020-9691b99f5064	a7508f3b-90e1-442a-9543-c2ee39ece05a	Backstroke Kicking (Basic)	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
ed4c463b-6c65-497b-b370-18e9bd945468	a7508f3b-90e1-442a-9543-c2ee39ece05a	BBQ Roll (Body Rotation)	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
c7022acb-3075-471f-8c45-4d5330139369	d43bd4ad-818a-47cc-b984-340f1a86778e	Bubble Jumps (Advanced)	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
1b90e0d5-e21d-4991-9d97-a16394d3913b	d43bd4ad-818a-47cc-b984-340f1a86778e	Starfish Float (Basic)	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
e8fd87dc-4e41-4ea5-adda-d8038881f573	d43bd4ad-818a-47cc-b984-340f1a86778e	Freestyle Kicking (Advanced)	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
4a0a72ff-a39f-404c-a40f-49b83b5ea4ff	d43bd4ad-818a-47cc-b984-340f1a86778e	Backstroke Kicking (Advanced)	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
580a979a-e3f7-458f-b0f8-c39c7c20d686	d43bd4ad-818a-47cc-b984-340f1a86778e	BBQ Swim Technique	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
4dd3928b-8433-40c4-8057-29b454ce5a03	d43bd4ad-818a-47cc-b984-340f1a86778e	Treading Water (Basic)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
5aa1716e-8d05-41b0-a660-7fce60b69390	d43bd4ad-818a-47cc-b984-340f1a86778e	Butterfly Kicking (Basic)	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
997642b0-c290-48cf-a53f-ccb46d52d539	d43bd4ad-818a-47cc-b984-340f1a86778e	Water Safety Test	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
89ca69a6-6f96-4c1d-a52d-6ba16edab33b	ed7884c1-bf10-4725-830a-981ee8b52246	Streamline Push-Off	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
dff814b2-90df-4043-aeb3-dd4e4df64fbe	ed7884c1-bf10-4725-830a-981ee8b52246	Freestyle (Basic)	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
91e61121-5528-456b-9e7d-b97953ed0c39	ed7884c1-bf10-4725-830a-981ee8b52246	Freestyle (Advanced)	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
9194c9af-7e03-4d13-969b-4284d49b3a84	ed7884c1-bf10-4725-830a-981ee8b52246	Deep Water Object Retrieval	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
96c47b53-df33-4b4a-9a8e-a84eed10c7b8	ed7884c1-bf10-4725-830a-981ee8b52246	Backstroke (Basic)	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
806e2b61-f66e-460b-b31b-264097fee097	ed7884c1-bf10-4725-830a-981ee8b52246	Starfish Float (Advanced)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
95bf3bc3-79b3-48a4-9a90-cf53103ca965	ed7884c1-bf10-4725-830a-981ee8b52246	No-Goggles Swim	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
7a62a560-01cd-4199-b464-68a78a8ee98a	ed7884c1-bf10-4725-830a-981ee8b52246	In-Water Turn	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
be760433-09d7-4cac-9863-fa758abc9009	83479c5f-2ca6-45db-a09b-d2aaa919162b	Freestyle (Mastery)	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
9722f505-b208-43dc-868d-495ba0f3c10e	83479c5f-2ca6-45db-a09b-d2aaa919162b	Underwater Freestyle Kicking	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
818b6b3b-63b9-4e13-9a52-f3f466f57cc7	83479c5f-2ca6-45db-a09b-d2aaa919162b	Streamline Freestyle Kicking	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
daefdc4c-aa3f-4df6-b001-4e95569c4d78	83479c5f-2ca6-45db-a09b-d2aaa919162b	Backstroke (Advanced)	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
b02f51e3-1e69-487e-86b1-18e21ddb6812	83479c5f-2ca6-45db-a09b-d2aaa919162b	Breaststroke Kick (Basic)	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
327265d2-e212-4917-90d9-21daa2a5520e	83479c5f-2ca6-45db-a09b-d2aaa919162b	Butterfly Kicking (Advanced)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
81568486-d273-49b0-a824-d53569fefc37	83479c5f-2ca6-45db-a09b-d2aaa919162b	Clothed Swim Without Goggles	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113	83479c5f-2ca6-45db-a09b-d2aaa919162b	Treading Water (Advanced)	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
18a6462c-4c67-4e93-8838-8bc03717b463	627c3128-814c-481c-9925-7b435a2a6dc4	Freestyle (Proficiency)	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
22e00423-edc5-4626-8e7f-8bc4e846203f	627c3128-814c-481c-9925-7b435a2a6dc4	Freestyle Flip Turn	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
97804fbb-13d4-4367-ab9d-0276b25591d6	627c3128-814c-481c-9925-7b435a2a6dc4	Backstroke (Mastery)	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
31dc4fc7-ef0b-4e4c-a80c-419ceebc7360	627c3128-814c-481c-9925-7b435a2a6dc4	Butterfly (Basic)	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
e858562b-a3aa-4875-84ef-e1f6875770e5	627c3128-814c-481c-9925-7b435a2a6dc4	Breaststroke Kick (Advanced)	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
9f37e0f9-68d5-4bae-8349-c9d2d99d8225	627c3128-814c-481c-9925-7b435a2a6dc4	Breaststroke (Basic)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
0b50339e-3764-40f3-8d12-fa53502831ec	627c3128-814c-481c-9925-7b435a2a6dc4	Underwater Breath Holding (Advanced)	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
b7525cfb-5d9b-43b2-9868-393578adf991	627c3128-814c-481c-9925-7b435a2a6dc4	Individual Medley Kicking	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
c4b854b3-f337-4799-9631-33c6459951c6	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Freestyle (Timed)	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
456f3041-33b2-4583-9f0a-4543ca2464c0	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Freestyle (Endurance)	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Backstroke (Proficiency)	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
3e66c970-61b6-4189-9fa8-353809086556	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Backstroke Flip Turn	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
eb420091-b357-41af-892a-73a1059ecfda	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Butterfly (Advanced)	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
1b7d1a52-bac5-44a5-9bc4-18a7ab70903f	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Breaststroke (Advanced)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
61765b4c-fd81-458d-acb9-1f4c19201994	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Underwater Dolphin Kick	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
e9374f19-259b-4c49-85c2-a6faebae05e9	4469a2ca-f251-40d6-a280-3b1df7fb15a1	Clothed Swim Without Goggles	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
0280911e-9a79-4eed-8916-883e64dee3de	12043d23-0ca3-443f-9c1b-b03cca9d940c	Freestyle (Sprint)	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
eaa47012-b0e4-4e77-ba05-f87b6acc80db	12043d23-0ca3-443f-9c1b-b03cca9d940c	Freestyle (Advanced Endurance)	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
840dbdc7-1774-46ce-95ca-fe2f87d23475	12043d23-0ca3-443f-9c1b-b03cca9d940c	Backstroke (Endurance)	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
0ff7355f-2cef-42b9-afa2-0749603d6c33	12043d23-0ca3-443f-9c1b-b03cca9d940c	Open Turn	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
fb34523b-58c7-4e1f-9cef-a56ebea37757	12043d23-0ca3-443f-9c1b-b03cca9d940c	Breaststroke Underwater Pullout	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
de916eb5-53b3-4ab3-b451-53f793a1666f	12043d23-0ca3-443f-9c1b-b03cca9d940c	Breaststroke (Mastery)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
c9047d9f-1b91-4902-a4ce-33e303b4674b	12043d23-0ca3-443f-9c1b-b03cca9d940c	Butterfly (Mastery)	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
3c01a30f-147d-4880-9738-75c245fc3325	12043d23-0ca3-443f-9c1b-b03cca9d940c	Treading Water (Proficient)	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Freestyle (Long Distance)	\N	1	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
e9f7b834-3e50-446f-a775-33d547ba776b	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Individual Medley	\N	2	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
58b20bb7-23a5-4ee2-affb-5f16284a7563	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Stroke Transitions and Turns	\N	3	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
6d6b6afb-ed92-47b1-b557-52904c7931ab	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Freestyle (Competitive)	\N	4	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
11f3d107-8ea1-43f9-9301-3875cd71dad0	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Backstroke (Competitive)	\N	5	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
1ed417e9-431d-46db-837b-adabbdde74f3	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Breaststroke (Competitive)	\N	6	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
b617a73c-8da4-4526-9420-58ed4c682a94	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Butterfly (Competitive)	\N	7	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
91adaea7-aefa-432c-8b9a-44ca43976bdb	0eaaeab3-64bb-433d-8a92-bad24fde96f8	Clothed Swim Without Goggles	\N	8	t	2026-06-13 21:29:35.249839+00	2026-06-13 21:29:35.249839+00
\.


--
-- Data for Name: student_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.student_notes (id, student_id, content, pinned, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: student_skill_progress; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.student_skill_progress (id, student_id, skill_id, progress_percent, last_updated_by, last_updated_at, notes) FROM stdin;
\.


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.students (id, parent_id, full_name, date_of_birth, gender, current_level, medical_notes, profile_photo_url, qr_code, is_active, sort_order, created_at, updated_at, trial_used_at, added_by_parent, legal_full_name, uci_number, service_code) FROM stdin;
d29696c5-0273-4483-8835-867f2b7116c7	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	Jayden Lee	2026-04-09	\N	\N	\N	\N	d21a8ee4-c271-4d39-8d2b-1e7539fbb11f	t	2	2026-07-15 08:00:22.237734+00	2026-07-15 08:00:22.237734+00	\N	f	\N	\N	\N
5abb97fa-e81a-4c1b-a3d3-d0f3f0c72e24	8567ecae-b8a1-4f77-aec8-93e15b34fe0e	Manta Two	2018-06-09	\N	\N	\N	\N	52928248-e463-4cb3-91c8-4ae112804671	t	2	2026-07-15 08:22:05.682149+00	2026-07-15 08:22:05.682149+00	\N	f	\N	\N	\N
ae86c943-dedd-4640-b34b-ab19c622d6e1	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	Andy Lee	2026-03-10	\N	1	\N	\N	8f44891f-602e-4116-bf96-092669fcd89a	t	3	2026-07-15 08:00:22.354914+00	2026-07-19 04:30:19.989617+00	\N	f	\N	\N	\N
8d9b2324-8014-4770-9f03-1ee71b681580	dbcd55dd-9c63-4407-8eaf-66ba4f1fd83a	Kayden Lee	2026-07-08	\N	4	\N	\N	1750420a-2df1-452a-922d-b08316ba466b	t	1	2026-07-15 08:00:22.026798+00	2026-07-21 04:27:11.60352+00	\N	f	\N	\N	\N
e24f5460-c9ee-40b8-8cea-5b95be363409	8567ecae-b8a1-4f77-aec8-93e15b34fe0e	Manta One	2023-02-02	\N	4	\N	\N	6984712b-e058-4341-bea5-0f68119503a6	t	1	2026-07-15 08:22:05.415351+00	2026-07-21 20:42:24.106353+00	\N	f	\N	\N	\N
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_settings (key, value, updated_at) FROM stdin;
checkin_period_cutoff	07:00	2026-07-02 21:05:54.181+00
\.


--
-- Data for Name: team_attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.team_attendance (id, student_id, team_tier_id, practice_date, start_time, check_in_method, checked_in_at) FROM stdin;
cfa570f6-cba6-4046-bba5-b36027f2bbed	8d9b2324-8014-4770-9f03-1ee71b681580	638702cb-a2e7-4961-94dc-bca1b17bda83	2026-07-20	22:00:00	manual	2026-07-21 06:07:42.269876+00
\.


--
-- Data for Name: team_memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.team_memberships (id, student_id, team_tier_id, stripe_subscription_id, status, started_at, cancelled_at, created_at, updated_at) FROM stdin;
517569da-c982-48b8-8450-5306cf849e89	8d9b2324-8014-4770-9f03-1ee71b681580	638702cb-a2e7-4961-94dc-bca1b17bda83	sub_1TvVHQL3kkHqgZODjwvArqhp	cancelled	2026-07-21 04:27:47.185043+00	2026-07-21 19:49:48.216146+00	2026-07-21 04:27:47.185043+00	2026-07-21 04:27:47.185043+00
569f5be5-9d57-405a-a44c-de6980d7d7cf	8d9b2324-8014-4770-9f03-1ee71b681580	638702cb-a2e7-4961-94dc-bca1b17bda83	sub_1TvjgSL3kkHqgZODFmhz8YLH	cancelled	2026-07-21 19:50:42.168107+00	2026-07-21 19:52:30.265+00	2026-07-21 19:50:42.168107+00	2026-07-21 19:52:30.265+00
0fb2d3a9-1008-4588-9942-e0dc2db4e5b9	8d9b2324-8014-4770-9f03-1ee71b681580	638702cb-a2e7-4961-94dc-bca1b17bda83	sub_1TvjmEL3kkHqgZODjoc8PsUq	active	2026-07-21 19:56:32.630999+00	\N	2026-07-21 19:56:32.630999+00	2026-07-21 19:56:32.630999+00
\.


--
-- Data for Name: team_tiers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.team_tiers (id, name, level_min, level_max, active, created_at) FROM stdin;
638702cb-a2e7-4961-94dc-bca1b17bda83	Junior Team	4	5	t	2026-07-21 03:25:14.269212+00
f5737be6-c2ee-4e31-83e1-dbcf9b8aa68b	Intermediate Team	6	7	t	2026-07-21 03:25:14.269212+00
74d3c84f-62c6-48d0-97b5-77c5289cd5cb	Elite Team	8	9	t	2026-07-21 03:25:14.269212+00
\.


--
-- Data for Name: token_packages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.token_packages (id, parent_id, course_type_id, total_tokens, used_tokens, expires_at, source, source_credit_id, source_booking_id, note, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: waitlist; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.waitlist (id, class_session_id, parent_id, student_id, "position", status, notified_at, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_19; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_19 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_20; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_20 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_21; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_21 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_22; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_22 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_23; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_23 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_24; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_24 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: messages_2026_07_25; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.messages_2026_07_25 (topic, extension, payload, event, private, updated_at, inserted_at, id, binary_payload) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: realtime; Owner: supabase_admin
--

COPY realtime.schema_migrations (version, inserted_at) FROM stdin;
20211116024918	2026-06-10 05:33:10
20211116045059	2026-06-10 05:33:10
20211116050929	2026-06-10 05:33:10
20211116051442	2026-06-10 05:33:10
20211116212300	2026-06-10 05:33:11
20211116213355	2026-06-10 05:33:11
20211116213934	2026-06-10 05:33:11
20211116214523	2026-06-10 05:33:11
20211122062447	2026-06-10 05:33:11
20211124070109	2026-06-10 05:33:11
20211202204204	2026-06-10 05:33:11
20211202204605	2026-06-10 05:33:11
20211210212804	2026-06-10 05:33:11
20211228014915	2026-06-10 05:33:11
20220107221237	2026-06-10 05:33:11
20220228202821	2026-06-10 05:33:11
20220312004840	2026-06-10 05:33:11
20220603231003	2026-06-10 05:33:11
20220603232444	2026-06-10 05:33:11
20220615214548	2026-06-10 05:33:11
20220712093339	2026-06-10 05:33:11
20220908172859	2026-06-10 05:33:11
20220916233421	2026-06-10 05:33:11
20230119133233	2026-06-10 05:33:11
20230128025114	2026-06-10 05:33:11
20230128025212	2026-06-10 05:33:11
20230227211149	2026-06-10 05:33:11
20230228184745	2026-06-10 05:33:11
20230308225145	2026-06-10 05:33:11
20230328144023	2026-06-10 05:33:11
20231018144023	2026-06-10 05:33:11
20231204144023	2026-06-10 05:33:11
20231204144024	2026-06-10 05:33:11
20231204144025	2026-06-10 05:33:11
20240108234812	2026-06-10 05:33:11
20240109165339	2026-06-10 05:33:11
20240227174441	2026-06-10 05:33:11
20240311171622	2026-06-10 05:33:11
20240321100241	2026-06-10 05:33:11
20240401105812	2026-06-10 05:33:11
20240418121054	2026-06-10 05:33:11
20240523004032	2026-06-10 05:33:11
20240618124746	2026-06-10 05:33:11
20240801235015	2026-06-10 05:33:11
20240805133720	2026-06-10 05:33:11
20240827160934	2026-06-10 05:33:11
20240919163303	2026-06-10 05:33:11
20240919163305	2026-06-10 05:33:11
20241019105805	2026-06-10 05:33:11
20241030150047	2026-06-10 05:33:11
20241108114728	2026-06-10 05:33:11
20241121104152	2026-06-10 05:33:11
20241130184212	2026-06-10 05:33:11
20241220035512	2026-06-10 05:33:11
20241220123912	2026-06-10 05:33:11
20241224161212	2026-06-10 05:33:11
20250107150512	2026-06-10 05:33:11
20250110162412	2026-06-10 05:33:11
20250123174212	2026-06-10 05:33:11
20250128220012	2026-06-10 05:33:11
20250506224012	2026-06-10 05:33:11
20250523164012	2026-06-10 05:33:11
20250714121412	2026-06-10 05:33:11
20250905041441	2026-06-10 05:33:11
20251103001201	2026-06-10 05:33:11
20251120212548	2026-06-10 05:33:11
20251120215549	2026-06-10 05:33:11
20260218120000	2026-06-10 05:33:11
20260326120000	2026-06-10 05:33:11
20260514120000	2026-06-10 05:33:11
20260527120000	2026-06-10 05:33:11
20260528120000	2026-06-10 05:33:11
20260603120000	2026-06-10 05:33:11
20260605120000	2026-06-16 22:16:12
20260606110000	2026-06-16 22:16:12
20260616120000	2026-06-25 03:07:54
20260624120000	2026-06-25 03:07:54
20260626120000	2026-07-02 08:43:31
20260706120000	2026-07-07 02:35:14
20260707120000	2026-07-14 21:35:38
20260709120000	2026-07-14 21:35:38
\.


--
-- Data for Name: subscription; Type: TABLE DATA; Schema: realtime; Owner: supabase_realtime_admin
--

COPY realtime.subscription (id, subscription_id, entity, filters, claims, created_at, action_filter, selected_columns) FROM stdin;
1955	8842bb40-8584-11f1-8c1b-0a58a9feac02	public.chat_threads	{}	{"aal": "aal1", "amr": [{"method": "password", "timestamp": 1784004799}], "aud": "authenticated", "exp": 1784697569, "iat": 1784693969, "iss": "https://uobflteojebscsfiortb.supabase.co/auth/v1", "sub": "c79771df-ca4c-4fa7-90e9-3faa379080f6", "role": "authenticated", "email": "hsiaoyungchou@gmail.com", "phone": "", "session_id": "2aafef11-1175-4407-982a-7a469d288969", "app_metadata": {"provider": "email", "providers": ["email"]}, "is_anonymous": false, "user_metadata": {"sub": "c79771df-ca4c-4fa7-90e9-3faa379080f6", "email": "hsiaoyungchou@gmail.com", "email_verified": true, "phone_verified": false}}	2026-07-22 04:19:30.793029	*	\N
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) FROM stdin;
\.


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets_analytics (name, type, format, created_at, updated_at, id, deleted_at) FROM stdin;
\.


--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets_vectors (id, type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.migrations (id, name, hash, executed_at) FROM stdin;
0	create-migrations-table	e18db593bcde2aca2a408c4d1100f6abba2195df	2026-06-10 01:32:57.912534
1	initialmigration	6ab16121fbaa08bbd11b712d05f358f9b555d777	2026-06-10 01:32:57.949074
2	storage-schema	f6a1fa2c93cbcd16d4e487b362e45fca157a8dbd	2026-06-10 01:32:57.984103
3	pathtoken-column	2cb1b0004b817b29d5b0a971af16bafeede4b70d	2026-06-10 01:32:58.006485
4	add-migrations-rls	427c5b63fe1c5937495d9c635c263ee7a5905058	2026-06-10 01:32:58.017933
5	add-size-functions	79e081a1455b63666c1294a440f8ad4b1e6a7f84	2026-06-10 01:32:58.020224
6	change-column-name-in-get-size	ded78e2f1b5d7e616117897e6443a925965b30d2	2026-06-10 01:32:58.022941
7	add-rls-to-buckets	e7e7f86adbc51049f341dfe8d30256c1abca17aa	2026-06-10 01:32:58.025936
8	add-public-to-buckets	fd670db39ed65f9d08b01db09d6202503ca2bab3	2026-06-10 01:32:58.02827
9	fix-search-function	af597a1b590c70519b464a4ab3be54490712796b	2026-06-10 01:32:58.031931
10	search-files-search-function	b595f05e92f7e91211af1bbfe9c6a13bb3391e16	2026-06-10 01:32:58.048738
11	add-trigger-to-auto-update-updated_at-column	7425bdb14366d1739fa8a18c83100636d74dcaa2	2026-06-10 01:32:58.056919
12	add-automatic-avif-detection-flag	8e92e1266eb29518b6a4c5313ab8f29dd0d08df9	2026-06-10 01:32:58.059821
13	add-bucket-custom-limits	cce962054138135cd9a8c4bcd531598684b25e7d	2026-06-10 01:32:58.062576
14	use-bytes-for-max-size	941c41b346f9802b411f06f30e972ad4744dad27	2026-06-10 01:32:58.065291
15	add-can-insert-object-function	934146bc38ead475f4ef4b555c524ee5d66799e5	2026-06-10 01:32:58.088297
16	add-version	76debf38d3fd07dcfc747ca49096457d95b1221b	2026-06-10 01:32:58.091372
17	drop-owner-foreign-key	f1cbb288f1b7a4c1eb8c38504b80ae2a0153d101	2026-06-10 01:32:58.094116
18	add_owner_id_column_deprecate_owner	e7a511b379110b08e2f214be852c35414749fe66	2026-06-10 01:32:58.096558
19	alter-default-value-objects-id	02e5e22a78626187e00d173dc45f58fa66a4f043	2026-06-10 01:32:58.100386
20	list-objects-with-delimiter	cd694ae708e51ba82bf012bba00caf4f3b6393b7	2026-06-10 01:32:58.102966
21	s3-multipart-uploads	8c804d4a566c40cd1e4cc5b3725a664a9303657f	2026-06-10 01:32:58.106922
22	s3-multipart-uploads-big-ints	9737dc258d2397953c9953d9b86920b8be0cdb73	2026-06-10 01:32:58.120006
23	optimize-search-function	9d7e604cddc4b56a5422dc68c9313f4a1b6f132c	2026-06-10 01:32:58.127036
24	operation-function	8312e37c2bf9e76bbe841aa5fda889206d2bf8aa	2026-06-10 01:32:58.129415
25	custom-metadata	d974c6057c3db1c1f847afa0e291e6165693b990	2026-06-10 01:32:58.131796
26	objects-prefixes	215cabcb7f78121892a5a2037a09fedf9a1ae322	2026-06-10 01:32:58.134521
27	search-v2	859ba38092ac96eb3964d83bf53ccc0b141663a6	2026-06-10 01:32:58.136518
28	object-bucket-name-sorting	c73a2b5b5d4041e39705814fd3a1b95502d38ce4	2026-06-10 01:32:58.138541
29	create-prefixes	ad2c1207f76703d11a9f9007f821620017a66c21	2026-06-10 01:32:58.140636
30	update-object-levels	2be814ff05c8252fdfdc7cfb4b7f5c7e17f0bed6	2026-06-10 01:32:58.14279
31	objects-level-index	b40367c14c3440ec75f19bbce2d71e914ddd3da0	2026-06-10 01:32:58.144811
32	backward-compatible-index-on-objects	e0c37182b0f7aee3efd823298fb3c76f1042c0f7	2026-06-10 01:32:58.146835
33	backward-compatible-index-on-prefixes	b480e99ed951e0900f033ec4eb34b5bdcb4e3d49	2026-06-10 01:32:58.148863
34	optimize-search-function-v1	ca80a3dc7bfef894df17108785ce29a7fc8ee456	2026-06-10 01:32:58.150936
35	add-insert-trigger-prefixes	458fe0ffd07ec53f5e3ce9df51bfdf4861929ccc	2026-06-10 01:32:58.152952
36	optimise-existing-functions	6ae5fca6af5c55abe95369cd4f93985d1814ca8f	2026-06-10 01:32:58.155123
37	add-bucket-name-length-trigger	3944135b4e3e8b22d6d4cbb568fe3b0b51df15c1	2026-06-10 01:32:58.157422
38	iceberg-catalog-flag-on-buckets	02716b81ceec9705aed84aa1501657095b32e5c5	2026-06-10 01:32:58.160402
39	add-search-v2-sort-support	6706c5f2928846abee18461279799ad12b279b78	2026-06-10 01:32:58.169366
40	fix-prefix-race-conditions-optimized	7ad69982ae2d372b21f48fc4829ae9752c518f6b	2026-06-10 01:32:58.171335
41	add-object-level-update-trigger	07fcf1a22165849b7a029deed059ffcde08d1ae0	2026-06-10 01:32:58.173625
42	rollback-prefix-triggers	771479077764adc09e2ea2043eb627503c034cd4	2026-06-10 01:32:58.175688
43	fix-object-level	84b35d6caca9d937478ad8a797491f38b8c2979f	2026-06-10 01:32:58.177742
44	vector-bucket-type	99c20c0ffd52bb1ff1f32fb992f3b351e3ef8fb3	2026-06-10 01:32:58.179815
45	vector-buckets	049e27196d77a7cb76497a85afae669d8b230953	2026-06-10 01:32:58.182528
46	buckets-objects-grants	fedeb96d60fefd8e02ab3ded9fbde05632f84aed	2026-06-10 01:32:58.190681
47	iceberg-table-metadata	649df56855c24d8b36dd4cc1aeb8251aa9ad42c2	2026-06-10 01:32:58.193351
48	iceberg-catalog-ids	e0e8b460c609b9999ccd0df9ad14294613eed939	2026-06-10 01:32:58.196244
49	buckets-objects-grants-postgres	072b1195d0d5a2f888af6b2302a1938dd94b8b3d	2026-06-10 01:32:58.21147
50	search-v2-optimised	6323ac4f850aa14e7387eb32102869578b5bd478	2026-06-10 01:32:58.216259
51	index-backward-compatible-search	2ee395d433f76e38bcd3856debaf6e0e5b674011	2026-06-10 01:32:58.342922
52	drop-not-used-indexes-and-functions	5cc44c8696749ac11dd0dc37f2a3802075f3a171	2026-06-10 01:32:58.345642
53	drop-index-lower-name	d0cb18777d9e2a98ebe0bc5cc7a42e57ebe41854	2026-06-10 01:32:58.38118
54	drop-index-object-level	6289e048b1472da17c31a7eba1ded625a6457e67	2026-06-10 01:32:58.388393
55	prevent-direct-deletes	262a4798d5e0f2e7c8970232e03ce8be695d5819	2026-06-10 01:32:58.393981
56	fix-optimized-search-function	b823ed1e418101032fa01374edc9a436e54e3ed4	2026-06-10 01:32:58.414795
57	s3-multipart-uploads-metadata	f127886e00d1b374fadbc7c6b31e09336aad5287	2026-06-10 01:32:58.453906
58	operation-ergonomics	00ca5d483b3fe0d522133d9002ccc5df98365120	2026-06-10 01:32:58.461772
59	drop-unused-functions	38456f13e39691c2bbb4b5151d0d1cdbabd4a8c4	2026-06-10 01:32:58.484577
60	optimize-existing-functions-again	db35e1c91a9201e59f4fef8d972c2f277d68b157	2026-06-10 01:32:58.490201
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata, version, owner_id, user_metadata) FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.s3_multipart_uploads (id, in_progress_size, upload_signature, bucket_id, key, version, owner_id, created_at, user_metadata, metadata) FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.s3_multipart_uploads_parts (id, upload_id, size, part_number, bucket_id, key, etag, owner_id, version, created_at) FROM stdin;
\.


--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.vector_indexes (id, name, bucket_id, data_type, dimension, distance_metric, metadata_configuration, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--

COPY vault.secrets (id, name, description, secret, key_id, nonce, created_at, updated_at) FROM stdin;
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 1213, true);


--
-- Name: invoice_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoice_seq', 42, true);


--
-- Name: subscription_id_seq; Type: SEQUENCE SET; Schema: realtime; Owner: supabase_realtime_admin
--

SELECT pg_catalog.setval('realtime.subscription_id_seq', 1956, true);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: admins admins_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: ai_tool_logs ai_tool_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_tool_logs
    ADD CONSTRAINT ai_tool_logs_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_booking_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_booking_id_student_id_key UNIQUE (booking_id, student_id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: booking_students booking_students_booking_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_students
    ADD CONSTRAINT booking_students_booking_id_student_id_key UNIQUE (booking_id, student_id);


--
-- Name: booking_students booking_students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_students
    ADD CONSTRAINT booking_students_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_threads chat_threads_parent_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_parent_unique UNIQUE (parent_id);


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: class_sessions class_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);


--
-- Name: coach_availability coach_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_availability
    ADD CONSTRAINT coach_availability_pkey PRIMARY KEY (id);


--
-- Name: coach_availability_zones coach_availability_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_availability_zones
    ADD CONSTRAINT coach_availability_zones_pkey PRIMARY KEY (id);


--
-- Name: coach_time_off coach_time_off_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_time_off
    ADD CONSTRAINT coach_time_off_pkey PRIMARY KEY (id);


--
-- Name: coaches coaches_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: coaches coaches_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_email_key UNIQUE (email);


--
-- Name: coaches coaches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: course_types course_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_types
    ADD CONSTRAINT course_types_pkey PRIMARY KEY (id);


--
-- Name: course_types course_types_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_types
    ADD CONSTRAINT course_types_slug_key UNIQUE (slug);


--
-- Name: email_otps email_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_otps
    ADD CONSTRAINT email_otps_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: lesson_credits lesson_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_credits
    ADD CONSTRAINT lesson_credits_pkey PRIMARY KEY (id);


--
-- Name: lesson_packages lesson_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_packages
    ADD CONSTRAINT lesson_packages_pkey PRIMARY KEY (id);


--
-- Name: level_recommendations level_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_recommendations
    ADD CONSTRAINT level_recommendations_pkey PRIMARY KEY (id);


--
-- Name: level_upgrades level_upgrades_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_upgrades
    ADD CONSTRAINT level_upgrades_pkey PRIMARY KEY (id);


--
-- Name: levels levels_level_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_level_number_key UNIQUE (level_number);


--
-- Name: levels levels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_pkey PRIMARY KEY (id);


--
-- Name: makeup_credits makeup_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_credits
    ADD CONSTRAINT makeup_credits_pkey PRIMARY KEY (id);


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: parent_partnerships parent_partnerships_initiator_parent_id_partner_parent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_partnerships
    ADD CONSTRAINT parent_partnerships_initiator_parent_id_partner_parent_id_key UNIQUE (initiator_parent_id, partner_parent_id);


--
-- Name: parent_partnerships parent_partnerships_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_partnerships
    ADD CONSTRAINT parent_partnerships_invite_code_key UNIQUE (invite_code);


--
-- Name: parent_partnerships parent_partnerships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_partnerships
    ADD CONSTRAINT parent_partnerships_pkey PRIMARY KEY (id);


--
-- Name: parents parents_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parents
    ADD CONSTRAINT parents_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: parents parents_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parents
    ADD CONSTRAINT parents_email_key UNIQUE (email);


--
-- Name: parents parents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parents
    ADD CONSTRAINT parents_pkey PRIMARY KEY (id);


--
-- Name: phone_otps phone_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.phone_otps
    ADD CONSTRAINT phone_otps_pkey PRIMARY KEY (id);


--
-- Name: progress_history progress_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_history
    ADD CONSTRAINT progress_history_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: student_notes student_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_notes
    ADD CONSTRAINT student_notes_pkey PRIMARY KEY (id);


--
-- Name: student_skill_progress student_skill_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_skill_progress
    ADD CONSTRAINT student_skill_progress_pkey PRIMARY KEY (id);


--
-- Name: student_skill_progress student_skill_progress_student_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_skill_progress
    ADD CONSTRAINT student_skill_progress_student_id_skill_id_key UNIQUE (student_id, skill_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_qr_code_key UNIQUE (qr_code);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: team_attendance team_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_attendance
    ADD CONSTRAINT team_attendance_pkey PRIMARY KEY (id);


--
-- Name: team_attendance team_attendance_student_id_practice_date_start_time_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_attendance
    ADD CONSTRAINT team_attendance_student_id_practice_date_start_time_key UNIQUE (student_id, practice_date, start_time);


--
-- Name: team_memberships team_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_pkey PRIMARY KEY (id);


--
-- Name: team_tiers team_tiers_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_tiers
    ADD CONSTRAINT team_tiers_name_key UNIQUE (name);


--
-- Name: team_tiers team_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_tiers
    ADD CONSTRAINT team_tiers_pkey PRIMARY KEY (id);


--
-- Name: token_packages token_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_packages
    ADD CONSTRAINT token_packages_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_class_session_id_parent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_class_session_id_parent_id_key UNIQUE (class_session_id, parent_id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_19 messages_2026_07_19_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_19
    ADD CONSTRAINT messages_2026_07_19_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_20 messages_2026_07_20_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_20
    ADD CONSTRAINT messages_2026_07_20_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_21 messages_2026_07_21_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_21
    ADD CONSTRAINT messages_2026_07_21_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_22 messages_2026_07_22_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_22
    ADD CONSTRAINT messages_2026_07_22_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_23 messages_2026_07_23_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_23
    ADD CONSTRAINT messages_2026_07_23_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_24 messages_2026_07_24_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_24
    ADD CONSTRAINT messages_2026_07_24_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_07_25 messages_2026_07_25_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.messages_2026_07_25
    ADD CONSTRAINT messages_2026_07_25_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: supabase_admin
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: bookings_token_package_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bookings_token_package_idx ON public.bookings USING btree (token_package_id) WHERE (token_package_id IS NOT NULL);


--
-- Name: bookings_unique_active_student_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX bookings_unique_active_student_session ON public.bookings USING btree (student_id, class_session_id) WHERE (status <> 'cancelled'::text);


--
-- Name: idx_email_otps_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_otps_email ON public.email_otps USING btree (email);


--
-- Name: idx_phone_otps_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_phone_otps_phone ON public.phone_otps USING btree (phone);


--
-- Name: idx_progress_history_class_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_progress_history_class_session ON public.progress_history USING btree (class_session_id);


--
-- Name: idx_sessions_date_coach; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_date_coach ON public.class_sessions USING btree (session_date, coach_id);


--
-- Name: idx_sessions_date_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_date_type ON public.class_sessions USING btree (session_date, course_type_id);


--
-- Name: idx_student_notes_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_notes_student ON public.student_notes USING btree (student_id, pinned DESC, created_at DESC);


--
-- Name: idx_tm_active_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_tm_active_student ON public.team_memberships USING btree (student_id) WHERE (status = 'active'::text);


--
-- Name: idx_tm_tier_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tm_tier_status ON public.team_memberships USING btree (team_tier_id, status);


--
-- Name: idx_zones_coach_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_zones_coach_date ON public.coach_availability_zones USING btree (coach_id, override_date);


--
-- Name: idx_zones_coach_weekly; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_zones_coach_weekly ON public.coach_availability_zones USING btree (coach_id, kind, weekday);


--
-- Name: lesson_credits_convert_scan_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX lesson_credits_convert_scan_idx ON public.lesson_credits USING btree (expires_at) WHERE (converted_to_token_at IS NULL);


--
-- Name: token_packages_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX token_packages_parent_idx ON public.token_packages USING btree (parent_id, expires_at);


--
-- Name: token_packages_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX token_packages_source_idx ON public.token_packages USING btree (parent_id, source);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_19_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_19_inserted_at_topic_idx ON realtime.messages_2026_07_19 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_20_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_20_inserted_at_topic_idx ON realtime.messages_2026_07_20 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_21_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_21_inserted_at_topic_idx ON realtime.messages_2026_07_21 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_22_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_22_inserted_at_topic_idx ON realtime.messages_2026_07_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_23_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_23_inserted_at_topic_idx ON realtime.messages_2026_07_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_24_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_24_inserted_at_topic_idx ON realtime.messages_2026_07_24 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_07_25_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE INDEX messages_2026_07_25_inserted_at_topic_idx ON realtime.messages_2026_07_25 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_07_19_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_19_inserted_at_topic_idx;


--
-- Name: messages_2026_07_19_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_19_pkey;


--
-- Name: messages_2026_07_20_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_20_inserted_at_topic_idx;


--
-- Name: messages_2026_07_20_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_20_pkey;


--
-- Name: messages_2026_07_21_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_21_inserted_at_topic_idx;


--
-- Name: messages_2026_07_21_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_21_pkey;


--
-- Name: messages_2026_07_22_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_22_inserted_at_topic_idx;


--
-- Name: messages_2026_07_22_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_22_pkey;


--
-- Name: messages_2026_07_23_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_23_inserted_at_topic_idx;


--
-- Name: messages_2026_07_23_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_23_pkey;


--
-- Name: messages_2026_07_24_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_24_inserted_at_topic_idx;


--
-- Name: messages_2026_07_24_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_24_pkey;


--
-- Name: messages_2026_07_25_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_07_25_inserted_at_topic_idx;


--
-- Name: messages_2026_07_25_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_07_25_pkey;


--
-- Name: bookings trg_booking_coach_conflict; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_booking_coach_conflict BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.check_booking_coach_conflict();


--
-- Name: bookings trg_booking_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_booking_count AFTER INSERT OR DELETE OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_enrolled_count();


--
-- Name: bookings trg_bookings_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: class_sessions trg_class_sessions_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_class_sessions_updated BEFORE UPDATE ON public.class_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: coaches trg_coaches_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_coaches_updated BEFORE UPDATE ON public.coaches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: course_types trg_course_types_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_course_types_updated BEFORE UPDATE ON public.course_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: lesson_credits trg_lesson_credits_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_lesson_credits_updated BEFORE UPDATE ON public.lesson_credits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: lesson_packages trg_lesson_packages_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_lesson_packages_updated BEFORE UPDATE ON public.lesson_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: student_skill_progress trg_level_upgrade; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_level_upgrade AFTER INSERT OR UPDATE ON public.student_skill_progress FOR EACH ROW EXECUTE FUNCTION public.check_level_upgrade();


--
-- Name: levels trg_levels_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_levels_updated BEFORE UPDATE ON public.levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: students trg_max_students; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_max_students BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.check_max_students_per_parent();


--
-- Name: parents trg_parents_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_parents_updated BEFORE UPDATE ON public.parents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: skills trg_skills_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_skills_updated BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: students trg_students_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: supabase_realtime_admin
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: supabase_storage_admin
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admins admins_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: attendance attendance_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.coaches(id);


--
-- Name: attendance attendance_class_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_session_id_fkey FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id);


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: booking_students booking_students_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_students
    ADD CONSTRAINT booking_students_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_students booking_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_students
    ADD CONSTRAINT booking_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: bookings bookings_class_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_class_session_id_fkey FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id);


--
-- Name: bookings bookings_lesson_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_lesson_credit_id_fkey FOREIGN KEY (lesson_credit_id) REFERENCES public.lesson_credits(id);


--
-- Name: bookings bookings_original_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_original_booking_id_fkey FOREIGN KEY (original_booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: bookings bookings_partner_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_partner_booking_id_fkey FOREIGN KEY (partner_booking_id) REFERENCES public.bookings(id);


--
-- Name: bookings bookings_partner_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_partner_parent_id_fkey FOREIGN KEY (partner_parent_id) REFERENCES public.parents(id);


--
-- Name: bookings bookings_partnership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.parent_partnerships(id);


--
-- Name: bookings bookings_pending_new_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pending_new_session_id_fkey FOREIGN KEY (pending_new_session_id) REFERENCES public.class_sessions(id);


--
-- Name: bookings bookings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: bookings bookings_token_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_token_package_id_fkey FOREIGN KEY (token_package_id) REFERENCES public.token_packages(id);


--
-- Name: chat_messages chat_messages_sender_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_admin_id_fkey FOREIGN KEY (sender_admin_id) REFERENCES public.admins(id);


--
-- Name: chat_messages chat_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


--
-- Name: chat_threads chat_threads_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.admins(id);


--
-- Name: chat_threads chat_threads_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id) ON DELETE CASCADE;


--
-- Name: class_sessions class_sessions_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);


--
-- Name: class_sessions class_sessions_course_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_course_type_id_fkey FOREIGN KEY (course_type_id) REFERENCES public.course_types(id);


--
-- Name: coach_availability coach_availability_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_availability
    ADD CONSTRAINT coach_availability_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;


--
-- Name: coach_availability_zones coach_availability_zones_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_availability_zones
    ADD CONSTRAINT coach_availability_zones_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);


--
-- Name: coach_availability_zones coach_availability_zones_team_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_availability_zones
    ADD CONSTRAINT coach_availability_zones_team_tier_id_fkey FOREIGN KEY (team_tier_id) REFERENCES public.team_tiers(id);


--
-- Name: coach_time_off coach_time_off_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coach_time_off
    ADD CONSTRAINT coach_time_off_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;


--
-- Name: coaches coaches_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_lesson_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_lesson_credit_id_fkey FOREIGN KEY (lesson_credit_id) REFERENCES public.lesson_credits(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: lesson_credits lesson_credits_course_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_credits
    ADD CONSTRAINT lesson_credits_course_type_id_fkey FOREIGN KEY (course_type_id) REFERENCES public.course_types(id);


--
-- Name: lesson_credits lesson_credits_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_credits
    ADD CONSTRAINT lesson_credits_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: lesson_credits lesson_credits_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_credits
    ADD CONSTRAINT lesson_credits_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id);


--
-- Name: lesson_credits lesson_credits_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_credits
    ADD CONSTRAINT lesson_credits_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: lesson_packages lesson_packages_course_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lesson_packages
    ADD CONSTRAINT lesson_packages_course_type_id_fkey FOREIGN KEY (course_type_id) REFERENCES public.course_types(id);


--
-- Name: level_recommendations level_recommendations_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_recommendations
    ADD CONSTRAINT level_recommendations_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);


--
-- Name: level_recommendations level_recommendations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_recommendations
    ADD CONSTRAINT level_recommendations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admins(id);


--
-- Name: level_recommendations level_recommendations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_recommendations
    ADD CONSTRAINT level_recommendations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: level_upgrades level_upgrades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_upgrades
    ADD CONSTRAINT level_upgrades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: level_upgrades level_upgrades_upgraded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.level_upgrades
    ADD CONSTRAINT level_upgrades_upgraded_by_fkey FOREIGN KEY (upgraded_by) REFERENCES public.coaches(id);


--
-- Name: makeup_credits makeup_credits_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_credits
    ADD CONSTRAINT makeup_credits_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: makeup_credits makeup_credits_course_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_credits
    ADD CONSTRAINT makeup_credits_course_type_id_fkey FOREIGN KEY (course_type_id) REFERENCES public.course_types(id);


--
-- Name: makeup_credits makeup_credits_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_credits
    ADD CONSTRAINT makeup_credits_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: makeup_credits makeup_credits_used_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.makeup_credits
    ADD CONSTRAINT makeup_credits_used_booking_id_fkey FOREIGN KEY (used_booking_id) REFERENCES public.bookings(id);


--
-- Name: message_threads message_threads_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.message_threads(id) ON DELETE CASCADE;


--
-- Name: notification_log notification_log_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: parent_partnerships parent_partnerships_initiator_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_partnerships
    ADD CONSTRAINT parent_partnerships_initiator_parent_id_fkey FOREIGN KEY (initiator_parent_id) REFERENCES public.parents(id) ON DELETE CASCADE;


--
-- Name: parent_partnerships parent_partnerships_partner_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_partnerships
    ADD CONSTRAINT parent_partnerships_partner_parent_id_fkey FOREIGN KEY (partner_parent_id) REFERENCES public.parents(id) ON DELETE CASCADE;


--
-- Name: parents parents_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parents
    ADD CONSTRAINT parents_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: progress_history progress_history_class_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_history
    ADD CONSTRAINT progress_history_class_session_id_fkey FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id);


--
-- Name: progress_history progress_history_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_history
    ADD CONSTRAINT progress_history_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);


--
-- Name: progress_history progress_history_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_history
    ADD CONSTRAINT progress_history_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admins(id);


--
-- Name: progress_history progress_history_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_history
    ADD CONSTRAINT progress_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: purchases purchases_lesson_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_lesson_package_id_fkey FOREIGN KEY (lesson_package_id) REFERENCES public.lesson_packages(id);


--
-- Name: purchases purchases_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: purchases purchases_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);


--
-- Name: purchases purchases_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: skills skills_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.levels(id) ON DELETE CASCADE;


--
-- Name: student_notes student_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_notes
    ADD CONSTRAINT student_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: student_notes student_notes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_notes
    ADD CONSTRAINT student_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_skill_progress student_skill_progress_last_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_skill_progress
    ADD CONSTRAINT student_skill_progress_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES public.coaches(id);


--
-- Name: student_skill_progress student_skill_progress_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_skill_progress
    ADD CONSTRAINT student_skill_progress_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: student_skill_progress student_skill_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_skill_progress
    ADD CONSTRAINT student_skill_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id) ON DELETE CASCADE;


--
-- Name: team_attendance team_attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_attendance
    ADD CONSTRAINT team_attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: team_attendance team_attendance_team_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_attendance
    ADD CONSTRAINT team_attendance_team_tier_id_fkey FOREIGN KEY (team_tier_id) REFERENCES public.team_tiers(id);


--
-- Name: team_memberships team_memberships_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: team_memberships team_memberships_team_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_team_tier_id_fkey FOREIGN KEY (team_tier_id) REFERENCES public.team_tiers(id);


--
-- Name: token_packages token_packages_course_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_packages
    ADD CONSTRAINT token_packages_course_type_id_fkey FOREIGN KEY (course_type_id) REFERENCES public.course_types(id);


--
-- Name: token_packages token_packages_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_packages
    ADD CONSTRAINT token_packages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: token_packages token_packages_source_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_packages
    ADD CONSTRAINT token_packages_source_booking_id_fkey FOREIGN KEY (source_booking_id) REFERENCES public.bookings(id);


--
-- Name: token_packages token_packages_source_credit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.token_packages
    ADD CONSTRAINT token_packages_source_credit_id_fkey FOREIGN KEY (source_credit_id) REFERENCES public.lesson_credits(id);


--
-- Name: waitlist waitlist_class_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_class_session_id_fkey FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id);


--
-- Name: waitlist waitlist_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.parents(id);


--
-- Name: waitlist waitlist_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings Admins can insert bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can insert bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: bookings Admins can read all bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can read all bookings" ON public.bookings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: bookings Admins can update all bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update all bookings" ON public.bookings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: class_sessions Anyone can read class_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can read class_sessions" ON public.class_sessions FOR SELECT TO authenticated USING (true);


--
-- Name: coach_availability Anyone can read coach_availability; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can read coach_availability" ON public.coach_availability FOR SELECT TO authenticated USING (true);


--
-- Name: coaches Anyone can read coaches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can read coaches" ON public.coaches FOR SELECT TO authenticated USING (true);


--
-- Name: course_types Anyone can read course_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can read course_types" ON public.course_types FOR SELECT TO authenticated USING (true);


--
-- Name: lesson_credits Authenticated users can read credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read credits" ON public.lesson_credits FOR SELECT TO authenticated USING (true);


--
-- Name: class_sessions Authenticated users can update class_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update class_sessions" ON public.class_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: lesson_credits Authenticated users can update credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can update credits" ON public.lesson_credits FOR UPDATE TO authenticated USING (true);


--
-- Name: bookings Parents can insert bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can insert bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: class_sessions Parents can insert class_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can insert class_sessions" ON public.class_sessions FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: parents Parents can insert own record; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can insert own record" ON public.parents FOR INSERT WITH CHECK ((auth.uid() = auth_user_id));


--
-- Name: students Parents can insert students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can insert students" ON public.students FOR INSERT WITH CHECK ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: bookings Parents can read own bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can read own bookings" ON public.bookings FOR SELECT TO authenticated USING ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: parents Parents can read own record; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can read own record" ON public.parents FOR SELECT USING ((auth.uid() = auth_user_id));


--
-- Name: students Parents can read own students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can read own students" ON public.students FOR SELECT USING ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: parents Parents can update own record; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can update own record" ON public.parents FOR UPDATE USING ((auth.uid() = auth_user_id));


--
-- Name: students Parents can update own students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can update own students" ON public.students FOR UPDATE USING ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: invoices Parents can view own invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Parents can view own invoices" ON public.invoices FOR SELECT USING ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: chat_messages admin_all_messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_all_messages ON public.chat_messages USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: chat_threads admin_all_threads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_all_threads ON public.chat_threads USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: level_upgrades admins_manage_level_upgrades; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_manage_level_upgrades ON public.level_upgrades TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: coaches admins_read_all_coaches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_read_all_coaches ON public.coaches FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: parents admins_read_all_parents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_read_all_parents ON public.parents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: students admins_read_all_students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_read_all_students ON public.students FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: admins admins_read_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_read_self ON public.admins FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: coach_time_off admins_read_time_off; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_read_time_off ON public.coach_time_off FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: students admins_update_students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_update_students ON public.students FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.auth_user_id = auth.uid()))));


--
-- Name: ai_tool_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_tool_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_students; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.booking_students ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_partnerships both parties can update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "both parties can update" ON public.parent_partnerships FOR UPDATE USING ((auth.uid() IN ( SELECT parents.auth_user_id
   FROM public.parents
  WHERE (parents.id = parent_partnerships.initiator_parent_id)
UNION
 SELECT parents.auth_user_id
   FROM public.parents
  WHERE (parents.id = parent_partnerships.partner_parent_id))));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_threads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: class_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: coach_availability; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.coach_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: coach_availability_zones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.coach_availability_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: coach_time_off; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.coach_time_off ENABLE ROW LEVEL SECURITY;

--
-- Name: coaches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

--
-- Name: coach_time_off coaches_manage_own_time_off; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_manage_own_time_off ON public.coach_time_off TO authenticated USING ((coach_id = ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_user_id = auth.uid())))) WITH CHECK ((coach_id = ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_user_id = auth.uid()))));


--
-- Name: bookings coaches_read_bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_read_bookings ON public.bookings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.class_sessions cs
     JOIN public.coaches c ON ((c.id = cs.coach_id)))
  WHERE ((cs.id = bookings.class_session_id) AND (c.auth_user_id = auth.uid())))));


--
-- Name: levels coaches_read_levels; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_read_levels ON public.levels FOR SELECT TO authenticated USING (true);


--
-- Name: student_skill_progress coaches_read_skill_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_read_skill_progress ON public.student_skill_progress FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.coaches
  WHERE (coaches.auth_user_id = auth.uid()))));


--
-- Name: skills coaches_read_skills; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_read_skills ON public.skills FOR SELECT TO authenticated USING (true);


--
-- Name: students coaches_read_students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_read_students ON public.students FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.coaches
  WHERE (coaches.auth_user_id = auth.uid()))));


--
-- Name: student_skill_progress coaches_write_skill_progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY coaches_write_skill_progress ON public.student_skill_progress TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.coaches
  WHERE (coaches.auth_user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.coaches
  WHERE (coaches.auth_user_id = auth.uid()))));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: course_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.course_types ENABLE ROW LEVEL SECURITY;

--
-- Name: email_otps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_credits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lesson_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_packages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: level_recommendations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.level_recommendations ENABLE ROW LEVEL SECURITY;

--
-- Name: level_upgrades; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.level_upgrades ENABLE ROW LEVEL SECURITY;

--
-- Name: levels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

--
-- Name: makeup_credits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.makeup_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: message_threads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_partnerships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.parent_partnerships ENABLE ROW LEVEL SECURITY;

--
-- Name: parents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_partnerships parents can insert as initiator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "parents can insert as initiator" ON public.parent_partnerships FOR INSERT WITH CHECK ((auth.uid() = ( SELECT parents.auth_user_id
   FROM public.parents
  WHERE (parents.id = parent_partnerships.initiator_parent_id))));


--
-- Name: parent_partnerships parents can see own partnerships; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "parents can see own partnerships" ON public.parent_partnerships FOR SELECT USING ((auth.uid() IN ( SELECT parents.auth_user_id
   FROM public.parents
  WHERE (parents.id = parent_partnerships.initiator_parent_id)
UNION
 SELECT parents.auth_user_id
   FROM public.parents
  WHERE (parents.id = parent_partnerships.partner_parent_id))));


--
-- Name: bookings parents_can_cancel_own_bookings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parents_can_cancel_own_bookings ON public.bookings FOR UPDATE TO authenticated USING ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid())))) WITH CHECK ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: parents parents_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parents_insert ON public.parents FOR INSERT WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: chat_messages parents_own_messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parents_own_messages ON public.chat_messages USING ((thread_id IN ( SELECT chat_threads.id
   FROM public.chat_threads
  WHERE (chat_threads.parent_id = ( SELECT parents.id
           FROM public.parents
          WHERE (parents.auth_user_id = auth.uid()))))));


--
-- Name: chat_threads parents_own_thread; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parents_own_thread ON public.chat_threads USING ((parent_id = ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: lesson_credits parents_read_own_credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parents_read_own_credits ON public.lesson_credits FOR SELECT TO authenticated USING (((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))) OR (student_id IN ( SELECT s.id
   FROM (public.students s
     JOIN public.parents p ON ((s.parent_id = p.id)))
  WHERE (p.auth_user_id = auth.uid())))));


--
-- Name: parents parents_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parents_self ON public.parents USING ((auth_user_id = auth.uid()));


--
-- Name: phone_otps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: progress_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.progress_history ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: level_recommendations service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service role full access" ON public.level_recommendations USING (true) WITH CHECK (true);


--
-- Name: progress_history service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service role full access" ON public.progress_history USING (true) WITH CHECK (true);


--
-- Name: student_skill_progress service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service role full access" ON public.student_skill_progress USING (true) WITH CHECK (true);


--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: student_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: student_skill_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_skill_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_insert ON public.students FOR INSERT WITH CHECK ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: students students_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_self ON public.students USING ((parent_id IN ( SELECT parents.id
   FROM public.parents
  WHERE (parents.auth_user_id = auth.uid()))));


--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: team_attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.team_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: team_memberships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: team_tiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.team_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: token_packages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.token_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: supabase_realtime_admin
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: supabase_admin
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime_messages_publication OWNER TO supabase_admin;

--
-- Name: supabase_realtime chat_messages; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_messages;


--
-- Name: supabase_realtime chat_threads; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.chat_threads;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: supabase_admin
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA realtime TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA vault TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.armor(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.armor(bytea, text[], text[]) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.crypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.dearmor(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.digest(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.digest(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_random_bytes(integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_random_uuid() FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text, integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.hmac(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.hmac(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO dashboard_user;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_key_id(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1mc() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v4() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_nil() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_dns() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_oid() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_url() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_x500() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: supabase_admin
--

GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- Name: FUNCTION check_booking_coach_conflict(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_booking_coach_conflict() TO anon;
GRANT ALL ON FUNCTION public.check_booking_coach_conflict() TO authenticated;
GRANT ALL ON FUNCTION public.check_booking_coach_conflict() TO service_role;


--
-- Name: FUNCTION check_coach_timeslot_conflict(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_coach_timeslot_conflict() TO anon;
GRANT ALL ON FUNCTION public.check_coach_timeslot_conflict() TO authenticated;
GRANT ALL ON FUNCTION public.check_coach_timeslot_conflict() TO service_role;


--
-- Name: FUNCTION check_level_upgrade(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_level_upgrade() TO anon;
GRANT ALL ON FUNCTION public.check_level_upgrade() TO authenticated;
GRANT ALL ON FUNCTION public.check_level_upgrade() TO service_role;


--
-- Name: FUNCTION check_max_students_per_parent(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_max_students_per_parent() TO anon;
GRANT ALL ON FUNCTION public.check_max_students_per_parent() TO authenticated;
GRANT ALL ON FUNCTION public.check_max_students_per_parent() TO service_role;


--
-- Name: FUNCTION decrement_enrolled(session_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.decrement_enrolled(session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.decrement_enrolled(session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.decrement_enrolled(session_id uuid) TO service_role;


--
-- Name: FUNCTION decrement_used_credits(credit_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.decrement_used_credits(credit_id uuid) TO anon;
GRANT ALL ON FUNCTION public.decrement_used_credits(credit_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.decrement_used_credits(credit_id uuid) TO service_role;


--
-- Name: FUNCTION get_next_invoice_seq(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_next_invoice_seq() TO anon;
GRANT ALL ON FUNCTION public.get_next_invoice_seq() TO authenticated;
GRANT ALL ON FUNCTION public.get_next_invoice_seq() TO service_role;


--
-- Name: FUNCTION get_students_ready_for_upgrade(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_students_ready_for_upgrade() TO anon;
GRANT ALL ON FUNCTION public.get_students_ready_for_upgrade() TO authenticated;
GRANT ALL ON FUNCTION public.get_students_ready_for_upgrade() TO service_role;


--
-- Name: FUNCTION increment_credit(credit_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.increment_credit(credit_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_credit(credit_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_credit(credit_id uuid) TO service_role;


--
-- Name: FUNCTION increment_enrolled(session_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.increment_enrolled(session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_enrolled(session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_enrolled(session_id uuid) TO service_role;


--
-- Name: FUNCTION increment_used_credits(credit_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.increment_used_credits(credit_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_used_credits(credit_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_used_credits(credit_id uuid) TO service_role;


--
-- Name: FUNCTION increment_used_tokens(token_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.increment_used_tokens(token_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_used_tokens(token_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_used_tokens(token_id uuid) TO service_role;


--
-- Name: FUNCTION update_enrolled_count(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_enrolled_count() TO anon;
GRANT ALL ON FUNCTION public.update_enrolled_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_enrolled_count() TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;


--
-- Name: FUNCTION broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;
GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;


--
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;


--
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO service_role;


--
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;


--
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;


--
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;


--
-- Name: FUNCTION send(payload jsonb, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION send_binary(payload bytea, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;


--
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;


--
-- Name: FUNCTION topic(); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.topic() TO postgres;
GRANT ALL ON FUNCTION realtime.topic() TO dashboard_user;


--
-- Name: FUNCTION wal2json_escape_identifier(name text); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO postgres;
GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO dashboard_user;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE extensions.pg_stat_statements FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements TO dashboard_user;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON TABLE extensions.pg_stat_statements_info FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO dashboard_user;


--
-- Name: TABLE admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admins TO anon;
GRANT ALL ON TABLE public.admins TO authenticated;
GRANT ALL ON TABLE public.admins TO service_role;


--
-- Name: TABLE ai_tool_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_tool_logs TO anon;
GRANT ALL ON TABLE public.ai_tool_logs TO authenticated;
GRANT ALL ON TABLE public.ai_tool_logs TO service_role;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;


--
-- Name: TABLE booking_students; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.booking_students TO anon;
GRANT ALL ON TABLE public.booking_students TO authenticated;
GRANT ALL ON TABLE public.booking_students TO service_role;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.bookings TO anon;
GRANT ALL ON TABLE public.bookings TO authenticated;
GRANT ALL ON TABLE public.bookings TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_messages TO anon;
GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE chat_threads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_threads TO anon;
GRANT ALL ON TABLE public.chat_threads TO authenticated;
GRANT ALL ON TABLE public.chat_threads TO service_role;


--
-- Name: TABLE class_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_sessions TO anon;
GRANT ALL ON TABLE public.class_sessions TO authenticated;
GRANT ALL ON TABLE public.class_sessions TO service_role;


--
-- Name: TABLE coach_availability; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coach_availability TO anon;
GRANT ALL ON TABLE public.coach_availability TO authenticated;
GRANT ALL ON TABLE public.coach_availability TO service_role;


--
-- Name: TABLE coach_availability_zones; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coach_availability_zones TO anon;
GRANT ALL ON TABLE public.coach_availability_zones TO authenticated;
GRANT ALL ON TABLE public.coach_availability_zones TO service_role;


--
-- Name: TABLE coach_time_off; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coach_time_off TO anon;
GRANT ALL ON TABLE public.coach_time_off TO authenticated;
GRANT ALL ON TABLE public.coach_time_off TO service_role;


--
-- Name: TABLE coaches; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coaches TO anon;
GRANT ALL ON TABLE public.coaches TO authenticated;
GRANT ALL ON TABLE public.coaches TO service_role;


--
-- Name: TABLE coupons; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.coupons TO anon;
GRANT ALL ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;


--
-- Name: TABLE course_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.course_types TO anon;
GRANT ALL ON TABLE public.course_types TO authenticated;
GRANT ALL ON TABLE public.course_types TO service_role;


--
-- Name: TABLE email_otps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.email_otps TO anon;
GRANT ALL ON TABLE public.email_otps TO authenticated;
GRANT ALL ON TABLE public.email_otps TO service_role;


--
-- Name: SEQUENCE invoice_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.invoice_seq TO anon;
GRANT ALL ON SEQUENCE public.invoice_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoice_seq TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE lesson_credits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lesson_credits TO anon;
GRANT ALL ON TABLE public.lesson_credits TO authenticated;
GRANT ALL ON TABLE public.lesson_credits TO service_role;


--
-- Name: TABLE lesson_packages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.lesson_packages TO anon;
GRANT ALL ON TABLE public.lesson_packages TO authenticated;
GRANT ALL ON TABLE public.lesson_packages TO service_role;


--
-- Name: TABLE level_recommendations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.level_recommendations TO anon;
GRANT ALL ON TABLE public.level_recommendations TO authenticated;
GRANT ALL ON TABLE public.level_recommendations TO service_role;


--
-- Name: TABLE level_upgrades; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.level_upgrades TO anon;
GRANT ALL ON TABLE public.level_upgrades TO authenticated;
GRANT ALL ON TABLE public.level_upgrades TO service_role;


--
-- Name: TABLE levels; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.levels TO anon;
GRANT ALL ON TABLE public.levels TO authenticated;
GRANT ALL ON TABLE public.levels TO service_role;


--
-- Name: TABLE makeup_credits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.makeup_credits TO anon;
GRANT ALL ON TABLE public.makeup_credits TO authenticated;
GRANT ALL ON TABLE public.makeup_credits TO service_role;


--
-- Name: TABLE message_threads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.message_threads TO anon;
GRANT ALL ON TABLE public.message_threads TO authenticated;
GRANT ALL ON TABLE public.message_threads TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notification_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_log TO anon;
GRANT ALL ON TABLE public.notification_log TO authenticated;
GRANT ALL ON TABLE public.notification_log TO service_role;


--
-- Name: TABLE parent_partnerships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.parent_partnerships TO anon;
GRANT ALL ON TABLE public.parent_partnerships TO authenticated;
GRANT ALL ON TABLE public.parent_partnerships TO service_role;


--
-- Name: TABLE parents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.parents TO anon;
GRANT ALL ON TABLE public.parents TO authenticated;
GRANT ALL ON TABLE public.parents TO service_role;


--
-- Name: TABLE phone_otps; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.phone_otps TO anon;
GRANT ALL ON TABLE public.phone_otps TO authenticated;
GRANT ALL ON TABLE public.phone_otps TO service_role;


--
-- Name: TABLE progress_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.progress_history TO anon;
GRANT ALL ON TABLE public.progress_history TO authenticated;
GRANT ALL ON TABLE public.progress_history TO service_role;


--
-- Name: TABLE purchases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.purchases TO anon;
GRANT ALL ON TABLE public.purchases TO authenticated;
GRANT ALL ON TABLE public.purchases TO service_role;


--
-- Name: TABLE skills; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.skills TO anon;
GRANT ALL ON TABLE public.skills TO authenticated;
GRANT ALL ON TABLE public.skills TO service_role;


--
-- Name: TABLE student_notes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_notes TO anon;
GRANT ALL ON TABLE public.student_notes TO authenticated;
GRANT ALL ON TABLE public.student_notes TO service_role;


--
-- Name: TABLE student_skill_progress; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_skill_progress TO anon;
GRANT ALL ON TABLE public.student_skill_progress TO authenticated;
GRANT ALL ON TABLE public.student_skill_progress TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;


--
-- Name: TABLE team_attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.team_attendance TO anon;
GRANT ALL ON TABLE public.team_attendance TO authenticated;
GRANT ALL ON TABLE public.team_attendance TO service_role;


--
-- Name: TABLE team_memberships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.team_memberships TO anon;
GRANT ALL ON TABLE public.team_memberships TO authenticated;
GRANT ALL ON TABLE public.team_memberships TO service_role;


--
-- Name: TABLE team_tiers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.team_tiers TO anon;
GRANT ALL ON TABLE public.team_tiers TO authenticated;
GRANT ALL ON TABLE public.team_tiers TO service_role;


--
-- Name: TABLE token_packages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.token_packages TO anon;
GRANT ALL ON TABLE public.token_packages TO authenticated;
GRANT ALL ON TABLE public.token_packages TO service_role;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;
GRANT ALL ON TABLE public.waitlist TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages TO postgres;
GRANT ALL ON TABLE realtime.messages TO dashboard_user;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO service_role;


--
-- Name: TABLE messages_2026_07_19; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_19 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_19 TO dashboard_user;


--
-- Name: TABLE messages_2026_07_20; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_20 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_20 TO dashboard_user;


--
-- Name: TABLE messages_2026_07_21; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_21 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_21 TO dashboard_user;


--
-- Name: TABLE messages_2026_07_22; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_22 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_22 TO dashboard_user;


--
-- Name: TABLE messages_2026_07_23; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_23 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_23 TO dashboard_user;


--
-- Name: TABLE messages_2026_07_24; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_24 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_24 TO dashboard_user;


--
-- Name: TABLE messages_2026_07_25; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages_2026_07_25 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_07_25 TO dashboard_user;


--
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;


--
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.buckets FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.buckets TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;


--
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT ALL ON TABLE storage.buckets_analytics TO authenticated;
GRANT ALL ON TABLE storage.buckets_analytics TO anon;


--
-- Name: TABLE buckets_vectors; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;
GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;
GRANT SELECT ON TABLE storage.buckets_vectors TO anon;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

REVOKE ALL ON TABLE storage.objects FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.objects TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: TABLE vector_indexes; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;
GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;
GRANT SELECT ON TABLE storage.vector_indexes TO anon;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--

\unrestrict KTV2GKQQIYJ3ViZvuWTj808L2eQgfo9P1Cxoa1AJjk2t676oTDYCzYCVJNnMctz

