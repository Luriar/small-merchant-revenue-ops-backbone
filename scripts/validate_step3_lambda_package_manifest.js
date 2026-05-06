#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const packageScript = fs.readFileSync(path.join(repoRoot, "scripts", "package_step2d_revenue_api_lambda.sh"), "utf8");

const required = [
  "apps/api/src/revenue-ops/revenue-ops-saas-aurora-store.js",
  "apps/api/src/revenue-ops/revenue-ops-saas-store-factory.js",
  "apps/api/src/revenue-ops/revenue-upload-parsers.js",
  "apps/api/src/revenue-ops/runtime-boundaries.js",
  "apps/api/src/revenue-ops/context-collectors.js",
  "apps/api/src/revenue-ops/connectors/toss-place-client.js",
  "infra/db/revenue_ops_step3_4_lite.sql",
];

const missing = required.filter((item) => !packageScript.includes(item));
if (missing.length > 0) {
  process.stderr.write(`Lambda package script is missing required Step 3.5 files:\n${missing.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Lambda package manifest includes required Step 3.5 runtime files.\n");
