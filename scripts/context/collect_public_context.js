#!/usr/bin/env node
/**
 * STEP 4-lite public context collector skeleton.
 *
 * Runs safely without external API keys. When keys are absent, it reports a
 * skipped-live status and points operators to the deterministic STEP 3 seed.
 *
 * Future live hooks:
 * - KMA_SERVICE_KEY: KMA weather observations
 * - DATA_GO_KR_SERVICE_KEY: public-data portal sources
 * - SEOUL_OPEN_DATA_KEY: Seoul commercial district/living population/subway
 * - KAKAO_REST_API_KEY: geocoding
 * - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET: future search trend/local signals
 */
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const seedDir = path.join(repoRoot, "data", "seed", "step3");

const optionalKeys = [
  "KMA_SERVICE_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "SEOUL_OPEN_DATA_KEY",
  "KAKAO_REST_API_KEY",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
];

function main() {
  const available = optionalKeys.filter((key) => Boolean(process.env[key]));
  const missing = optionalKeys.filter((key) => !process.env[key]);
  const contextFile = path.join(seedDir, "seongsu_cafe_context_observations.csv");
  const seedContextRows = fs.existsSync(contextFile)
    ? fs.readFileSync(contextFile, "utf8").trim().split(/\r?\n/).length - 1
    : 0;

  const result = {
    collector_name: "collect_public_context",
    mode: available.length > 0 ? "live_hooks_available_but_not_called_by_default" : "seed_stub",
    status: "skipped",
    skipped_reason: "Live external API calls are intentionally disabled for tests/builds. Run live collectors only with reviewed keys and an explicit operator command.",
    available_env_keys: available,
    missing_env_keys: missing,
    seed_fallback: {
      context_file: path.relative(repoRoot, contextFile),
      context_rows: seedContextRows,
    },
    intended_sources: [
      "KMA weather",
      "Korean holidays",
      "Seoul commercial district benchmark",
      "Seoul living population / subway proxy",
      "Small Enterprise store/commercial information",
      "Kakao Local API for later geocoding",
    ],
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
