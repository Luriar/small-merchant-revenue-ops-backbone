**TraceOps Frontend Component Specification v0.1**

Trace Evidence Spine 중심 구현 명세

Event-Driven Product Ops Backbone · Traceability-first Investigation
Console

<img src="media/image1.png" style="width:6.85in;height:3.85517in" />

참고 시안: Operator Briefing + Trace Evidence Spine + Investigation
Workbench

**핵심 결정:** 이 문서는 실제 프론트 구현에서 Trace Evidence Spine을
“연결된 카드 묶음”이 아니라 “하나의 인터랙티브 investigation canvas”로
구현하기 위한 기준선이다.

# 문서 목차

- 1\. 구현 목표와 MVP 전제

- 2\. 전체 화면 구조

- 3\. 핵심 구현 원칙

- 4\. 컴포넌트별 명세

- 5\. Spine 인터랙션 명세

- 6\. Investigation Workbench

- 7\. Recommended Follow-up

- 8\. API 연결 기준

- 9\. 화면 상태

- 10\. 구현 우선순위

- 11\. 최종 구현 체크리스트

# 1. 구현 목표와 MVP 전제

TraceOps 메인 화면은 일반적인 analytics dashboard가 아니라, 제품 변경
이후 발생한 이상 신호와 운영 이슈를 evidence 기반으로 추적하는
traceability-first investigation console이다. **현재 MVP의 핵심은 change
→ anomaly pattern → issue → evidence → follow-up action 흐름을 한
화면에서 이해하게 만드는 것이다.**

- 무엇이 바뀌었는가?

- 어떤 이상 신호가 생겼는가?

- 어떤 운영 이슈와 연결되는가?

- 왜 이 연결을 믿을 수 있는가?

- 지금 어떤 후속 조치를 해야 하는가?

**범위 고정:** 이 화면은 실제 rollback, flag reduction, stop rollout
같은 control surface가 아니다. MVP에서는 suspected trace를 조사하고
follow-up 또는 handoff로 넘기는 콘솔로 제한한다.

# 2. 전체 화면 구조

TraceabilityOverviewPage

├─ AppShell

│ ├─ Sidebar

│ └─ TopBar

├─ MainWorkspace

│ ├─ OperatorBriefing

│ │ └─ ReviewCaseCard\[\]

│ ├─ TraceEvidenceSection

│ │ ├─ TraceEvidenceSpine

│ │ │ ├─ SpineCanvas

│ │ │ │ ├─ SpinePathLayer

│ │ │ │ ├─ SpineNodeLayer

│ │ │ │ ├─ SpineStagePanels

│ │ │ │ └─ TraceStateOverlay

│ │ │ └─ EvidenceStrengthRail

│ └─ ContextModules

│ ├─ RecentTraceTimeline

│ ├─ CorroboratingSignals

│ └─ ReliabilityContext

└─ InvestigationWorkbench

├─ IssueSummary

├─ SuspectedTrace

├─ RelatedChange

├─ EvidenceObserved

├─ ImpactedService

└─ RecommendedFollowUp

# 3. 핵심 구현 원칙

**최종 구현 문장:** Trace Evidence Spine은 5개의 카드 목록이 아니라,
선택된 trace의 change → anomaly → issue → evidence → follow-up 관계를
하나의 reasoning object로 보여주는 인터랙티브 investigation canvas다.

| **원칙**                   | **구현 의미**                                                                 |
|----------------------------|-------------------------------------------------------------------------------|
| 카드 나열 금지             | 단순 grid/flex로 stage card 5개를 배치하는 구조는 피한다.                     |
| Canvas 중심 설계           | SpineCanvas가 path, node, stage card, evidence rail을 하나의 표면으로 묶는다. |
| Evidence-first interaction | evidence hover 시 관련 stage와 path segment가 즉시 반응한다.                  |
| Follow-up 중심             | 액션은 investigation / handoff / recovery 성격으로 제한한다.                  |

# 4. 컴포넌트별 명세

## 4.1 OperatorBriefing

상단에서 현재 운영자가 가장 먼저 봐야 할 trace 후보를 보여준다. 이
영역은 KPI 카드가 아니라 operator briefing / review queue처럼 보여야
한다.

표시 데이터 타입

