const test = require("node:test");
const assert = require("node:assert/strict");

const exportData = require("./revenue-ops/data/revenue_ops_export.json");
const { handler } = require("./lambda-handler");

const KNOWN_ACTION_ID = exportData.actions[0].action_id;

test("Lambda adapter returns Revenue Ops brief list", async () => {
  const response = await handler(createHttpApiEvent({
    method: "GET",
    rawPath: "/api/v1/revenue/briefs",
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  const body = JSON.parse(response.body);
  assert.equal(Array.isArray(body.briefs), true);
  assert.ok(body.briefs.length >= 1);
  assertNoUnsafeContent(body);
});

test("Lambda adapter accepts Revenue Ops action status PATCH", async () => {
  const response = await handler(createHttpApiEvent({
    method: "PATCH",
    rawPath: `/api/v1/revenue/actions/${KNOWN_ACTION_ID}/status`,
    body: { status: "planned" },
  }));

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.action.action_id, KNOWN_ACTION_ID);
  assert.equal(body.action.status, "planned");
  assertNoUnsafeContent(body);
});

test("Lambda adapter returns CORS preflight for Revenue Ops routes", async () => {
  const response = await handler(createHttpApiEvent({
    method: "OPTIONS",
    rawPath: `/api/v1/revenue/actions/${KNOWN_ACTION_ID}/status`,
  }));

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.equal(response.headers["access-control-allow-methods"], "GET,POST,PATCH,DELETE,OPTIONS");
  assert.equal(response.headers["access-control-allow-headers"], "authorization,content-type");
});

function createHttpApiEvent({ method, rawPath, body }) {
  return {
    version: "2.0",
    rawPath,
    rawQueryString: "",
    headers: body ? { "content-type": "application/json" } : {},
    requestContext: {
      http: {
        method,
        path: rawPath,
      },
    },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

function assertNoUnsafeContent(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("/home/"), false, "response leaked an absolute home path");
  assert.equal(text.includes("small-merchant-revenue-ops-backbone"), false, "response leaked repo path");
  assert.equal(text.includes("Error:"), false, "response leaked raw Error text");
  assert.equal(text.includes("stack"), false, "response leaked stack marker");
  assert.equal(text.includes("connection_string"), false, "response leaked connection marker");
}
