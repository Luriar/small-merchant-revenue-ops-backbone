-- ============================================================================
-- LEGACY WARNING — NOT M2-1 CONTRACT SOURCE
-- ============================================================================
-- This file is not the M2-1 contract source.
-- Do not apply this file for M2-1.
-- Use infra/sql/aurora/m2_1_traceability_publication.sql and
-- infra/connectors/debezium/m2_1_traceability_connector.json instead.
-- This legacy file may contain broader replication settings such as
-- REPLICA IDENTITY FULL or old publication names.
-- ============================================================================

-- ============================================================================
-- Aurora PostgreSQL 논리 복제 설정 — Debezium CDC 전제 조건
-- Version: v1.0
-- 실행 시점: KafkaConnector 배포 전
-- ============================================================================
--
-- Aurora Serverless v2 PostgreSQL은 논리 복제를 지원하지만
-- 기본 설정이 아니므로 명시적으로 활성화 필요.
--
-- !!! 중요: Aurora PostgreSQL 15 이상 필수 !!!
--   이 SQL의 aurora_issue_pub 생성 구문은 publication 컬럼 필터를 사용하며,
--   이 기능은 PostgreSQL 15+ 에서만 지원됨.
--   Aurora PostgreSQL 14 이하에서는 구문 에러 발생.
--
--   확인 방법: SELECT version();
--   Aurora 엔진 버전 확인: aws rds describe-db-clusters
--   Terraform: engine_version = "15.x"
--
-- 체크리스트:
--   1. Aurora PostgreSQL 15+ 확인
--   2. DB 파라미터 그룹 설정 (AWS 콘솔/Terraform):
--      rds.logical_replication = 1
--      wal_sender_timeout = 0 (또는 긴 값)
--      max_replication_slots >= 10
--      max_wal_senders >= 10
--   3. 설정 변경 후 인스턴스 재부팅 필요
--   4. 이후 이 SQL 실행
--
-- ============================================================================

-- ============================================================================
-- 1. 논리 복제 전용 유저 생성
-- ============================================================================
-- Debezium이 사용할 전용 계정. master 계정 직접 사용 지양.

-- 주의: 비밀번호는 Secrets Manager에서 관리. 아래는 placeholder.
CREATE USER debezium_cdc WITH 
  REPLICATION           -- 논리 복제 권한
  LOGIN 
  PASSWORD '${DEBEZIUM_CDC_PASSWORD}';

-- 테이블 SELECT 권한 (snapshot 및 이후 스키마 조회)
GRANT CONNECT ON DATABASE productops TO debezium_cdc;
GRANT USAGE ON SCHEMA public TO debezium_cdc;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium_cdc;

-- 미래에 생성될 테이블에도 자동 권한
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO debezium_cdc;

-- ============================================================================
-- 2. REPLICA IDENTITY 설정
-- ============================================================================
-- PostgreSQL이 UPDATE/DELETE 이벤트에 어떤 이전 값을 WAL에 기록할지 결정.
-- 기본값 'default': PK만 기록 → UPDATE 시 변경 전 값 부족
-- 'FULL'로 변경: 모든 컬럼의 이전 값 기록 → before/after 완전한 envelope
--
-- 주의: FULL 설정은 WAL 크기 증가. 트레이드오프 인지.
-- Debezium은 FULL 권장 (특히 DELETE 이벤트 완전성).

ALTER TABLE public.prod_change REPLICA IDENTITY FULL;
ALTER TABLE public.trace REPLICA IDENTITY FULL;
ALTER TABLE public.issue REPLICA IDENTITY FULL;

-- ============================================================================
-- 3. Publication (선언적으로 미리 생성 — 권장)
-- ============================================================================
-- Debezium의 publication.autocreate.mode=filtered 설정 시 자동 생성도 가능.
-- 하지만 명시적 생성이 Infrastructure-as-Code 원칙에 부합.
--
-- 각 테이블별로 별도 publication 생성 (connector와 1:1 매칭).

-- prod_change publication
CREATE PUBLICATION aurora_prod_change_pub 
  FOR TABLE public.prod_change;

-- trace publication
CREATE PUBLICATION aurora_trace_pub 
  FOR TABLE public.trace;

-- issue publication
-- 주의: Publication 레벨 컬럼 필터는 PostgreSQL 15+에서만 지원.
-- Aurora PostgreSQL 15는 지원. PII 필터는 Debezium column.exclude.list로도 처리하지만,
-- 이중 안전망으로 publication에서도 제외.
CREATE PUBLICATION aurora_issue_pub 
  FOR TABLE public.issue 
  (issue_id, external_id, source, issue_family, severity, status, 
   keywords, affected_variation, occurred_at, received_at, resolved_at, 
   version, created_at, updated_at);
