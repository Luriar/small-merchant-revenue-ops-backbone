---
title: "Revenue OS"
subtitle: "소상공인 Revenue Ops SaaS"
lang: ko-KR
---

# Revenue OS

매출 코크핏 — 근거 기반 액션 브리프

# 문제

소상공인은 매출 하락을 보지만 원인 후보와 실행 액션까지 연결하기 어렵다.

# POS만으로 부족한 이유

POS는 결과를 보여준다. 날씨, 상권, 검색 관심, 주변 점포, 공휴일 같은 외부 맥락은 별도 해석이 필요하다.

# 제품 개념

store registration → context bootstrap → revenue upload → evidence observations → candidate causes → action planner → outcome feedback

# 사용자 여정

매장 등록, 주소 검색, live 맥락 수집, 매출 CSV/직접 입력, 원인 후보, 실행 액션, 상태 추적.

# Live Context Collectors

Kakao, KMA, Seoul benchmark, Seoul foot traffic, Seoul store density, Naver local, Naver trend, Korean holiday.

# 기술 아키텍처

CloudFront/S3, Cognito, API Gateway, Lambda, Aurora, VPC/NAT, Secrets Manager, CloudWatch.

# ERD / 데이터 모델

tenants, stores, memberships, uploads, daily facts, context observations, collector runs, cause candidates, evidence, actions, jobs/outbox.

# Revenue Upload + Action Planner

POS CSV, delivery CSV foundation, manual daily input. 업로드 후 cause/action refresh.

# Demo Stores

6개 합성 매장, 10주 daily revenue, Demo 라벨, 실제 merchant data 아님.

# Live Validation

completed collectors 8, skipped foundation 2, failed 0, timed out 0, pipeline meta persisted.

# CI/CD + Rollback + Canary

GitHub Actions CI, manual deploy, S3 release-prefix rollback, Lambda alias + CodeDeploy canary plan-ready.

# Runtime Evolution

현재는 serverless paid-SaaS runtime. SQS/EventBridge/worker Lambda 이후 MSK/EKS/Airflow/ClickHouse로 확장.

# Limitations

인과 확정 없음. Toss/Delivery는 credential 필요. Terraform apply 전 automatic rollback active 아님.

# Closing

Revenue OS는 dashboard가 아니라 structured, traceable evidence flow for evidence-backed action이다.