type ReviewCase = {

id: string;

riskLevel: "high" \| "medium" \| "low";

title: string;

service: string;

linkedChangeTitle: string;

confidence: number;

affectedUsers: string;

firstSeenAt: string;

status: "open" \| "investigating";

primaryActionLabel: string;

};

- 첫 번째 카드는 selected state로 보여준다.

- 두 번째와 세 번째 카드는 visual weight를 낮춘다.

- 모든 카드를 같은 무게로 보여주면 generic dashboard처럼 보이므로
  금지한다.

- 권장 액션 문구: Review release scope, Review evidence, View details.

## 4.2 TraceEvidenceSpine

선택된 trace의 흐름을 Product Change → Signal / Anomaly → Linked Issue
Cluster → Evidence Strength → Recommended Follow-up 순서로 보여주는 핵심
컴포넌트다.

Stage 타입

type TraceStageId =

\| "product-change"

\| "signal-anomaly"

\| "linked-issue-cluster"

\| "evidence-strength"

\| "recommended-follow-up";

type TraceStage = {

id: TraceStageId;

order: number;

title: string;

subtitle?: string;

icon: string;

timeDeltaFromPrevious?: string;

status?: "normal" \| "highlighted" \| "muted";

};

| **Stage**                 | **역할**            | **예시 내용**                                                                    |
|---------------------------|---------------------|----------------------------------------------------------------------------------|
| 1\. Product Change        | 변경 기준점         | Checkout release v2.4.1, Payments Service, deployed May 14 10:02 AM              |
| 2\. Signal / Anomaly      | 변경 이후 관측 신호 | Conversion drop / payment timeout spike, confidence 88%                          |
| 3\. Linked Issue Cluster  | 운영 이슈 연결      | Spike in payment failure complaints, Payment Failures, Investigating             |
| 4\. Evidence Strength     | 연결 근거           | Support ticket pattern, metric deviation, log correlation, event spike alignment |
| 5\. Recommended Follow-up | 다음 행동           | Review evidence, open linked issue, create handoff, retry/reprocess              |

## 4.3 SpineCanvas

Spine 전체를 하나의 장치처럼 보이게 하는 부모 레이어다. 전체 배경, path,
node, card, interaction overlay가 같은 surface 안에서 작동해야 한다.

SpineCanvas

├─ SVG Path Layer

├─ Node Layer

├─ Stage Card Layer

└─ Interaction Overlay

CSS 방향

.trace-spine-canvas {

position: relative;

border: 1px solid var(--border-subtle);

border-radius: 24px;

background:

radial-gradient(circle at 20% 18%, rgba(37, 99, 235, 0.07), transparent
30%),

radial-gradient(circle at 78% 28%, rgba(14, 165, 233, 0.06), transparent
26%),

linear-gradient(180deg, \#ffffff 0%, \#f8fbff 100%);

box-shadow: 0 16px 42px rgba(15, 23, 42, 0.06);

overflow: hidden;

}

## 4.4 SpinePathLayer

5개 stage를 하나의 reasoning path로 묶는 SVG 레이어다. 이 레이어가
약하면 Spine은 다시 카드 묶음처럼 보인다.

function SpinePathLayer({ activeSegmentIds }: Props) {

return (

\<svg className="spine-path-layer" viewBox="0 0 1200 180"\>

\<path className="spine-path-base" d="M60 86 C180 86, 180 86, 300 86
C420 86, 420 86, 540 86 C660 86, 660 86, 780 86 C900 86, 900 86, 1140
86" /\>

\<path className="spine-path-active" d="M60 86 C180 86, 180 86, 300 86
C420 86, 420 86, 540 86 C660 86, 660 86, 780 86 C900 86, 900 86, 1140
86" /\>

\</svg\>

);

}

## 4.5 SpineStagePanels

각 stage card는 개별 카드처럼 보이되 부모 canvas의 일부처럼 보여야 한다.
border와 background를 너무 강하게 주면 분리감이 커진다.

.stage-panel {

position: relative;

z-index: 2;

border: 1px solid rgba(148, 163, 184, 0.26);

border-radius: 18px;

background: rgba(255, 255, 255, 0.84);

backdrop-filter: blur(8px);

box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);

transition: border-color 160ms ease, box-shadow 160ms ease, transform
160ms ease, opacity 160ms ease;

}

