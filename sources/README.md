# sources/

`sources/` is the project archive for fixed reference material: worldview, product direction, architecture baseline, API/DB contract, validation reports, operating standards, and handoff notes.

It is not a runtime path and it is not where executable code, apply scripts, smoke scripts, or live application handlers belong. Keep those roles separate:

- `docs/` for in-progress decisions, ledgers, ADRs, and working notes
- `infra/` for executable infrastructure, SQL apply files, smoke scripts, and deployment assets
- `apps/` for application code, runtime handlers, repositories, DTOs, and frontend logic
- `scripts/` for local validation and automation helpers

Do not move execution files into `sources/`. `sources/` should contain only the fixed reference copies, summaries, or archived baseline documents that people read as the project standard.

## Index

### A. Worldview / Direction

- `ai_knowledge_operations_worldview.docx`
- `project_structure_summary_kr.docx`
- `개인 프로젝트 방향.txt`

### B. Team Project

- `team_project_issue_first_ops_plan.docx`

### C. Personal Project Baseline

- `tech_stack_final.docx`
- `personal_project_execution_standard_v2_1_correction_kr.docx`
- `personal_project_all_wire_specs_detailed_kr.docx`
- `personal_project_api_db_mapping_final_kr.docx`
- `personal_project_pre_implementation_design_bundle_kr.docx`
- `personal_project_implementation_order_kr.docx`
- `personal_project_operations_recovery_playbook_kr.docx`
- `personal_project_v2_reflection_checklist_kr.docx`

### D. API / DB / Contract

- `personal_project_openapi_v0_2.yaml`
- `personal_project_openapi_v0_2_documentation_kr.docx`
- `personal_project_openapi_v0_2_validation_report.json`
- `personal_project_crosswalk_standard_openapi_ddl_kr.docx`
- `aurora_ddl_v2.sql`
- `clickhouse_ddl_v2_1.sql`
- `aurora_logical_replication.sql`

### E. CDC / Streaming

- `strimzi_connect.yaml`
- `strimzi_connectors.yaml`
- `strimzi_deployment_notes.md`

### F. AWS / Infra Handoff

- `aws_m1_aurora_private_infra_plan_kr.md`
- `aurora_first_connection_handoff_kr.md`

## Archive Snapshots

`sources/archive/` holds historical baseline copies that are retained for reference only.

- `archive/personal_project_execution_baseline_kr.docx`
- `archive/personal_project_execution_baseline_kr_v2.docx`

## Boundary Rules

- `sources/` may contain fixed reference documents, archived standards, and human-readable summaries.
- `sources/` must not become a place for runtime-only code, handlers, or operational scripts.
- `sources/` is a source-of-truth archive, not a runtime import path.
