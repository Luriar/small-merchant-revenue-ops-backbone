class OutboxOnlyPublisher {
  constructor({ store }) {
    this.store = store;
  }

  async publish(event) {
    return this.store.createOutboxEvent(event);
  }
}

class OutboxToSqsPublisher {
  constructor({ store, sqsClient = null, queueUrl = null } = {}) {
    this.store = store;
    this.sqsClient = sqsClient;
    this.queueUrl = queueUrl;
  }

  async publish(event) {
    const outboxEvent = await this.store.createOutboxEvent(event);
    if (!this.sqsClient || !this.queueUrl) {
      return {
        ...outboxEvent,
        publish_backend: "outbox_only",
        publish_note: "SQS client or queue URL is not configured; event remains pending in outbox.",
      };
    }
    return {
      ...outboxEvent,
      publish_backend: "sqs_skeleton",
      publish_note: "SQS send is intentionally wired at the boundary, but not invoked in tests.",
    };
  }
}

class AuroraAnalyticsWriter {
  constructor({ store }) {
    this.store = store;
  }

  async writeDailyMart({ storeId, range } = {}) {
    return this.store.buildStoreRevenueDailyMart(storeId, range);
  }
}

class ClickHouseAnalyticsWriter {
  async writeDailyMart() {
    return {
      status: "skipped",
      backend: "clickhouse",
      reason: "ClickHouse analytics writer is a platform-scale skeleton and is disabled by default.",
    };
  }
}

class InlineOrchestrator {
  async startWorkflow(name, payload = {}) {
    return {
      workflow_name: name,
      status: "completed_inline",
      payload,
    };
  }
}

class StepFunctionsOrchestrator {
  constructor({ client = null, stateMachineArnByName = {} } = {}) {
    this.client = client;
    this.stateMachineArnByName = stateMachineArnByName;
  }

  async startWorkflow(name, payload = {}) {
    const stateMachineArn = this.stateMachineArnByName[name];
    if (!this.client || !stateMachineArn) {
      return {
        workflow_name: name,
        status: "skipped",
        reason: "Step Functions client or state machine ARN is not configured.",
        payload,
      };
    }
    return {
      workflow_name: name,
      status: "stepfunctions_skeleton",
      state_machine_arn: stateMachineArn,
      payload,
    };
  }
}

function createRuntimeBoundaries({ env = process.env, store } = {}) {
  return {
    eventPublisher: env.EVENT_BACKEND === "sqs"
      ? new OutboxToSqsPublisher({ store, queueUrl: env.UPLOAD_PARSE_QUEUE_URL })
      : new OutboxOnlyPublisher({ store }),
    analyticsWriter: env.ANALYTICS_BACKEND === "clickhouse"
      ? new ClickHouseAnalyticsWriter()
      : new AuroraAnalyticsWriter({ store }),
    orchestrator: env.ORCHESTRATION_BACKEND === "stepfunctions"
      ? new StepFunctionsOrchestrator()
      : new InlineOrchestrator(),
  };
}

module.exports = {
  OutboxOnlyPublisher,
  OutboxToSqsPublisher,
  AuroraAnalyticsWriter,
  ClickHouseAnalyticsWriter,
  InlineOrchestrator,
  StepFunctionsOrchestrator,
  createRuntimeBoundaries,
};
