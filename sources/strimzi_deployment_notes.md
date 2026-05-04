# Strimzi Deployment Notes

Deployment-preflight notes for the Strimzi CDC manifests in this directory:

- `strimzi_connect.yaml` — KafkaConnect cluster (Debezium plugin image build).
- `strimzi_connectors.yaml` — three KafkaConnector resources (`prod_change`, `trace`, `issue`).

## These files are templates, not directly apply-ready manifests

Do **not** run `kubectl apply -f sources/strimzi_connect.yaml` or `kubectl apply -f sources/strimzi_connectors.yaml` directly. Both files contain unresolved `${...}` shell-style placeholders and at least one literal placeholder (`sha512sum: REPLACE_WITH_ACTUAL_SHA512`) that will fail at apply or build time. They are intended to be processed by a templating step (`envsubst`, Helm, Kustomize, or equivalent) and to be deployed only after the preconditions below are satisfied.

## Required substitution variables

| Variable | Where it appears | Notes |
| --- | --- | --- |
| `${MSK_BOOTSTRAP_SERVERS}` | `strimzi_connect.yaml` (`spec.bootstrapServers`) and the SQL/DDL examples | MSK Serverless bootstrap endpoint, e.g. `b-1.xxx.kafka.<region>.amazonaws.com:9098` |
| `${ECR_REGISTRY}` | `strimzi_connect.yaml` (`spec.build.output.image`) | ECR registry hostname for the Connect plugin image, e.g. `<acct>.dkr.ecr.<region>.amazonaws.com` |
| `${CONNECT_IAM_ROLE_ARN}` | `strimzi_connect.yaml` (`template.pod.metadata.annotations.eks.amazonaws.com/role-arn`) | IRSA role for Connect pods to authenticate to MSK and pull from ECR |
| `${AURORA_HOST}` | `strimzi_connectors.yaml` (`database.hostname` in all 3 connectors) | Aurora writer endpoint |
| `${AURORA_DB_USER}` | `strimzi_connectors.yaml` (`database.user`) | Resolved from the `aurora-cdc-credentials` Kubernetes secret via `externalConfiguration.env` in `strimzi_connect.yaml` |
| `${AURORA_DB_PASSWORD}` | `strimzi_connectors.yaml` (`database.password`) | Same — resolved from `aurora-cdc-credentials` |

The Aurora user/password variables are **not** intended to be substituted by `envsubst` at template time. They are injected into the Connect worker process as environment variables by Strimzi via the `externalConfiguration.env` block in `strimzi_connect.yaml`, which references the `aurora-cdc-credentials` Kubernetes secret. The `${...}` syntax in `strimzi_connectors.yaml` is read by the Connect runtime (which can read pod env vars in connector config), not by `envsubst`. If you do envsubst the connectors file, leave `${AURORA_DB_USER}` and `${AURORA_DB_PASSWORD}` as literal `${...}` strings; `envsubst -i` (or a variable allow-list) is recommended.

## Debezium plugin checksum must be replaced before build

`strimzi_connect.yaml` line ~68 contains:

```yaml
sha512sum: REPLACE_WITH_ACTUAL_SHA512
```

Strimzi's Kaniko build will compare this checksum against the downloaded Debezium plugin tarball and fail the build on mismatch. Before deployment, replace this string with the real sha512 from the official Maven Central artifact (the URL is in the same block). This file does **not** contain a guessed value; the real checksum must be filled in at deploy time.

## ecr-push-secret must exist before applying

`strimzi_connect.yaml` `spec.build.output.pushSecret: ecr-push-secret` references a Kubernetes secret of that name in the same namespace (`data-platform`). The secret must exist before applying the KafkaConnect resource, or the build pod will fail to push to ECR. Common ways to create it:

- A `kubernetes.io/dockerconfigjson` secret materialized by the External Secrets Operator from AWS Secrets Manager.
- A short-lived secret created from `aws ecr get-login-password` for one-off bootstrapping.
- An IRSA-based push if your Strimzi/Kaniko version supports it (in which case the `pushSecret` field can be removed; today the manifest assumes the secret approach).

The secret name is hard-coded; change the manifest if your environment uses a different name.

## Example envsubst flow

```bash
# Variables expected to be in the shell environment
export MSK_BOOTSTRAP_SERVERS=...
export ECR_REGISTRY=...
export CONNECT_IAM_ROLE_ARN=...
export AURORA_HOST=...

# 1. Connect cluster (after you have replaced the sha512 placeholder)
envsubst < sources/strimzi_connect.yaml | kubectl apply -f -

# 2. Connectors. Note: AURORA_DB_USER and AURORA_DB_PASSWORD are resolved by
#    Connect at runtime from the aurora-cdc-credentials secret; do not expand
#    them at template time.
envsubst '${AURORA_HOST}' < sources/strimzi_connectors.yaml | kubectl apply -f -
```

