# AWS M1 Aurora Private Infra Plan

## Goal

M1 목표는 `Aurora-backed operational API smoke passed` 상태를 만드는 것이다.

## Current State

- 현재 AWS에는 아직 프로젝트 리소스가 없다.
- default VPC와 public Aurora 사용은 금지한다.
- 기준 문서는 VPC + private subnet 구성이다.

## Included Scope

- dedicated dev VPC
- public subnet
- private app subnet
- private DB subnet
- SSM bastion
- private Aurora PostgreSQL Serverless v2
- DB subnet group
- security groups

## Excluded Scope

- EKS
- MSK
- ClickHouse
- Debezium
- Strimzi
- Airflow
- Argo
- CDC

## Network Rules

- Aurora는 private DB subnet에 배치한다.
- 로컬 직접 접속 대신 SSM bastion을 경유한다.
- PostgreSQL 5432는 `bastion_sg`에서 `aurora_sg`로만 허용한다.
- `0.0.0.0/0` PostgreSQL inbound는 금지한다.

## Outcome

이 단계의 목표는 API가 Aurora에 연결되고, 읽기 전용 connection smoke가 통과하는 상태다. ClickHouse-backed analytics, CDC pipeline, and fake anomaly enrichment는 이 단계의 범위가 아니다.