.stage-panel.is-highlighted {

border-color: rgba(37, 99, 235, 0.58);

box-shadow: 0 14px 30px rgba(37, 99, 235, 0.13);

transform: translateY(-2px);

}

.stage-panel.is-muted {

opacity: 0.46;

}

# 5. Spine 인터랙션 명세

## 5.1 상태 모델

type EvidenceType =

\| "timing"

\| "variation"

\| "event_spike"

\| "issue_family"

\| "baseline_absence"

\| "metric_deviation"

\| "log_correlation"

\| "support_ticket_pattern";

type SpineInteractionState = {

selectedTraceId: string \| null;

hoveredStageId: TraceStageId \| null;

hoveredEvidenceType: EvidenceType \| null;

focusedEvidenceId: string \| null;

};

## 5.2 Evidence → Stage highlight

Evidence에 hover하면 관련 stage와 path segment가 강조된다. 예를 들어
Metric deviation hover 시 Signal / Anomaly와 Evidence Strength가
강조되고, 해당 path segment가 더 선명해진다.

const evidenceStageMap: Record\<EvidenceType, TraceStageId\[\]\> = {

timing: \["product-change", "signal-anomaly"\],

variation: \["product-change", "signal-anomaly",
"linked-issue-cluster"\],

event_spike: \["signal-anomaly", "linked-issue-cluster",
"evidence-strength"\],

issue_family: \["linked-issue-cluster", "evidence-strength"\],

baseline_absence: \["signal-anomaly", "evidence-strength"\],

metric_deviation: \["signal-anomaly", "evidence-strength"\],

log_correlation: \["signal-anomaly", "evidence-strength"\],

support_ticket_pattern: \["linked-issue-cluster", "evidence-strength"\],

};

## 5.3 Stage → Evidence highlight

const stageEvidenceMap: Record\<TraceStageId, EvidenceType\[\]\> = {

"product-change": \["timing", "variation"\],

"signal-anomaly": \["timing", "variation", "event_spike",
"baseline_absence", "metric_deviation", "log_correlation"\],

"linked-issue-cluster": \["variation", "event_spike", "issue_family",
"support_ticket_pattern"\],

"evidence-strength": \["timing", "variation", "event_spike",
"issue_family", "baseline_absence", "metric_deviation",
"log_correlation", "support_ticket_pattern"\],

"recommended-follow-up": \[\],

};

## 5.4 Evidence Strength Rail interaction

Evidence Strength Rail은 단순 status bar가 아니라 “왜 이 trace를 믿어야
하는가”를 이해하게 만드는 trust layer다.

type EvidenceFactor = {

id: EvidenceType;

label: string;

strength: "strong" \| "medium" \| "weak";

relatedStages: TraceStageId\[\];

description: string;

};

| **Factor**             | **Strength** | **Hover 시 강조**                                            |
|------------------------|--------------|--------------------------------------------------------------|
| Timing match           | Strong       | Product Change, Signal / Anomaly, +9m label, 첫 path segment |
| Variation overlap      | Strong       | Product Change, Signal / Anomaly, Linked Issue Cluster       |
| Event spike alignment  | Strong       | Signal / Anomaly, Linked Issue Cluster                       |
| Issue family match     | Medium       | Linked Issue Cluster, Evidence Strength                      |
| Prior baseline absence | Medium       | Signal / Anomaly, Evidence Strength                          |

# 6. Investigation Workbench

오른쪽 패널은 plain detail drawer가 아니라 forensic inspector다. 선택된
issue에서 시작해 suspected trace와 related change를 역방향으로 읽게
만든다.

InvestigationWorkbench

├─ IssueSummary

├─ SuspectedTrace

├─ RelatedChange

├─ EvidenceObserved

├─ ImpactedService

└─ RecommendedFollowUp

type InvestigationWorkbenchData = {

issue: {

id: string;

title: string;

service: string;

status: "open" \| "investigating" \| "resolved" \| "ignored";

issueFamily: string;

affectedUsers: string;

firstSeenAt: string;

};

trace: {

id: string;

confidence: number;

evidenceCount: number;

anomalySummary: string;

};

relatedChange: {

id: string;

title: string;

deployedAt: string;

service: string;

changeType: "release" \| "flag" \| "rule";

reason: string;

};

followUps: FollowUpAction\[\];

};