If you use Helm, Kustomize, or `yq`-based substitution instead, follow the same rule: only template the deploy-time variables (`MSK_BOOTSTRAP_SERVERS`, `ECR_REGISTRY`, `CONNECT_IAM_ROLE_ARN`, `AURORA_HOST`), and let Connect resolve `AURORA_DB_USER`/`AURORA_DB_PASSWORD` from the env-injected secret.

## Preflight checklist

Run through this list before applying either file. Skipping any of these will produce confusing failures (Connect pod CrashLoopBackOff, replication slot WAL bloat, missing CH ingest, or mysterious 0-row CDC topics).

- [ ] `MSK_BOOTSTRAP_SERVERS` is set to the MSK Serverless bootstrap endpoint.
- [ ] `ECR_REGISTRY` is set to the ECR registry hostname that Strimzi can push to.
- [ ] `CONNECT_IAM_ROLE_ARN` is set; the IRSA role has permissions for MSK IAM auth and ECR pull/push.
- [ ] Aurora host, user, and password are reachable. The user is `debezium_cdc` (created by `aurora_logical_replication.sql`) and credentials are in the `aurora-cdc-credentials` Kubernetes secret (typically materialized by External Secrets Operator from AWS Secrets Manager).
- [ ] `aurora-cdc-credentials` secret exists in the target namespace (`data-platform`).
- [ ] Debezium plugin sha512 in `strimzi_connect.yaml` is replaced with the real checksum from `https://repo1.maven.org/maven2/io/debezium/debezium-connector-postgres/2.6.2.Final/debezium-connector-postgres-2.6.2.Final-plugin.tar.gz.sha512`.
- [ ] `ecr-push-secret` exists in the target namespace (or the manifest is updated to use IRSA-based pushes).
- [ ] Aurora cluster parameter group has `rds.logical_replication = 1`, and the cluster has been rebooted since the change.
- [ ] `aurora_logical_replication.sql` has been applied: `debezium_cdc` user exists, `REPLICA IDENTITY FULL` is set on `prod_change`, `trace`, `issue`, and the three publications (`aurora_prod_change_pub`, `aurora_trace_pub`, `aurora_issue_pub`) exist with the expected column lists (`aurora_issue_pub` must omit `body`, `payload`, `reporter`, `title` — verify with the audit query in `aurora_logical_replication.sql` § 5).
- [ ] ClickHouse Kafka engine tables (`events_raw_kafka`, `prod_change_cdc_kafka`, `trace_cdc_kafka`, `issue_cdc_kafka`) exist before consuming any topics; create them per `clickhouse_ddl_v2_1.sql` so the first messages on `cdc.aurora.*` are not dropped.
- [ ] MSK topics either exist with the expected partition/replication settings (see deploy notes at the bottom of `strimzi_connectors.yaml`) or topic auto-creation is enabled.
- [ ] Strimzi Cluster Operator is installed in the target Kubernetes cluster and is watching the `data-platform` namespace.

## Currently documented deployment risks

Apply-time and build-time risks now covered by this document:

1. Direct `kubectl apply` will fail because of unresolved `${...}` placeholders.
2. The Strimzi Kaniko build will fail with `sha512sum: REPLACE_WITH_ACTUAL_SHA512` until the real checksum is filled in.
3. `ecr-push-secret` is a hard precondition that is otherwise only mentioned in a comment inside the manifest.
4. `AURORA_DB_USER` / `AURORA_DB_PASSWORD` must be resolved at runtime from `aurora-cdc-credentials`, not expanded at template time — easy to get wrong with naive envsubst.
5. Order of operations across Aurora SQL → KafkaConnect → KafkaConnector → ClickHouse Kafka engine tables is now spelled out, preventing the "topic exists but no rows in CH" failure mode.

## Out of scope for this document

The following Strimzi/CDC concerns from the YAML review are **not** addressed here — they require runtime semantic changes to the manifests and are deferred to follow-up work:

- `publication.autocreate.mode: filtered` should likely move to `disabled` after first deployment, to lock down the explicit publication contract. Not changed.
- `errors.tolerance: none` halts the connector task on any bad message and has no DLQ topic. Not changed.
- `prod_change.actor` PII column has no publication-level or connector-level filter; defense-in-depth is left to a future change.
- The validation report `sources/personal_project_openapi_v0_2_validation_report.json` is a separate artifact and is not affected by this document.
