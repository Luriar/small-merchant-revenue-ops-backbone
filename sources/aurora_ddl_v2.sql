-- ============================================================================
-- Aurora PostgreSQL DDL — Product Ops Traceability Backbone
-- Version: v2.0 (전방위 검토 반영 최종본)
-- Database: Aurora Serverless v2 PostgreSQL 15+
-- ============================================================================
--
-- v1.1 → v2.0 수정 사항:
--
-- [정확성]
--  A. trace.version 조건부 증가: evidence 카운터 자동 유지 시 version 유지
--  B. issue.resolved_at 자동 설정 트리거 추가
--  D. chk_prod_change_window_valid 제거 (backfill 허용)
--
-- [재현성 (idempotent)]
--  E. 모든 CREATE TABLE/INDEX/TRIGGER에 IF NOT EXISTS 적용
--  F. 시드 데이터에 ON CONFLICT DO NOTHING
--
-- [문서화]
--  G. evidence는 append-only 원칙 명시 (권한 분리 섹션)
--  H. 낮은 카디널리티 인덱스의 쿼리 패턴을 COMMENT로 정당화
--  I. PII 관리 정책 주석 추가
--  J. 마이그레이션 도구 권장사항
--
-- [의식적 미반영 — 별도 환경 스크립트로 처리]
--  - 권한 분리 (GRANT/REVOKE): 환경별로 달라서 Terraform/배포 스크립트에서 관리
--  - 스키마 마이그레이션: Alembic/Flyway 도입 시 이 DDL은 "baseline"이 됨
--  - 동시성 lock 측정: 실부하 시 모니터링으로
--
-- 테이블 (12개): cd_mstr, cd_cmmn, prod_change, issue, issue_ops_meta,
--               run, run_state_log, trace, evidence,
--               event_intake, change_intake_idempotency, issue_intake_idempotency
-- ============================================================================

-- ============================================================================
-- 확장
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ============================================================================
-- 개발/테스트 teardown (필요 시 주석 해제)
-- ============================================================================
-- DROP TABLE IF EXISTS issue_intake_idempotency, change_intake_idempotency, event_intake,
--                      evidence, run_state_log, trace, issue_ops_meta,
--                      issue, prod_change, run, cd_cmmn, cd_mstr CASCADE;
-- DROP FUNCTION IF EXISTS
--   trg_set_updated_at,
--   trg_set_updated_at_and_version,
--   trg_validate_change_occurred_at,
--   trg_update_trace_evidence_count,
--   trg_log_run_state_change,
--   trg_auto_set_resolved_at CASCADE;

-- ============================================================================
-- 트리거 함수
-- ============================================================================

-- A. updated_at만 갱신 (cd_mstr, cd_cmmn, prod_change)
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- B. updated_at + version 증가 — 단, trace의 카운터만 변경된 경우 version 유지
--    (evidence 추가로 인한 자동 카운터 업데이트가 version 증가를 유발하지 않도록)
CREATE OR REPLACE FUNCTION trg_set_updated_at_and_version()
RETURNS TRIGGER AS $$
DECLARE
  only_counter_changed BOOLEAN := FALSE;
BEGIN
  NEW.updated_at = NOW();
  
  -- trace 테이블에서 본질적 필드는 그대로이고 카운터만 바뀌었는지 판단
  IF TG_TABLE_NAME = 'trace' THEN
    only_counter_changed :=
      OLD.status                IS NOT DISTINCT FROM NEW.status            AND
      OLD.confidence            IS NOT DISTINCT FROM NEW.confidence        AND
      OLD.change_id             IS NOT DISTINCT FROM NEW.change_id         AND
      OLD.primary_issue_id      IS NOT DISTINCT FROM NEW.primary_issue_id  AND
      OLD.anomaly_type          IS NOT DISTINCT FROM NEW.anomaly_type      AND
      OLD.anomaly_metric        IS NOT DISTINCT FROM NEW.anomaly_metric    AND
      OLD.anomaly_window_start  IS NOT DISTINCT FROM NEW.anomaly_window_start AND
      OLD.anomaly_window_end    IS NOT DISTINCT FROM NEW.anomaly_window_end AND
      OLD.anomaly_detail::text  IS NOT DISTINCT FROM NEW.anomaly_detail::text AND
      (OLD.linked_event_count   IS DISTINCT FROM NEW.linked_event_count
         OR OLD.linked_issue_count  IS DISTINCT FROM NEW.linked_issue_count
         OR OLD.evidence_count      IS DISTINCT FROM NEW.evidence_count);
  END IF;
  
  IF only_counter_changed THEN
    NEW.version = OLD.version;  -- 카운터만 변경된 경우 version 유지
  ELSE
    NEW.version = OLD.version + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- C. prod_change.occurred_at 미래 시각 검증 (NOW() 사용 → 트리거에서만 가능)
CREATE OR REPLACE FUNCTION trg_validate_change_occurred_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.occurred_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'prod_change.occurred_at cannot be more than 5 minutes in the future (got %)',
                    NEW.occurred_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- D. trace.evidence_count 자동 유지
CREATE OR REPLACE FUNCTION trg_update_trace_evidence_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE trace
      SET evidence_count = evidence_count + 1
      WHERE trace_id = NEW.trace_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE trace
      SET evidence_count = GREATEST(evidence_count - 1, 0)
      WHERE trace_id = OLD.trace_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- E. run.status 변경 → run_state_log 자동 기록
