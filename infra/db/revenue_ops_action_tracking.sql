-- Revenue Ops: Operational action tracking schema
-- Persists action status transitions for the Action Planner cockpit.
-- Append-only log + current-status view pattern.

CREATE SCHEMA IF NOT EXISTS revenue_ops;

-- ── Action status log (append-only) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_ops.action_status_log (
    log_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    action_id       TEXT        NOT NULL,
    anomaly_id      TEXT        NOT NULL,
    trade_area_code TEXT        NOT NULL,
    period_label    TEXT        NOT NULL,
    old_status      TEXT,
    new_status      TEXT        NOT NULL CHECK (new_status IN (
                        'recommended', 'selected', 'planned', 'done', 'dismissed'
                    )),
    changed_by      TEXT        NOT NULL DEFAULT 'cockpit_user',
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    note            TEXT,
    CONSTRAINT action_status_log_pk PRIMARY KEY (log_id)
);

CREATE INDEX IF NOT EXISTS action_status_log_action_id_idx
    ON revenue_ops.action_status_log (action_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS action_status_log_trade_area_period_idx
    ON revenue_ops.action_status_log (trade_area_code, period_label, changed_at DESC);

-- ── Current action status (latest per action_id) ────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_ops.action_current_status (
    action_id       TEXT        NOT NULL,
    anomaly_id      TEXT        NOT NULL,
    trade_area_code TEXT        NOT NULL,
    period_label    TEXT        NOT NULL,
    current_status  TEXT        NOT NULL CHECK (current_status IN (
                        'recommended', 'selected', 'planned', 'done', 'dismissed'
                    )),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT action_current_status_pk PRIMARY KEY (action_id)
);

CREATE INDEX IF NOT EXISTS action_current_status_trade_area_idx
    ON revenue_ops.action_current_status (trade_area_code, period_label);

-- ── Brief view (metadata only — full brief stored in S3/parquet) ─────────────

CREATE TABLE IF NOT EXISTS revenue_ops.revenue_brief_meta (
    brief_id            TEXT        NOT NULL,
    trade_area_code     TEXT        NOT NULL,
    trade_area_name     TEXT        NOT NULL,
    service_category_code TEXT      NOT NULL,
    service_category_name TEXT      NOT NULL,
    period_label        TEXT        NOT NULL,
    source_coverage_score NUMERIC(4, 3),
    data_freshness      NUMERIC(4, 3),
    generated_at        TIMESTAMPTZ NOT NULL,
    parquet_s3_key      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT revenue_brief_meta_pk PRIMARY KEY (brief_id)
);

CREATE INDEX IF NOT EXISTS revenue_brief_meta_period_idx
    ON revenue_ops.revenue_brief_meta (trade_area_code, period_label);

-- ── Helper: upsert action status ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revenue_ops.upsert_action_status(
    p_action_id       TEXT,
    p_anomaly_id      TEXT,
    p_trade_area_code TEXT,
    p_period_label    TEXT,
    p_new_status      TEXT,
    p_changed_by      TEXT DEFAULT 'cockpit_user',
    p_note            TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_old_status TEXT;
BEGIN
    SELECT current_status INTO v_old_status
    FROM revenue_ops.action_current_status
    WHERE action_id = p_action_id;

    INSERT INTO revenue_ops.action_status_log (
        action_id, anomaly_id, trade_area_code, period_label,
        old_status, new_status, changed_by, note
    ) VALUES (
        p_action_id, p_anomaly_id, p_trade_area_code, p_period_label,
        v_old_status, p_new_status, p_changed_by, p_note
    );

    INSERT INTO revenue_ops.action_current_status (
        action_id, anomaly_id, trade_area_code, period_label, current_status, updated_at
    ) VALUES (
        p_action_id, p_anomaly_id, p_trade_area_code, p_period_label, p_new_status, now()
    )
    ON CONFLICT (action_id) DO UPDATE
        SET current_status = EXCLUDED.current_status,
            updated_at     = EXCLUDED.updated_at;
END;
$$;
