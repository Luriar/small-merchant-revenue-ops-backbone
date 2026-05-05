-- ============================================================================
-- M2-1 Aurora Logical Replication Prerequisite Checks
-- ============================================================================
--
-- Read-only validation SQL for the M2-1 minimum vertical slice:
--   public.prod_change -> public.trace -> safe public.issue CDC -> ClickHouse
--
-- This file must not create, alter, drop, or mutate anything.
-- It only reports whether Aurora/PostgreSQL prerequisites and publication
-- filtering are aligned with the traceability-safe CDC boundary.
--
-- Expected publication: m2_1_traceability_pub
-- Expected slot:        m2_1_traceability_slot
-- ============================================================================

-- ============================================================================
-- 1. Database identity and logical replication settings
-- ============================================================================

SELECT
  'current_database' AS check_name,
  current_database() AS value;

SELECT
  'rds.logical_replication' AS check_name,
  COALESCE(current_setting('rds.logical_replication', true), 'not available') AS value,
  CASE
    WHEN current_setting('rds.logical_replication', true) = '1' THEN 'PASS'
    WHEN current_setting('rds.logical_replication', true) IS NULL THEN 'WARN: setting is not exposed outside Aurora'
    ELSE 'FAIL: expected 1 for Aurora logical replication'
  END AS result;

SELECT
  name AS check_name,
  setting AS value,
  unit,
  CASE
    WHEN name = 'wal_level' AND setting = 'logical' THEN 'PASS'
    WHEN name = 'wal_level' THEN 'FAIL: expected logical'
    WHEN name = 'max_replication_slots' AND setting::integer >= 1 THEN 'PASS'
    WHEN name = 'max_replication_slots' THEN 'FAIL: expected at least 1'
    WHEN name = 'max_wal_senders' AND setting::integer >= 1 THEN 'PASS'
    WHEN name = 'max_wal_senders' THEN 'FAIL: expected at least 1'
    ELSE 'INFO'
  END AS result
FROM pg_settings
WHERE name IN ('wal_level', 'max_replication_slots', 'max_wal_senders')
ORDER BY name;

-- ============================================================================
-- 2. Publication existence and publish behavior
-- ============================================================================

WITH expected(pubname) AS (
  VALUES ('m2_1_traceability_pub')
)
SELECT
  expected.pubname,
  CASE WHEN p.oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status,
  p.puballtables,
  p.pubinsert,
  p.pubupdate,
  p.pubdelete,
  p.pubtruncate,
  CASE
    WHEN p.oid IS NULL THEN 'FAIL: publication is missing'
    WHEN p.puballtables THEN 'FAIL: publication must not use FOR ALL TABLES'
    WHEN NOT p.pubinsert OR NOT p.pubupdate OR NOT p.pubdelete THEN 'FAIL: expected insert/update/delete'
    WHEN p.pubtruncate THEN 'WARN: truncate is not needed for M2-1 CDC'
    ELSE 'PASS'
  END AS result
FROM expected
LEFT JOIN pg_publication p
  ON p.pubname = expected.pubname;

-- ============================================================================
-- 3. Publication table membership and column lists
-- ============================================================================

WITH expected(schemaname, tablename) AS (
  VALUES
    ('public', 'prod_change'),
    ('public', 'trace'),
    ('public', 'issue')
)
SELECT
  expected.schemaname,
  expected.tablename,
  CASE WHEN pt.pubname IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS publication_membership,
  to_jsonb(pt)->'attnames' AS publication_columns,
  CASE
    WHEN pt.pubname IS NULL THEN 'FAIL: table is missing from m2_1_traceability_pub'
    WHEN jsonb_typeof(to_jsonb(pt)->'attnames') = 'array' THEN 'PASS'
    ELSE 'FAIL: expected explicit publication column list'
  END AS result
FROM expected
LEFT JOIN pg_catalog.pg_publication_tables pt
  ON pt.pubname = 'm2_1_traceability_pub'
 AND pt.schemaname = expected.schemaname
 AND pt.tablename = expected.tablename
ORDER BY expected.tablename;