CREATE OR REPLACE FUNCTION trg_log_run_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO run_state_log (run_id, from_status, to_status, attempt, reason, metadata)
    VALUES (NEW.run_id, OLD.status, NEW.status, NEW.attempt,
            'auto-logged by trigger',
            jsonb_build_object('error_class', NEW.error_class));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- F. issue.status='resolved' 전이 시 resolved_at 자동 설정
CREATE OR REPLACE FUNCTION trg_auto_set_resolved_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at = NOW();
  END IF;
  -- 주의: status가 resolved에서 다른 상태로 바뀌어도 resolved_at은 유지.
  -- 필요 시 어플리케이션에서 명시적으로 NULL 설정.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. 공통코드 마스터
-- ============================================================================

CREATE TABLE IF NOT EXISTS cd_mstr (
  mstr_cd        CHAR(4)       PRIMARY KEY,
  mstr_cd_name   VARCHAR(50)   NOT NULL,
  dsc            VARCHAR(150),
  sort_order     SMALLINT      NOT NULL DEFAULT 0,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cd_mstr IS '공통코드 마스터. 타입성 속성 그룹을 정의.';
COMMENT ON COLUMN cd_mstr.mstr_cd IS '4자 마스터 코드 (예: CHGT, ANOT, EVDT)';

DROP TRIGGER IF EXISTS set_updated_at_cd_mstr ON cd_mstr;
CREATE TRIGGER set_updated_at_cd_mstr
  BEFORE UPDATE ON cd_mstr
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

INSERT INTO cd_mstr (mstr_cd, mstr_cd_name, dsc, sort_order) VALUES
  ('CHGT', 'ChangeType',       '변경 타입 (release/flag/rule)',      1),
  ('EVTT', 'EventType',        '이벤트 타입 대분류',                  2),
  ('EVST', 'EventSubtype',     '이벤트 서브타입',                    3),
  ('ANOT', 'AnomalyType',      '이상 패턴 타입',                    4),
  ('EVDT', 'EvidenceType',     'Trace 근거 타입',                   5),
  ('EVDS', 'EvidenceStrength', 'Trace 근거 강도',                   6)
ON CONFLICT (mstr_cd) DO NOTHING;

-- ============================================================================
-- 2. 공통코드 상세
-- ============================================================================

CREATE TABLE IF NOT EXISTS cd_cmmn (
  cd             CHAR(7)       PRIMARY KEY,
  cd_name        VARCHAR(50)   NOT NULL,
  dsc            VARCHAR(150),
  mstr_cd        CHAR(4)       NOT NULL REFERENCES cd_mstr(mstr_cd),
  sort_order     SMALLINT      NOT NULL DEFAULT 0,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  extra          JSONB,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cd_cmmn IS
  '공통코드 상세. 사용 테이블은 FK 없이 네이밍 규칙(<mstr>_cd)으로 참조.';
COMMENT ON COLUMN cd_cmmn.cd IS '7자 공통코드 (mstr_cd 4자 + 3자리 순번)';
COMMENT ON COLUMN cd_cmmn.extra IS 'UI 메타 (색상, 아이콘 등) JSONB';

CREATE INDEX IF NOT EXISTS idx_cd_cmmn_mstr ON cd_cmmn (mstr_cd, sort_order);
COMMENT ON INDEX idx_cd_cmmn_mstr IS
  '쿼리: 특정 마스터 코드의 하위 코드 조회 (드롭다운 옵션 로드). 낮은 카디널리티 mstr_cd 첫 컬럼이지만 UI 로드 시 특정 mstr_cd=? 로 조회하여 좁혀짐.';

CREATE INDEX IF NOT EXISTS idx_cd_cmmn_active ON cd_cmmn (is_active) WHERE is_active = TRUE;
COMMENT ON INDEX idx_cd_cmmn_active IS
  '활성 코드 부분 인덱스. 대부분 코드가 활성이므로 사실상 전체 인덱스에 가까움.';

DROP TRIGGER IF EXISTS set_updated_at_cd_cmmn ON cd_cmmn;
CREATE TRIGGER set_updated_at_cd_cmmn
  BEFORE UPDATE ON cd_cmmn
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

INSERT INTO cd_cmmn (cd, cd_name, dsc, mstr_cd, sort_order) VALUES
  ('CHGT001', 'release', '제품 배포',          'CHGT', 1),
  ('CHGT002', 'flag',    '피처 플래그 변경',    'CHGT', 2),
  ('CHGT003', 'rule',    '운영 규칙 변경',      'CHGT', 3),
  ('EVTT001', 'product',       '제품 이벤트',        'EVTT', 1),
  ('EVTT002', 'support_issue', '서포트 이슈 이벤트', 'EVTT', 2),
  ('ANOT001', 'volume', '볼륨 급증',     'ANOT', 1),
  ('ANOT002', 'error',  '에러율 증가',   'ANOT', 2),
  ('ANOT003', 'retry',  '재시도 증가',   'ANOT', 3),
  ('ANOT004', 'cohort', '코호트 이상',   'ANOT', 4),
  ('EVDT001', 'timing',      '시간 근접성',    'EVDT', 1),
  ('EVDT002', 'variation',   'variation 일치', 'EVDT', 2),
  ('EVDT003', 'event_spike', '이벤트 급증',    'EVDT', 3),
  ('EVDT004', 'rule_match',  '규칙 매칭',      'EVDT', 4),
  ('EVDS001', 'strong', '강한 근거', 'EVDS', 1),
  ('EVDS002', 'medium', '중간 근거', 'EVDS', 2),
  ('EVDS003', 'weak',   '약한 근거', 'EVDS', 3)
ON CONFLICT (cd) DO NOTHING;

-- ============================================================================
-- 3. prod_change — 변경 기록
-- ============================================================================

CREATE TABLE IF NOT EXISTS prod_change (
  change_id          TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  chgt_cd            CHAR(7)       NOT NULL,
  title              VARCHAR(200)  NOT NULL,
  target_service     VARCHAR(100)  NOT NULL,
  target_component   VARCHAR(100),
  variation          VARCHAR(50),
  cohort             VARCHAR(100),
  rule_scope         JSONB,
  payload            JSONB,
  actor              VARCHAR(100),
  source             VARCHAR(50)   NOT NULL,
  occurred_at        TIMESTAMPTZ   NOT NULL,
  received_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by         TEXT          NOT NULL DEFAULT 'system',
  updated_by         TEXT          NOT NULL DEFAULT 'system',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_prod_change_payload_size
    CHECK (pg_column_size(payload) < 1048576),
  CONSTRAINT chk_prod_change_rule_scope_size
    CHECK (pg_column_size(rule_scope) < 1048576)
  -- 주의: chk_prod_change_window_valid 제거됨.
  -- 이유: retroactive backfill (과거 데이터 import, 장애 복구 후 늦은 기록) 허용 필요.
  -- 미래 시각 방지는 BEFORE INSERT 트리거로 처리.
);

COMMENT ON TABLE prod_change IS
  '제품/운영 변경 기록. release/flag/rule 등. 도메인명은 change이나 SQL 예약어 회피 위해 prod_change.';
COMMENT ON COLUMN prod_change.chgt_cd IS 'cd_cmmn 참조 (mstr_cd=CHGT). FK 없음, 네이밍 규칙.';
COMMENT ON COLUMN prod_change.actor IS
  'PII 주의: 이메일/이름이 들어올 수 있음. 필요 시 intake 단계에서 마스킹.';
COMMENT ON COLUMN prod_change.occurred_at IS '변경이 실제 발생한 시각 (외부 시스템 기준)';
COMMENT ON COLUMN prod_change.received_at IS '시스템이 변경 정보를 수신한 시각';

CREATE INDEX IF NOT EXISTS idx_prod_change_occurred_at ON prod_change (occurred_at DESC);
COMMENT ON INDEX idx_prod_change_occurred_at IS '쿼리: Change Timeline 기본 정렬';

CREATE INDEX IF NOT EXISTS idx_prod_change_type_time ON prod_change (chgt_cd, occurred_at DESC);
COMMENT ON INDEX idx_prod_change_type_time IS
  '쿼리: WHERE chgt_cd=? ORDER BY occurred_at. chgt_cd는 낮은 카디널리티(3값)이나 필터 후 시간 정렬에 효과적.';

CREATE INDEX IF NOT EXISTS idx_prod_change_service_time ON prod_change (target_service, occurred_at DESC);
COMMENT ON INDEX idx_prod_change_service_time IS '쿼리: 특정 서비스의 변경 이력';

CREATE INDEX IF NOT EXISTS idx_prod_change_variation ON prod_change (target_service, variation, occurred_at DESC)
  WHERE variation IS NOT NULL;
COMMENT ON INDEX idx_prod_change_variation IS
  '쿼리: 판단 로직의 "same service + same variation = strong evidence" 조건';

CREATE INDEX IF NOT EXISTS idx_prod_change_type_service_time ON prod_change (chgt_cd, target_service, occurred_at DESC);
COMMENT ON INDEX idx_prod_change_type_service_time IS
  '쿼리: 데모 시나리오의 "release 타입 + 특정 서비스" 복합 필터';

CREATE INDEX IF NOT EXISTS idx_prod_change_rule_scope_gin ON prod_change USING GIN (rule_scope);
COMMENT ON INDEX idx_prod_change_rule_scope_gin IS '쿼리: rule_scope JSONB 매칭';

DROP TRIGGER IF EXISTS trg_prod_change_validate_occurred_at ON prod_change;
CREATE TRIGGER trg_prod_change_validate_occurred_at
  BEFORE INSERT OR UPDATE ON prod_change
  FOR EACH ROW EXECUTE FUNCTION trg_validate_change_occurred_at();

DROP TRIGGER IF EXISTS set_updated_at_prod_change ON prod_change;
CREATE TRIGGER set_updated_at_prod_change
  BEFORE UPDATE ON prod_change
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================================
-- 4. issue — 운영 이슈
-- ============================================================================

CREATE TABLE IF NOT EXISTS issue (
  issue_id               TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  external_id            VARCHAR(200),
  source                 VARCHAR(50)   NOT NULL,
  title                  VARCHAR(500)  NOT NULL,
  body                   TEXT,
  issue_family           VARCHAR(100)  NOT NULL,
  severity               SMALLINT      NOT NULL DEFAULT 3
                                       CHECK (severity BETWEEN 1 AND 5),
  status                 VARCHAR(20)   NOT NULL DEFAULT 'open'
                                       CHECK (status IN ('open','investigating','resolved','ignored')),
  keywords               TEXT[],
  affected_variation     VARCHAR(50),
  payload                JSONB,
  reporter               VARCHAR(100),
  occurred_at            TIMESTAMPTZ   NOT NULL,
  received_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ,
  version                INTEGER       NOT NULL DEFAULT 1,
  created_by             TEXT          NOT NULL DEFAULT 'system',
  updated_by             TEXT          NOT NULL DEFAULT 'system',
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_issue_resolved_at
    CHECK (status != 'resolved' OR resolved_at IS NOT NULL),
  CONSTRAINT chk_issue_payload_size
    CHECK (pg_column_size(payload) < 1048576)
);

COMMENT ON TABLE issue IS
  '운영 이슈. MVP는 외부 support 채널 intake만. Event 기반 자동 생성은 v1.';
COMMENT ON COLUMN issue.severity IS '1=critical, 2=high, 3=medium, 4=low, 5=trivial';
COMMENT ON COLUMN issue.issue_family IS 'Event↔Issue 매칭 그룹 (예: payment_failed_issue)';
COMMENT ON COLUMN issue.body IS
  'PII 주의: 이슈 본문에 고객 정보 포함 가능. intake 단계에서 민감정보 마스킹 권장.';
COMMENT ON COLUMN issue.payload IS
  'PII 주의: 외부 시스템 원본 (Zendesk/Intercom 페이로드). 이메일/이름/전화번호 가능.';
COMMENT ON COLUMN issue.reporter IS 'PII 주의: 이메일 형식 가능.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_external
  ON issue (source, external_id) WHERE external_id IS NOT NULL;
COMMENT ON INDEX uq_issue_external IS '외부 시스템 ticket 중복 수신 방지';

CREATE INDEX IF NOT EXISTS idx_issue_family_time ON issue (issue_family, occurred_at DESC);
COMMENT ON INDEX idx_issue_family_time IS
  '쿼리: 판단 로직의 family map 기반 event↔issue 매칭 + 시간 window 필터';

CREATE INDEX IF NOT EXISTS idx_issue_status_active ON issue (status, occurred_at DESC)
  WHERE status IN ('open','investigating');
COMMENT ON INDEX idx_issue_status_active IS
  '활성 이슈 전용 부분 인덱스. 전체 이슈 대비 활성 비율이 낮아 인덱스 크기 작음.';

CREATE INDEX IF NOT EXISTS idx_issue_variation_time ON issue (affected_variation, occurred_at DESC)
  WHERE affected_variation IS NOT NULL;
COMMENT ON INDEX idx_issue_variation_time IS '특정 variation 영향 이슈 추적';

CREATE INDEX IF NOT EXISTS idx_issue_keywords_gin ON issue USING GIN (keywords);
COMMENT ON INDEX idx_issue_keywords_gin IS '키워드 배열 검색 (판단 로직 매칭)';

CREATE INDEX IF NOT EXISTS idx_issue_severity_status ON issue (severity, status)
  WHERE status IN ('open','investigating');
COMMENT ON INDEX idx_issue_severity_status IS
  '활성 이슈 중 심각도 우선순위 정렬. 부분 인덱스로 좁힘.';

DROP TRIGGER IF EXISTS trg_issue_auto_resolved_at ON issue;
CREATE TRIGGER trg_issue_auto_resolved_at
  BEFORE INSERT OR UPDATE ON issue
  FOR EACH ROW EXECUTE FUNCTION trg_auto_set_resolved_at();

DROP TRIGGER IF EXISTS set_updated_at_issue ON issue;
CREATE TRIGGER set_updated_at_issue
  BEFORE UPDATE ON issue
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_and_version();

-- ============================================================================
-- 5. issue_ops_meta — 팀플 운영 메타 (MVP 구조만)
-- ============================================================================

CREATE TABLE IF NOT EXISTS issue_ops_meta (
  issue_id           TEXT          PRIMARY KEY
                                   REFERENCES issue(issue_id) ON DELETE CASCADE,
  assignee_user_id   TEXT,
  review_status      VARCHAR(20)
                                   CHECK (review_status IS NULL OR
                                          review_status IN ('pending','reviewing','completed','skipped')),
  review_category    VARCHAR(50),
  risk_score         SMALLINT
                                   CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  cluster_id         TEXT,
  noise_filtered     BOOLEAN       NOT NULL DEFAULT FALSE,
  escalated_at       TIMESTAMPTZ,
  next_action        VARCHAR(100),
  version            INTEGER       NOT NULL DEFAULT 1,
  created_by         TEXT          NOT NULL DEFAULT 'system',
  updated_by         TEXT          NOT NULL DEFAULT 'system',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE issue_ops_meta IS
  '팀프로젝트 확장용. MVP에서 구조만 잡고 데이터는 생성 안 함. v1에서 팀플이 사용.';
COMMENT ON COLUMN issue_ops_meta.risk_score IS '팀플 escalation 판단용 점수 (0-100)';

-- 인덱스는 팀플 합류 후 쿼리 패턴 확정되면 추가

DROP TRIGGER IF EXISTS set_updated_at_issue_ops_meta ON issue_ops_meta;
CREATE TRIGGER set_updated_at_issue_ops_meta
  BEFORE UPDATE ON issue_ops_meta
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_and_version();

-- ============================================================================
-- 6. run — 처리 실행 단위
-- ============================================================================

CREATE TABLE IF NOT EXISTS run (
  run_id           TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  run_type         VARCHAR(50)   NOT NULL,
  target_kind      VARCHAR(50)   NOT NULL,
  target_ref       TEXT,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','processing','completed','failed','dlq')),
  attempt          SMALLINT      NOT NULL DEFAULT 0,
  max_attempts     SMALLINT      NOT NULL DEFAULT 3,
  error_class      VARCHAR(100),
  error_detail     JSONB,
  input_ref        JSONB,
  output_ref       JSONB,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  version          INTEGER       NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_run_attempt
    CHECK (attempt <= max_attempts),
  -- 완화된 제약: 종료 상태(completed/failed/dlq)면 completed_at 필수.
  -- 단, 역방향(다시 pending/processing으로 복귀) 허용 — completed_at은 이전 값 유지 가능.
  CONSTRAINT chk_run_terminal_completed
    CHECK (status NOT IN ('completed','failed','dlq') OR completed_at IS NOT NULL)
);

COMMENT ON TABLE run IS
  '수집/정규화/연결 판단의 실행 단위. DLQ/retry 추적 기준.';
COMMENT ON COLUMN run.target_ref IS
  'Reference to target object. For event kind, stores ClickHouse event_id (no FK — OLAP is in ClickHouse).';
COMMENT ON COLUMN run.run_type IS
  'normalization | anomaly_detection | trace_generation | reprocess';
COMMENT ON COLUMN run.status IS
  'pending → processing → completed/failed/dlq. 재시도 이력은 run_state_log 참조.';

CREATE INDEX IF NOT EXISTS idx_run_status_created ON run (status, created_at DESC);
COMMENT ON INDEX idx_run_status_created IS
  '쿼리: 상태별 run 조회 (Reliability Panel). status는 낮은 카디널리티(5값)이나 특정 status 필터링이 주 쿼리.';

CREATE INDEX IF NOT EXISTS idx_run_failed ON run (status, created_at DESC)
  WHERE status IN ('failed','dlq');
COMMENT ON INDEX idx_run_failed IS '실패 run 부분 인덱스 (재처리 후보 조회)';

CREATE INDEX IF NOT EXISTS idx_run_type_status ON run (run_type, status, created_at DESC);
COMMENT ON INDEX idx_run_type_status IS '쿼리: 타입별 상태 집계 (대시보드 위젯)';

CREATE INDEX IF NOT EXISTS idx_run_target ON run (target_kind, target_ref);
COMMENT ON INDEX idx_run_target IS '쿼리: 특정 대상의 처리 이력 조회';

DROP TRIGGER IF EXISTS set_updated_at_run ON run;
CREATE TRIGGER set_updated_at_run
  BEFORE UPDATE ON run
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_and_version();

DROP TRIGGER IF EXISTS trg_run_status_change_log ON run;
CREATE TRIGGER trg_run_status_change_log
  AFTER UPDATE OF status ON run
  FOR EACH ROW EXECUTE FUNCTION trg_log_run_state_change();

-- ============================================================================
-- 7. run_state_log — run 상태 전이 이력 (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS run_state_log (
  log_id        BIGSERIAL     PRIMARY KEY,
  run_id        TEXT          NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  from_status   VARCHAR(20),
  to_status     VARCHAR(20)   NOT NULL,
  attempt       SMALLINT      NOT NULL,
  reason        TEXT,
  metadata      JSONB,
  occurred_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE run_state_log IS
  'run의 상태 전이 이력. append-only. run.status AFTER UPDATE 트리거로 자동 기록.';
COMMENT ON TABLE run_state_log IS
  'APPEND-ONLY 원칙: DELETE/UPDATE 하지 말 것. 운영 환경에서는 권한으로 통제.';

CREATE INDEX IF NOT EXISTS idx_run_state_log_run ON run_state_log (run_id, occurred_at);
COMMENT ON INDEX idx_run_state_log_run IS '쿼리: 특정 run의 전체 이력 시계열 조회';

-- ============================================================================
-- 8. trace — 연결 추적 단위
-- ============================================================================

CREATE TABLE IF NOT EXISTS trace (
  trace_id                TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  change_id               TEXT          REFERENCES prod_change(change_id) ON DELETE SET NULL,
  primary_issue_id        TEXT          REFERENCES issue(issue_id) ON DELETE SET NULL,
  status                  VARCHAR(20)   NOT NULL DEFAULT 'suspected'
                                        CHECK (status IN ('suspected','confirmed','dismissed')),
  confidence              VARCHAR(10)   NOT NULL
                                        CHECK (confidence IN ('strong','medium','weak')),
  anomaly_window_start    TIMESTAMPTZ   NOT NULL,
  anomaly_window_end      TIMESTAMPTZ   NOT NULL,
  anomaly_type            VARCHAR(20)   NOT NULL
                                        CHECK (anomaly_type IN ('volume','error','retry','cohort')),
  anomaly_metric          VARCHAR(100)  NOT NULL,
  anomaly_detail          JSONB         NOT NULL,
  linked_event_count      INTEGER       NOT NULL DEFAULT 0,
  linked_issue_count      INTEGER       NOT NULL DEFAULT 0,
  evidence_count          INTEGER       NOT NULL DEFAULT 0,
  generated_by_run_id     TEXT          REFERENCES run(run_id) ON DELETE SET NULL,
  version                 INTEGER       NOT NULL DEFAULT 1,
  created_by              TEXT          NOT NULL DEFAULT 'system',
  updated_by              TEXT          NOT NULL DEFAULT 'system',
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_trace_window
      CHECK (anomaly_window_start <= anomaly_window_end)
  );

-- chk_trace_generation_rule을 constraint trigger로 구현
-- (PostgreSQL은 CHECK + DEFERRABLE 미지원)
-- 의도: trace INSERT 시점엔 evidence_count=0이어도 통과,
--       같은 트랜잭션 내 evidence INSERT 후 COMMIT 시점에 검증.
CREATE OR REPLACE FUNCTION validate_trace_generation_rule()
RETURNS TRIGGER AS $$
DECLARE
  current_change_id TEXT;
  current_evidence_count INTEGER;
BEGIN
  SELECT change_id, evidence_count
    INTO current_change_id, current_evidence_count
    FROM trace
   WHERE trace_id = NEW.trace_id;

  IF current_change_id IS NULL AND COALESCE(current_evidence_count, 0) < 2 THEN
    RAISE EXCEPTION
      'trace generation rule violation: change_id IS NULL requires evidence_count >= 2 (got %)',
      COALESCE(current_evidence_count, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trace_generation_rule ON trace;
CREATE CONSTRAINT TRIGGER trg_trace_generation_rule
  AFTER INSERT OR UPDATE ON trace
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_trace_generation_rule();

COMMENT ON FUNCTION validate_trace_generation_rule() IS
  '판단 로직: (change+anomaly+issue) OR (anomaly + evidence 2개 이상). DEFERRED 트리거.';

COMMENT ON TABLE trace IS
  'change → event anomaly → issue 연결 추적. suspected link + evidence 묶음.';
COMMENT ON COLUMN trace.status IS 'MVP는 suspected만. confirmed/dismissed 전이는 v1.';
COMMENT ON COLUMN trace.anomaly_type IS 'cd_cmmn(mstr_cd=ANOT) 참조. 성능 위해 정규 컬럼화.';
COMMENT ON COLUMN trace.anomaly_detail IS 'baseline/actual/delta_pct 등 타입별 세부값 JSONB';
COMMENT ON COLUMN trace.version IS
  '낙관적 잠금. 주의: evidence/event/issue 카운터만 변경된 경우 version 유지 (트리거 로직 참고).';

CREATE INDEX IF NOT EXISTS idx_trace_change ON trace (change_id, created_at DESC)
  WHERE change_id IS NOT NULL;
COMMENT ON INDEX idx_trace_change IS '쿼리: 특정 change의 trace 목록 (Change Timeline)';

CREATE INDEX IF NOT EXISTS idx_trace_primary_issue ON trace (primary_issue_id)
  WHERE primary_issue_id IS NOT NULL;
COMMENT ON INDEX idx_trace_primary_issue IS '쿼리: 특정 issue의 trace (Linked Issue View)';

CREATE INDEX IF NOT EXISTS idx_trace_window ON trace (anomaly_window_start DESC);
COMMENT ON INDEX idx_trace_window IS '쿼리: Traceability Dashboard 기본 정렬';

CREATE INDEX IF NOT EXISTS idx_trace_confidence_status ON trace (confidence, status, created_at DESC);
COMMENT ON INDEX idx_trace_confidence_status IS
  '쿼리: confidence/status 필터 (strong만 보기 등). 낮은 카디널리티 첫 컬럼이나 특정 값 필터링 후 시간 정렬 효과적.';

CREATE INDEX IF NOT EXISTS idx_trace_anomaly_type ON trace (anomaly_type, created_at DESC);
COMMENT ON INDEX idx_trace_anomaly_type IS '쿼리: 이상 타입별 집계/필터';

CREATE INDEX IF NOT EXISTS idx_trace_anomaly_detail_gin ON trace USING GIN (anomaly_detail);
COMMENT ON INDEX idx_trace_anomaly_detail_gin IS '쿼리: anomaly_detail JSONB 경로 쿼리';

DROP TRIGGER IF EXISTS set_updated_at_trace ON trace;
CREATE TRIGGER set_updated_at_trace
  BEFORE UPDATE ON trace
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at_and_version();

-- ============================================================================
-- 9. evidence — 연결 근거 (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id    TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  trace_id       TEXT          NOT NULL REFERENCES trace(trace_id) ON DELETE CASCADE,
  evdt_cd        CHAR(7)       NOT NULL,
  evds_cd        CHAR(7)       NOT NULL,
  summary        VARCHAR(300)  NOT NULL,
  payload        JSONB         NOT NULL,
  source_ref     JSONB,
  event_refs     TEXT[],
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE evidence IS
  'Trace 연결 근거. trace 1:N.
  APPEND-ONLY 원칙: 생성 후 UPDATE/DELETE 하지 말 것.
  이유: trace.chk_trace_generation_rule 제약이 evidence_count 기반이라
        부분 삭제 시 제약 위반 위험.
  권한: 운영 환경에서 app_role에 DELETE/UPDATE 권한 부여하지 말 것.
  제거가 필요하면 trace 전체를 삭제하여 CASCADE로 처리.';
COMMENT ON COLUMN evidence.evdt_cd IS 'cd_cmmn(mstr_cd=EVDT): timing/variation/event_spike/rule_match';
COMMENT ON COLUMN evidence.evds_cd IS 'cd_cmmn(mstr_cd=EVDS): strong/medium/weak';
COMMENT ON COLUMN evidence.event_refs IS
  'ClickHouse event_id 배열. 근거가 된 event들 (OLAP 크로스 참조, FK 없음).';

CREATE INDEX IF NOT EXISTS idx_evidence_trace ON evidence (trace_id, evds_cd);
COMMENT ON INDEX idx_evidence_trace IS '쿼리: trace의 evidence 전체 조회 (가장 빈번)';

CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence (evdt_cd, created_at DESC);
COMMENT ON INDEX idx_evidence_type IS '쿼리: 타입별 evidence 통계';

CREATE INDEX IF NOT EXISTS idx_evidence_payload_gin ON evidence USING GIN (payload);
COMMENT ON INDEX idx_evidence_payload_gin IS '쿼리: payload JSONB 경로 쿼리';

CREATE INDEX IF NOT EXISTS idx_evidence_events_gin ON evidence USING GIN (event_refs);
COMMENT ON INDEX idx_evidence_events_gin IS '쿼리: 특정 event를 근거로 한 evidence 역조회';

DROP TRIGGER IF EXISTS trg_evidence_count_insert ON evidence;
CREATE TRIGGER trg_evidence_count_insert
  AFTER INSERT ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_update_trace_evidence_count();

DROP TRIGGER IF EXISTS trg_evidence_count_delete ON evidence;
CREATE TRIGGER trg_evidence_count_delete
  AFTER DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION trg_update_trace_evidence_count();

-- ============================================================================
-- 10. event_intake — 정규화 이벤트 인테이크 (Aurora 운영 정본)
-- ============================================================================
-- POST /api/v1/events/intake용 Aurora 인테이크 테이블.
-- event_id가 단일 권위적 dedupe key.
-- ClickHouse events_raw와 별도. 이 테이블은 운영 정본 측면의 normalized intake
-- staging / dedupe 지원이며, OLAP raw 이벤트 스토리지가 아니다.
-- PII 정책은 baseline의 prod_change/issue와 동일 원칙: pseudonymous identifier만 허용,
-- raw payload는 로그/에러 응답에 그대로 노출 금지.

CREATE TABLE IF NOT EXISTS event_intake (
  event_id             TEXT          PRIMARY KEY,
  occurred_at          TIMESTAMPTZ   NOT NULL,
  target_service       VARCHAR(100)  NOT NULL,
  event_type           VARCHAR(50)   NOT NULL,
  event_subtype        VARCHAR(100)  NOT NULL,
  variation            VARCHAR(50),
  cohort               VARCHAR(100),
  duration_ms          INTEGER,
  retry_count          INTEGER       NOT NULL DEFAULT 0,
  is_error             BOOLEAN       NOT NULL DEFAULT FALSE,
  user_id              TEXT,
  session_id           TEXT,
  request_id           TEXT,
  payload              JSONB,
  source               VARCHAR(50)   NOT NULL,
  ingestion_batch_id   VARCHAR(100),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_event_intake_retry_count
    CHECK (retry_count BETWEEN 0 AND 255),
  CONSTRAINT chk_event_intake_duration_ms
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT chk_event_intake_payload_size
    CHECK (pg_column_size(payload) < 1048576)
);

COMMENT ON TABLE event_intake IS
  'POST /api/v1/events/intake Aurora intake table. event_id is the authoritative dedupe key. Distinct from ClickHouse events_raw — normalized intake staging / dedupe support, not raw OLAP storage.';
COMMENT ON COLUMN event_intake.user_id IS
  'PII 주의: pseudonymous identifier만 허용. 직접 이메일/이름 사용 금지.';
COMMENT ON COLUMN event_intake.session_id IS
  'PII 주의: pseudonymous system identifier only.';
COMMENT ON COLUMN event_intake.request_id IS
  'PII 주의: pseudonymous system identifier only.';
COMMENT ON COLUMN event_intake.payload IS
  'Raw payload object. 로그/에러 응답에 그대로 echo 금지 (baseline PII 정책 일관성 유지).';

CREATE INDEX IF NOT EXISTS idx_event_intake_service_time
  ON event_intake (target_service, occurred_at DESC);
COMMENT ON INDEX idx_event_intake_service_time IS
  '쿼리: 특정 서비스의 최근 인테이크 이벤트 조회';

CREATE INDEX IF NOT EXISTS idx_event_intake_type_subtype_time
  ON event_intake (event_type, event_subtype, occurred_at DESC);
COMMENT ON INDEX idx_event_intake_type_subtype_time IS
  '쿼리: 타입/서브타입 기반 인테이크 이벤트 시간 정렬';

-- ============================================================================
-- 11. change_intake_idempotency — POST /changes 멱등 원장 (idempotency ledger)
-- ============================================================================
-- baseline prod_change 테이블이 idempotency_key 컬럼을 갖지 않으므로,
-- POST /api/v1/changes 멱등 재요청 처리는 별도 ledger 테이블에서 관리한다.
-- 응용 레벨: 같은 (request_type, idempotency_key) replay 시 기존 change_id 반환.

CREATE TABLE IF NOT EXISTS change_intake_idempotency (
  request_type      VARCHAR(50)   NOT NULL,
  idempotency_key   VARCHAR(255)  NOT NULL,
  change_id         TEXT          NOT NULL
                                  REFERENCES prod_change(change_id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_change_intake_idempotency
    PRIMARY KEY (request_type, idempotency_key)
);

COMMENT ON TABLE change_intake_idempotency IS
  'POST /api/v1/changes idempotent replay ledger. Idempotency state lives outside prod_change because the baseline table does not include an idempotency_key column.';
COMMENT ON COLUMN change_intake_idempotency.request_type IS
  'Current minimal use is change. Kept explicit to make request namespace visible.';
COMMENT ON COLUMN change_intake_idempotency.idempotency_key IS
  'Client-supplied idempotency key for replay-safe change intake.';

CREATE INDEX IF NOT EXISTS idx_change_intake_idempotency_change_id
  ON change_intake_idempotency (change_id);
COMMENT ON INDEX idx_change_intake_idempotency_change_id IS
  '쿼리: change_id 역조회 (어떤 멱등 키가 같은 change에 매핑됐는지 확인용)';

-- ============================================================================
-- 12. issue_intake_idempotency — POST /issues/intake fallback 멱등 원장
-- ============================================================================
-- 1차 dedupe 키는 issue.uq_issue_external (source, external_id).
-- 그 키가 없거나 매칭되지 않을 때 idempotency_key 기반 fallback dedupe로 사용된다.

CREATE TABLE IF NOT EXISTS issue_intake_idempotency (
  request_type      VARCHAR(50)   NOT NULL,
  idempotency_key   VARCHAR(255)  NOT NULL,
  issue_id          TEXT          NOT NULL
                                  REFERENCES issue(issue_id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_issue_intake_idempotency
    PRIMARY KEY (request_type, idempotency_key)
);

COMMENT ON TABLE issue_intake_idempotency IS
  'POST /api/v1/issues/intake fallback idempotent replay ledger. Used only when (source, external_id) is absent or not matched.';
COMMENT ON COLUMN issue_intake_idempotency.request_type IS
  'Current minimal use is issue. Kept explicit to make request namespace visible.';
COMMENT ON COLUMN issue_intake_idempotency.idempotency_key IS
  'Client-supplied idempotency key for replay-safe issue intake fallback.';

CREATE INDEX IF NOT EXISTS idx_issue_intake_idempotency_issue_id
  ON issue_intake_idempotency (issue_id);
COMMENT ON INDEX idx_issue_intake_idempotency_issue_id IS
  '쿼리: issue_id 역조회 (어떤 멱등 키가 같은 issue에 매핑됐는지 확인용)';

-- ============================================================================
-- 운영 가이드 (주석)
-- ============================================================================
--
-- [1] 스키마 마이그레이션
--   이 DDL은 "baseline" 스크립트. 이후 변경은 Alembic/Flyway/Liquibase 같은
--   마이그레이션 도구로 관리 권장. 각 스키마 변경은 버전 넘버링된 파일로.
--
-- [2] 권한 분리 (DDL에는 포함 안 함, Terraform/배포 스크립트에서 관리)
--   - migration_role: DDL 권한 (CREATE/ALTER/DROP)
--   - app_role: DML 권한 (SELECT/INSERT/UPDATE, DELETE는 issue/prod_change만)
--   - readonly_role: SELECT 권한만
--   - evidence, run_state_log: app_role에 DELETE/UPDATE 권한 주지 말 것 (append-only)
--
-- [3] PII 관리
--   - intake 단계에서 payload/body/actor/reporter 민감정보 마스킹 권장
--   - GDPR/개인정보 삭제 요청 시: issue DELETE → CASCADE로 issue_ops_meta 삭제
--   - trace.primary_issue_id는 ON DELETE SET NULL이므로 trace 자체는 보존됨
--
-- [4] 인덱스 유지보수
--   - GIN 인덱스(keywords, rule_scope, anomaly_detail, payload, event_refs):
--     INSERT 많을 때 비대해짐. 주기적 REINDEX CONCURRENTLY 권장.
--   - 대용량 진입 시 VACUUM ANALYZE 모니터링.
--
-- [5] 파티셔닝 (v1 이후)
--   - issue, prod_change, trace, run은 시간 기반 증가.
--   - 표준 규모 진입 시 PARTITION BY RANGE (occurred_at) 월 단위 파티션 고려.
--   - MVP에서는 단일 테이블, 추후 마이그레이션 계획 별도 수립.
--
-- [6] 동시성
--   - evidence INSERT → trace UPDATE 트리거는 row lock 경합 발생 가능.
--   - 표준 규모 진입 시 측정. 문제 되면 counter를 materialized view로 전환.
--
-- ============================================================================
-- END OF AURORA DDL v2.0
-- ============================================================================