# 7. Recommended Follow-up

MVP에서 이 액션들은 control surface가 아니다. 모든 액션은 follow-up,
handoff, investigation 성격이어야 한다.

| **허용 액션**            | **의미**               |
|--------------------------|------------------------|
| review_release_scope     | 변경 범위 확인         |
| review_evidence          | 근거 검토              |
| open_linked_issue        | 연결 이슈 열기         |
| create_incident_handoff  | incident handoff 생성  |
| notify_owner             | 담당자 알림            |
| view_related_failed_runs | 관련 실패 run 조회     |
| reprocess_failed_batch   | 실패 batch 재처리 요청 |
| retry_failed_run         | failed run retry 요청  |

**금지 액션:** Rollback release, Stop rollout, Reduce traffic, Kill
switch, Disable flag, Auto-resolve issue는 MVP 화면에 노출하지 않는다.

# 8. API 연결 기준

프론트는 OpenAPI v0.2의 조회/액션 계약을 기준으로 연결한다. Trace 본체,
evidence, 대표 issue anchor, retry/reprocess는 분리된 엔드포인트로
취급한다.

GET /api/v1/dashboard/overview

GET /api/v1/dashboard/timeline

GET /api/v1/traces

GET /api/v1/traces/{trace_id}

GET /api/v1/traces/{trace_id}/evidences

GET /api/v1/traces/{trace_id}/primary-issue

GET /api/v1/runs/overview

POST /api/v1/runs/{run_id}/retry

POST /api/v1/reprocess

**API 동작 기준:** retry와 reprocess는 기존 run을 되감지 않는다. 새 run
row를 생성하고 new_run_id 기준으로 상태를 확인하는 흐름으로 구현한다.

# 9. 화면 상태

| **상태**     | **UI 처리**                                                                                         |
|--------------|-----------------------------------------------------------------------------------------------------|
| Loading      | OperatorBriefing skeleton, muted path 상태의 TraceEvidenceSpine skeleton, Workbench skeleton        |
| Empty        | No suspected traces found. Try changing service scope or time range.                                |
| Partial data | Aurora trace는 있지만 ClickHouse anomaly marker가 늦는 경우 Signal data still syncing 표시          |
| Error        | Authoritative write failure, Recoverable analytics delay, Permission denied, Trace not found로 구분 |

**보안/PII:** 에러 메시지에 raw payload, issue body, reporter, title
같은 민감 가능 텍스트를 그대로 노출하지 않는다.

# 10. 구현 우선순위

1\. AppShell / Sidebar / TopBar

2\. Static OperatorBriefing

3\. Static TraceEvidenceSpine

4\. SpinePathLayer + NodeLayer

5\. EvidenceStrengthRail

6\. Hover interaction: evidence → stage

7\. Hover interaction: stage → evidence

8\. InvestigationWorkbench

9\. ContextModules

10\. API 연결

11\. Loading / empty / error states

12\. polish animation

# 11. 최종 구현 체크리스트

| **체크 항목**          | **완료 기준**                                                             |
|------------------------|---------------------------------------------------------------------------|
| Path unity             | stage들이 카드 묶음이 아니라 하나의 reasoning path처럼 보인다.            |
| Evidence hover         | 근거 hover 시 관련 stage와 path segment가 반응한다.                       |
| Stage hover            | stage hover 시 관련 evidence만 강조되고 나머지는 muted 처리된다.          |
| Evidence Strength Rail | “왜 믿을 수 있는가”를 설명하는 trust layer로 작동한다.                    |
| Action scope           | rollback/kill switch/traffic reduction 같은 destructive control이 없다.   |
| Right panel            | plain detail drawer가 아니라 reverse trace forensic inspector처럼 보인다. |
| Error safety           | 민감 가능 텍스트를 에러·로그·UI raw 노출하지 않는다.                      |

**핵심 수락 기준:** 이 세 가지가 살아나면 이미지보다 실제 제품이 더
좋아진다: path가 stage들을 묶는가, evidence hover가 stage/path를
반응시키는가, Evidence Strength Rail이 trust layer로 작동하는가.