-- 명시적으로 포함할 컬럼만 지정. body, payload, reporter, title, created_by, updated_by 제외.

-- ============================================================================
-- 4. Replication Slot은 Debezium이 자동 생성
-- ============================================================================
-- slot.name (KafkaConnector config)에 지정한 이름으로 Debezium이 자동 생성:
--   - aurora_prod_change_slot
--   - aurora_trace_slot
--   - aurora_issue_slot
--
-- 수동 생성도 가능하지만 Debezium에 맡기는 게 표준.

-- ============================================================================
-- 5. 검증 쿼리
-- ============================================================================
-- 논리 복제 활성화 확인:
--   SHOW wal_level;  -- 'logical'이어야 함
--
-- Publication 목록:
--   SELECT pubname, puballtables FROM pg_publication;
--
-- Publication의 테이블 목록:
--   SELECT pubname, schemaname, tablename FROM pg_publication_tables;
--
-- issue publication의 컬럼 확인 (PII 제외 확인용):
--   SELECT attname FROM pg_publication_rel pr
--   JOIN pg_publication p ON pr.prpubid = p.oid
--   JOIN pg_attribute a ON a.attrelid = pr.prrelid
--   WHERE p.pubname = 'aurora_issue_pub' AND a.attnum > 0 AND NOT a.attisdropped;
--   → body, payload, reporter, title 없어야 함
--
-- Replication slot 상태 (Debezium 실행 후):
--   SELECT slot_name, active, confirmed_flush_lsn, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
--   FROM pg_replication_slots;
--
-- User 권한 확인:
--   \du debezium_cdc
--   SELECT * FROM information_schema.role_table_grants WHERE grantee = 'debezium_cdc';

-- ============================================================================
-- 롤백 (필요 시 주석 해제)
-- ============================================================================
-- Publication 삭제
-- DROP PUBLICATION IF EXISTS aurora_prod_change_pub;
-- DROP PUBLICATION IF EXISTS aurora_trace_pub;
-- DROP PUBLICATION IF EXISTS aurora_issue_pub;
--
-- Replication slot 삭제 (Debezium connector 중지 후)
-- SELECT pg_drop_replication_slot('aurora_prod_change_slot');
-- SELECT pg_drop_replication_slot('aurora_trace_slot');
-- SELECT pg_drop_replication_slot('aurora_issue_slot');
--
-- REPLICA IDENTITY 원복
-- ALTER TABLE public.prod_change REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.trace REPLICA IDENTITY DEFAULT;
-- ALTER TABLE public.issue REPLICA IDENTITY DEFAULT;
--
-- User 삭제
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM debezium_cdc;
-- REVOKE ALL PRIVILEGES ON SCHEMA public FROM debezium_cdc;
-- REVOKE CONNECT ON DATABASE productops FROM debezium_cdc;
-- DROP USER debezium_cdc;

-- ============================================================================
-- 운영 주의사항
-- ============================================================================
--
-- [1] Replication slot 미사용 시 WAL 누적 문제
--   slot이 active=false 상태로 오래 방치되면 Aurora WAL이 무한 쌓임 (디스크 full 위험).
--   Debezium connector 장기 중단 시 slot 삭제 또는 모니터링 필수.
--   CloudWatch 메트릭: OldestReplicationSlotLag, TransactionLogsDiskUsage
--
-- [2] REPLICA IDENTITY FULL의 WAL 증가
--   변경된 로우의 모든 컬럼이 WAL에 기록됨.
--   이슈 테이블(payload/body 큼)은 WAL 크기 상당히 증가할 수 있음.
--   CloudWatch 메트릭: OldestReplicationSlotLag 모니터링.
--
-- [3] Aurora Serverless v2 특수 사항
--   - 스케일 다운 시 0 ACU까지 안 감 (논리 복제로 인해).
--   - 최소 ACU 설정 시 유의. 실무 권장: min_capacity 0.5 이상.
--
-- [4] Publication 스키마 변경 시
--   테이블에 컬럼 추가 시 publication에도 반영 필요 (컬럼 필터링한 경우):
--     ALTER PUBLICATION aurora_issue_pub SET TABLE public.issue (new_col_list);
--   또는 전체 테이블 publication이면 자동 반영.
--
-- [5] Snapshot 중 DDL 변경 금지
--   Debezium initial snapshot 진행 중에 ALTER TABLE 하면 consistency 깨짐.
--   스키마 변경은 snapshot 완료 후에만.
--
-- ============================================================================
-- END OF AURORA LOGICAL REPLICATION SETUP v1.0
-- ============================================================================