-- Full membership view for manual inspection.
SELECT
  pubname,
  schemaname,
  tablename,
  to_jsonb(pt)->'attnames' AS publication_columns,
  to_jsonb(pt)->'rowfilter' AS row_filter
FROM pg_catalog.pg_publication_tables pt
WHERE pubname = 'm2_1_traceability_pub'
ORDER BY schemaname, tablename;

-- ============================================================================
-- 4. Explicit warning if prod_change.payload or prod_change.actor is published
-- ============================================================================

WITH prod_change_pub AS (
  SELECT to_jsonb(pt) AS row_json
  FROM pg_catalog.pg_publication_tables pt
  WHERE pt.pubname = 'm2_1_traceability_pub'
    AND pt.schemaname = 'public'
    AND pt.tablename = 'prod_change'
),
prod_change_columns AS (
  SELECT c.column_name
  FROM prod_change_pub p
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(p.row_json->'attnames') = 'array' THEN p.row_json->'attnames'
      ELSE '[]'::jsonb
    END
  ) AS c(column_name)
)
SELECT
  'prod_change_sensitive_publication_columns' AS check_name,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM prod_change_pub)
      THEN 'WARN: m2_1_traceability_pub does not include public.prod_change yet'
    WHEN EXISTS (
      SELECT 1
      FROM prod_change_pub
      WHERE jsonb_typeof(row_json->'attnames') IS DISTINCT FROM 'array'
    )
      THEN 'FAIL: public.prod_change has no explicit publication column list'
    WHEN EXISTS (
      SELECT 1
      FROM prod_change_columns
      WHERE column_name IN ('payload', 'actor')
    )
      THEN 'FAIL: prod_change.payload or prod_change.actor is published'
    ELSE 'PASS: prod_change.payload and prod_change.actor are not published'
  END AS result;

-- ============================================================================
-- 5. Replication slot status for the M2-1 connector
-- ============================================================================

WITH expected(slot_name) AS (
  VALUES ('m2_1_traceability_slot')
)
SELECT
  expected.slot_name,
  CASE WHEN s.slot_name IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS slot_status,
  s.plugin,
  s.slot_type,
  s.database,
  s.active,
  s.restart_lsn,
  s.confirmed_flush_lsn,
  CASE
    WHEN s.slot_name IS NULL THEN 'INFO: slot is normally created by Debezium when the connector starts'
    WHEN s.plugin <> 'pgoutput' THEN 'FAIL: expected pgoutput'
    ELSE 'PASS'
  END AS result
FROM expected
LEFT JOIN pg_replication_slots s
  ON s.slot_name = expected.slot_name;

-- ============================================================================
-- 6. Primary key and replica identity for M2-1 source tables
-- ============================================================================

WITH expected(schemaname, tablename, primary_key_column) AS (
  VALUES
    ('public', 'prod_change', 'change_id'),
    ('public', 'trace', 'trace_id'),
    ('public', 'issue', 'issue_id')
)
SELECT
  expected.schemaname,
  expected.tablename,
  expected.primary_key_column,
  c.relreplident AS replica_identity_code,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT'
    WHEN 'n' THEN 'NOTHING'
    WHEN 'f' THEN 'FULL'
    WHEN 'i' THEN 'INDEX'
    ELSE 'UNKNOWN'
  END AS replica_identity,
  pg_get_indexdef(pk.indexrelid) AS primary_key_definition,
  CASE
    WHEN c.oid IS NULL THEN 'FAIL: table is missing'
    WHEN pk.indexrelid IS NULL THEN 'FAIL: primary key is missing'
    WHEN c.relreplident = 'f' THEN 'WARN: FULL can increase volume and may expose excluded raw fields in WAL'
    WHEN c.relreplident IN ('d', 'i') THEN 'PASS'
    ELSE 'WARN: verify replica identity before enabling CDC'
  END AS result
FROM expected
LEFT JOIN pg_namespace n
  ON n.nspname = expected.schemaname
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = expected.tablename
 AND c.relkind = 'r'
LEFT JOIN pg_index pk
  ON pk.indrelid = c.oid
 AND pk.indisprimary
ORDER BY expected.tablename;

-- ============================================================================
-- END OF M2-1 AURORA LOGICAL REPLICATION PREREQ CHECKS
-- ============================================================================
