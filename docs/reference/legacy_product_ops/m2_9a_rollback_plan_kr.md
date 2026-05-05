# M2-9A Rollback Plan

## Current Rollback Decision

Rollback is planned but not executable yet because SQL apply is NO-GO until a dev/staging target is explicitly confirmed.

## Rollback Scope For Future M2-9B

If `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` is applied to a confirmed dev/staging target, rollback must cover:

- `public.cdc_failure_state_log`
- `public.cdc_replay_request`
- `public.cdc_failure`
- CDC replay indexes and constraints introduced by the migration

## Rollback Preconditions

- target confirmed non-production
- migration apply evidence recorded
- schema verification report recorded
- cleanup owner assigned
- evidence_report_ref assigned
- no production markers

## Rollback Strategy

Rollback should be written as an explicit reviewed SQL plan before apply. It must account for dependency order and should not be run blindly.

## Current Status

No SQL apply was performed. No rollback action was needed. SQL apply remains blocked until M2-9A can record a real dev/staging target and a reviewed rollback script or rollback procedure.
