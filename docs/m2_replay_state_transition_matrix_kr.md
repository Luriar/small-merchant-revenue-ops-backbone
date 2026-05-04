# M2 Replay State Transition Matrix

Purpose: Define allowed state transitions for `cdc_failure` and `cdc_replay_request` before runtime handler implementation.

## `cdc_failure` Statuses

- `open`
- `triaged`
- `replay_requested`
- `replay_approved`
- `reprocess_requested`
- `reprocess_approved`
- `blocked`
- `resolved`
- `closed_no_replay`

| From | To | Triggering API/Action | Required Role | Repository Method | State Log Required | evidence_report_ref Required | new_run_id Required | cleanup_status Requirement | Invalid Behavior |
|---|---|---|---|---|---|---|---|---|---|
| open | replay_requested | create replay request | operator/maintainer | updateFailureStatus | yes | yes | no | not_started | 409 |
| triaged | replay_requested | create replay request | operator/maintainer | updateFailureStatus | yes | yes | no | not_started | 409 |
| open | reprocess_requested | create reprocess request | operator/maintainer | updateFailureStatus | yes | yes | no | not_started | 409 |
| triaged | reprocess_requested | create reprocess request | operator/maintainer | updateFailureStatus | yes | yes | no | not_started | 409 |
| replay_requested | replay_approved | approve replay request | maintainer | updateFailureStatus | yes | yes | no | not_started | 409 |
| reprocess_requested | reprocess_approved | approve reprocess request | maintainer | updateFailureStatus | yes | yes | no | not_started | 409 |
| replay_requested | triaged | cancel request | maintainer | updateFailureStatus | yes | yes | no | not_required | 409 |
| reprocess_requested | triaged | cancel request | maintainer | updateFailureStatus | yes | yes | no | not_required | 409 |
| replay_approved | resolved | future worker success | system_worker | updateFailureStatus | yes | yes | yes | complete | 409 |
| reprocess_approved | resolved | future worker success | system_worker | updateFailureStatus | yes | yes | yes | complete | 409 |
| any active | blocked | operator review block | maintainer | updateFailureStatus | yes | yes | no | pending/failed | 409 |
| triaged | closed_no_replay | close without replay | maintainer | updateFailureStatus | yes | yes | no | not_required | 409 |

## `cdc_replay_request` Statuses

- `requested`
- `approved`
- `rejected`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `cleanup_complete`

| From | To | Triggering API/Action | Required Role | Repository Method | State Log Required | evidence_report_ref Required | new_run_id Required | cleanup_status Requirement | Invalid Behavior |
|---|---|---|---|---|---|---|---|---|---|
| requested | approved | approve | maintainer | updateReplayRequestStatus | yes | yes | no | not_started | 409 |
| requested | cancelled | cancel | maintainer | updateReplayRequestStatus | yes | yes | no | not_required | 409 |
| approved | cancelled | cancel before running | maintainer | updateReplayRequestStatus | yes | yes | no | not_required | 409 |
| approved | running | future worker pickup | system_worker | updateReplayRequestStatus | yes | yes | yes | pending | 409 |
| running | succeeded | future worker success | system_worker | updateReplayRequestStatus | yes | yes | yes | pending/complete | 409 |
| running | failed | future worker failure | system_worker | updateReplayRequestStatus | yes | yes | yes | failed | 409 |
| succeeded | cleanup_complete | cleanup complete | system_worker | updateReplayRequestStatus | yes | yes | yes | complete | 409 |
| requested | rejected | reject instead of approve | maintainer | updateReplayRequestStatus | yes | yes | no | not_required | 409 |

## Stop Conditions

- forbidden field leakage
- missing `idempotency_key`
- missing `evidence_report_ref`
- replay without new run row
- original failure mutation
- original run mutation
- raw message replay by default
