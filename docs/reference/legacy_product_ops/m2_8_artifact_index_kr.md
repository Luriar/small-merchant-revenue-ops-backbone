# M2-8 Artifact Index

## M2-8A Readiness

- `docs/m2_8a_route_wiring_readiness_audit_kr.md`: planning/validation, not production-facing, safe metadata only
- `ops/m2_8a_route_wiring_readiness/`: checklist validation, not production-facing, safe metadata only
- `scripts/validate_m2_8a_route_wiring_readiness.py`: validation, not production-facing

## M2-8B Test-Only Harness

- `apps/api/src/cdc-recovery/test-support/`: test implementation, not production-facing except reused as stub boundary, safe metadata only
- `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js`: validation test, not production-facing
- `docs/m2_8b_test_only_harness_implementation_kr.md`: implementation doc, not production-facing
- `scripts/validate_m2_8b_test_only_harness.py`: validation

## M2-8C Error Docs

- `docs/m2_8c_prep_error_envelope_integration_kr.md`: planning, not production-facing
- `docs/m2_8c_error_envelope_decision_record_kr.md`: decision record, not production-facing
- `ops/m2_8c_error_envelope_integration/`: checklists
- `fixtures/m2_8c_errors/`: safe examples only

## M2-8D Repository Strategy

- `docs/m2_8d_prep_repository_strategy_kr.md`: planning
- `docs/m2_8d_repository_strategy_decision_record_kr.md`: decision record
- `ops/m2_8d_repository_strategy/`: checklists
- `fixtures/m2_8d_repository/`: safe contract examples only

## M2-8E OpenAPI Ownership

- `docs/m2_8e_prep_openapi_merge_ownership_kr.md`: planning
- `docs/m2_8e_openapi_merge_decision_record_kr.md`: decision record
- `ops/m2_8e_openapi_merge_ownership/`: checklists
- `fixtures/m2_8e_openapi/`: safe gate examples only

## M2-8F Route-Test Contract

- `docs/m2_8f_prep_route_level_integration_test_contract_kr.md`: planning
- `docs/m2_8f_route_test_decision_record_kr.md`: decision record
- `ops/m2_8f_route_level_tests/`: checklists
- `fixtures/m2_8f_route_tests/`: safe test catalog only

## M2-8G Final Pre-Wiring

- `docs/m2_8g_final_pre_wiring_closure_kr.md`: closure/planning
- `docs/m2_8g_go_no_go_summary_kr.md`: decision summary
- `docs/m2_8g_next_implementation_prompt_kr.md`: handoff prompt
- `ops/m2_8g_final_pre_wiring/`: checklists

## M2-8H Readiness Review

- `docs/m2_8h_production_route_wiring_readiness_review_kr.md`: readiness review
- `docs/m2_8h_route_wiring_decision_record_kr.md`: decision record
- `docs/m2_8h_next_production_wiring_prompt_kr.md`: handoff prompt
- `ops/m2_8h_route_wiring_readiness/`: checklists

## M2-8I Implementation

- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`: production-facing route dispatcher, safe metadata only, stub-backed
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`: validation test, not production-facing
- `docs/m2_8i_production_route_wiring_implementation_kr.md`: implementation doc
- `docs/m2_8i_closure_summary_kr.md`: closure doc
- `scripts/validate_m2_8i_production_route_wiring.py`: validation
- `scripts/m2_8i_validator_compat.py`: validator compatibility helper

## Planning Extensions

- `docs/m2_8j_openapi_merge_readiness_plan_kr.md`: planning only
- `docs/m2_8k_aurora_repository_readiness_plan_kr.md`: planning only
- `docs/m2_8l_controlled_runtime_reentry_plan_kr.md`: planning only
- `docs/m2_8_validation_evidence_ledger_kr.md`: validation evidence
- `docs/m2_8_artifact_index_kr.md`: artifact index

## M2-8M OpenAPI Merge

- `sources/personal_project_openapi_v0_2.yaml`: production-facing OpenAPI contract, CDC recovery paths and safe metadata schemas merged
- `docs/m2_8m_openapi_merge_implementation_kr.md`: implementation doc, validation/planning, safe metadata only
- `docs/m2_8m_post_merge_schema_parity_kr.md`: validation evidence, schema-to-DTO parity, safe metadata only
- `docs/m2_8m_openapi_merge_decision_record_kr.md`: decision record, not runtime-facing
- `docs/m2_8m_closure_summary_kr.md`: closure doc, not runtime-facing
- `scripts/validate_m2_8m_openapi_merge.py`: validation
- `scripts/m2_8m_validator_compat.py`: validation compatibility helper for approved CDC OpenAPI merge diff

## M2-8N Planning

- `docs/m2_8n_post_merge_contract_closure_plan_kr.md`: planning only, not production-facing, safe metadata only
- `docs/m2_8n_post_merge_contract_closure_kr.md`: closure, not production-facing, safe metadata only
- `docs/m2_8n_aurora_repository_readiness_gate_kr.md`: gate doc, not production-facing
- `docs/m2_8n_route_openapi_parity_regression_kr.md`: validation evidence, not production-facing
- `docs/m2_8n_safe_persistence_boundary_decision_record_kr.md`: decision record, not production-facing
- `scripts/validate_m2_8n_post_merge_closure.py`: validation

## M2-8O Mocked Aurora Repository

- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`: implementation, not live-wired, safe metadata only
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js`: validation test, not production-facing
- `docs/m2_8o_aurora_repository_implementation_kr.md`: implementation doc
- `docs/m2_8o_repository_test_matrix_kr.md`: validation matrix
- `docs/m2_8o_persistence_boundary_decision_record_kr.md`: decision record
- `scripts/validate_m2_8o_aurora_repository.py`: validation

## M2-9A Live DB Preflight

- `docs/m2_9a_live_db_preflight_gate_kr.md`: live DB preflight NO-GO evidence
- `docs/m2_9a_rollback_plan_kr.md`: rollback planning
- `docs/m2_9a_live_db_no_go_decision_record_kr.md`: decision record
- `scripts/validate_m2_9a_live_db_preflight.py`: validation
- `docs/m2_live_gated_closure_summary_kr.md`: live-gated closure
- `docs/m2_claude_repair_prompt_kr.md`: repair prompt
- `docs/m2_next_phase_plan_kr.md`: next phase plan
