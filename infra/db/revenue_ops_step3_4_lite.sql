-- Revenue Ops STEP 3 + STEP 4-lite operational SaaS foundation.
-- Non-destructive DDL for app users, stores, uploaded revenue facts,
-- public context observations, cause candidates, actions, and outcome tracking.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
    app_user_id  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    cognito_sub  TEXT UNIQUE NOT NULL,
    email        TEXT,
    display_name TEXT,
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    last_login_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_cognito_sub_idx ON app_users (cognito_sub);

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_name TEXT NOT NULL,
    tenant_type TEXT NOT NULL DEFAULT 'merchant' CHECK (tenant_type IN ('merchant', 'franchise', 'demo')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by  TEXT REFERENCES app_users(app_user_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_members (
    tenant_id   TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    app_user_id TEXT NOT NULL REFERENCES app_users(app_user_id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, app_user_id)
);

CREATE INDEX IF NOT EXISTS tenant_members_app_user_status_idx ON tenant_members (app_user_id, status);

CREATE TABLE IF NOT EXISTS stores (
    store_id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id         TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    store_name        TEXT NOT NULL,
    store_type        TEXT NOT NULL DEFAULT 'single_store' CHECK (store_type IN ('single_store', 'branch', 'demo')),
    business_category TEXT,
    region            TEXT,
    address_text      TEXT,
    timezone          TEXT NOT NULL DEFAULT 'Asia/Seoul',
    status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'disabled')),
    metadata          JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by        TEXT REFERENCES app_users(app_user_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stores_tenant_status_created_idx ON stores (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS store_members (
    store_id    TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    app_user_id TEXT NOT NULL REFERENCES app_users(app_user_id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, app_user_id)
);

CREATE INDEX IF NOT EXISTS store_members_app_user_status_idx ON store_members (app_user_id, status);
CREATE INDEX IF NOT EXISTS store_members_store_status_idx ON store_members (store_id, status);

CREATE TABLE IF NOT EXISTS revenue_uploads (
    upload_id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id          TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    uploaded_by       TEXT REFERENCES app_users(app_user_id) ON DELETE SET NULL,
    source_type       TEXT NOT NULL,
    original_filename TEXT,
    file_type         TEXT,
    status            TEXT NOT NULL CHECK (status IN ('uploaded', 'parsed', 'needs_mapping', 'partially_accepted', 'accepted', 'failed')),
    row_count         INTEGER NOT NULL DEFAULT 0,
    accepted_count    INTEGER NOT NULL DEFAULT 0,
    rejected_count    INTEGER NOT NULL DEFAULT 0,
    metadata          JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revenue_uploads_store_created_idx ON revenue_uploads (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS revenue_upload_raw_rows (
    raw_row_id  BIGSERIAL PRIMARY KEY,
    upload_id   TEXT NOT NULL REFERENCES revenue_uploads(upload_id) ON DELETE CASCADE,
    row_number  INTEGER NOT NULL,
    row_payload JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_upload_rejected_rows (
    rejected_row_id BIGSERIAL PRIMARY KEY,
    upload_id       TEXT NOT NULL REFERENCES revenue_uploads(upload_id) ON DELETE CASCADE,
    row_number      INTEGER NOT NULL,
    reason_code     TEXT NOT NULL,
    reason_message  TEXT NOT NULL,
    raw_row_preview JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_daily_facts (
    daily_fact_id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id             TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    business_date        DATE NOT NULL,
    channel              TEXT NOT NULL DEFAULT 'offline_pos',
    gross_sales_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_sales_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    order_count          INTEGER NOT NULL DEFAULT 0,
    cancel_count         INTEGER NOT NULL DEFAULT 0,
    refund_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_card_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_cash_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    source_upload_id     TEXT REFERENCES revenue_uploads(upload_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, business_date, channel, source_upload_id)
);

CREATE INDEX IF NOT EXISTS revenue_daily_facts_store_date_idx ON revenue_daily_facts (store_id, business_date DESC);

CREATE TABLE IF NOT EXISTS revenue_item_facts (
    item_fact_id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id           TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    business_date      DATE NOT NULL,
    channel            TEXT NOT NULL DEFAULT 'offline_pos',
    item_name          TEXT NOT NULL,
    item_category      TEXT,
    quantity           INTEGER NOT NULL DEFAULT 0,
    gross_sales_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_sales_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    source_upload_id   TEXT REFERENCES revenue_uploads(upload_id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revenue_item_facts_store_date_idx ON revenue_item_facts (store_id, business_date DESC);

CREATE TABLE IF NOT EXISTS context_sources (
    source_id           TEXT PRIMARY KEY,
    source_name         TEXT NOT NULL,
    source_type         TEXT NOT NULL,
    provider            TEXT,
    source_url          TEXT,
    license_type        TEXT,
    attribution         TEXT,
    refresh_granularity TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS context_observations (
    observation_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    source_id        TEXT REFERENCES context_sources(source_id) ON DELETE SET NULL,
    store_id         TEXT REFERENCES stores(store_id) ON DELETE CASCADE,
    observation_date DATE,
    observation_hour INTEGER,
    context_type     TEXT NOT NULL,
    metric_name      TEXT NOT NULL,
    metric_value     NUMERIC,
    metric_unit      TEXT,
    label            TEXT,
    region           TEXT,
    raw_payload      JSONB NOT NULL DEFAULT '{}'::JSONB,
    observed_at      TIMESTAMPTZ,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_observations_store_date_idx ON context_observations (store_id, observation_date DESC);

CREATE TABLE IF NOT EXISTS public_revenue_benchmarks (
    benchmark_id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    source_id             TEXT REFERENCES context_sources(source_id) ON DELETE SET NULL,
    region                TEXT,
    commercial_area_code  TEXT,
    business_category     TEXT,
    period_start          DATE,
    period_end            DATE,
    sales_amount          NUMERIC(16,2),
    transaction_count     INTEGER,
    avg_transaction_value NUMERIC(14,2),
    metadata              JSONB NOT NULL DEFAULT '{}'::JSONB,
    fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_context_links (
    store_id       TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    observation_id TEXT NOT NULL REFERENCES context_observations(observation_id) ON DELETE CASCADE,
    link_type      TEXT NOT NULL CHECK (link_type IN ('same_region', 'nearest_station', 'commercial_area', 'manual_seed')),
    strength       TEXT NOT NULL CHECK (strength IN ('strong', 'medium', 'weak')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, observation_id, link_type)
);

CREATE TABLE IF NOT EXISTS store_locations (
    store_id             TEXT PRIMARY KEY REFERENCES stores(store_id) ON DELETE CASCADE,
    address_text         TEXT,
    latitude             NUMERIC(10,7),
    longitude            NUMERIC(10,7),
    region               TEXT,
    administrative_dong  TEXT,
    legal_dong           TEXT,
    geocode_provider     TEXT,
    geocode_status       TEXT NOT NULL DEFAULT 'manual_seed' CHECK (geocode_status IN ('manual_seed', 'geocoded', 'failed', 'pending')),
    metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commercial_area_mappings (
    mapping_id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id              TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    commercial_area_code  TEXT,
    commercial_area_name  TEXT,
    administrative_dong   TEXT,
    business_category     TEXT,
    mapping_method        TEXT NOT NULL CHECK (mapping_method IN ('manual_seed', 'coordinate_match', 'district_match', 'future_api')),
    confidence            TEXT NOT NULL CHECK (confidence IN ('strong', 'medium', 'weak')),
    metadata              JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_area_mappings_store_idx ON commercial_area_mappings (store_id);

CREATE TABLE IF NOT EXISTS nearby_store_snapshots (
    snapshot_id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id                  TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    snapshot_date             DATE NOT NULL,
    radius_m                  INTEGER NOT NULL DEFAULT 500,
    business_category         TEXT,
    same_category_store_count INTEGER,
    total_store_count         INTEGER,
    source_id                 TEXT REFERENCES context_sources(source_id) ON DELETE SET NULL,
    metadata                  JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nearby_store_snapshots_store_date_idx ON nearby_store_snapshots (store_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS collector_runs (
    collector_run_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    collector_name   TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    target_store_id  TEXT REFERENCES stores(store_id) ON DELETE SET NULL,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    error_message    TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collector_runs_store_created_idx ON collector_runs (target_store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cause_candidates (
    cause_candidate_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id           TEXT REFERENCES stores(store_id) ON DELETE CASCADE,
    candidate_type     TEXT NOT NULL,
    title              TEXT NOT NULL,
    summary            TEXT NOT NULL,
    confidence         TEXT NOT NULL CHECK (confidence IN ('strong', 'medium', 'weak')),
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed')),
    metric_name        TEXT,
    baseline_start     DATE,
    baseline_end       DATE,
    compare_start      DATE,
    compare_end        DATE,
    observed_delta_pct NUMERIC,
    created_from       TEXT NOT NULL CHECK (created_from IN ('seed_rule', 'revenue_mart', 'manual', 'future_ai')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cause_candidates_store_status_idx ON cause_candidates (store_id, status);

CREATE TABLE IF NOT EXISTS cause_candidate_evidence (
    evidence_id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    cause_candidate_id   TEXT NOT NULL REFERENCES cause_candidates(cause_candidate_id) ON DELETE CASCADE,
    evidence_type        TEXT NOT NULL,
    strength             TEXT NOT NULL CHECK (strength IN ('strong', 'medium', 'weak')),
    summary              TEXT NOT NULL,
    source_name          TEXT,
    source_ref           TEXT,
    metric_name          TEXT,
    metric_value         NUMERIC,
    metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_planner_items (
    action_id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    store_id           TEXT NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    cause_candidate_id TEXT REFERENCES cause_candidates(cause_candidate_id) ON DELETE SET NULL,
    action_family      TEXT,
    dedupe_key         TEXT NOT NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    why_this_action    TEXT,
    expected_effect    TEXT,
    risk_note          TEXT,
    difficulty         TEXT,
    status             TEXT NOT NULL DEFAULT 'recommended' CHECK (status IN ('recommended', 'selected', 'planned', 'done', 'dismissed')),
    planned_start_date DATE,
    planned_end_date   DATE,
    completed_at       TIMESTAMPTZ,
    status_updated_by  TEXT REFERENCES app_users(app_user_id) ON DELETE SET NULL,
    outcome_summary    TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS action_planner_items_store_status_idx ON action_planner_items (store_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS action_outcome_snapshots (
    outcome_id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    action_id           TEXT REFERENCES action_planner_items(action_id) ON DELETE CASCADE,
    store_id            TEXT REFERENCES stores(store_id) ON DELETE CASCADE,
    baseline_start      DATE,
    baseline_end        DATE,
    result_start        DATE,
    result_end          DATE,
    metric_name         TEXT,
    baseline_value      NUMERIC,
    result_value        NUMERIC,
    observed_delta_pct  NUMERIC,
    summary             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_outcome_snapshots_action_idx ON action_outcome_snapshots (action_id, created_at DESC);

ALTER TABLE IF EXISTS revenue_action_status_override
    ADD COLUMN IF NOT EXISTS store_id TEXT;

CREATE INDEX IF NOT EXISTS revenue_action_status_override_store_action_idx
    ON revenue_action_status_override (store_id, action_id);
