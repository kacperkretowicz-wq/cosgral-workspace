#!/usr/bin/env node
/**
 * COSGRAL Workspace: Central E2E Test Suite Runner
 *
 * Executes Tiers 1-4 opaque-box end-to-end tests:
 * - Tier 1: Feature Coverage (46 features × 5 tests = 230 tests)
 * - Tier 2: Boundary & Corner Cases (46 features × 5 tests = 230 tests)
 * - Tier 3: Cross-Feature Interactions (46 pairwise tests = 46 tests)
 * - Tier 4: Real-World Scenarios (5 multi-agent workflows = 5 tests)
 *
 * Total expected: >= 511 tests.
 */

import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUITE_DIR = __dirname;
const REPO_ROOT = resolve(__dirname, '../../');

const TIERS = [
  {
    tier: 'Tier 1',
    name: 'Feature Coverage (46 Features × 5 Tests)',
    file: join(SUITE_DIR, 'tier1-feature-coverage.test.mjs'),
    expectedMin: 230,
  },
  {
    tier: 'Tier 2',
    name: 'Boundary & Corner Cases (46 Features × 5 Tests)',
    file: join(SUITE_DIR, 'tier2-boundary-corner.test.mjs'),
    expectedMin: 230,
  },
  {
    tier: 'Tier 3',
    name: 'Cross-Feature Combinations (46 Pairwise Tests)',
    file: join(SUITE_DIR, 'tier3-cross-feature.test.mjs'),
    expectedMin: 46,
  },
  {
    tier: 'Tier 4',
    name: 'Real-World Scenarios (5 Multi-Agent Workflows)',
    file: join(SUITE_DIR, 'tier4-scenarios.test.mjs'),
    expectedMin: 5,
  },
];

console.log('================================================================================');
console.log('            COSGRAL Workspace: Opaque-Box E2E Test Suite Runner                ');
console.log('================================================================================');
console.log(`Node Runtime : ${process.version}`);
console.log(`Platform     : ${process.platform} (${process.arch})`);
console.log(`Suite Dir    : ${SUITE_DIR}`);
console.log(`Target Tiers : 4 (Minimum 511 test cases)`);
console.log('--------------------------------------------------------------------------------\n');

const suiteStartTime = Date.now();
const results = [];
let overallPass = true;
let totalTests = 0;
let totalPass = 0;
let totalFail = 0;
let totalSkipped = 0;

for (const entry of TIERS) {
  process.stdout.write(`[RUNNING] ${entry.tier}: ${entry.name}... `);
  const tierStart = Date.now();

  const child = spawnSync(process.execPath, ['--test', entry.file], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const tierDuration = Date.now() - tierStart;
  const stdout = child.stdout || '';
  const stderr = child.stderr || '';
  const exitCode = child.status ?? 1;

  // Parse TAP summary lines
  // e.g. # tests 230 \n # pass 230 \n # fail 0 \n # skipped 0
  const testsMatch = stdout.match(/# tests (\d+)/);
  const passMatch = stdout.match(/# pass (\d+)/);
  const failMatch = stdout.match(/# fail (\d+)/);
  const skippedMatch = stdout.match(/# skipped (\d+)/);

  const testsCount = testsMatch ? parseInt(testsMatch[1], 10) : 0;
  const passCount = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skippedCount = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;

  totalTests += testsCount;
  totalPass += passCount;
  totalFail += failCount;
  totalSkipped += skippedCount;

  const success = exitCode === 0 && failCount === 0 && testsCount >= entry.expectedMin;
  if (!success) overallPass = false;

  results.push({
    tier: entry.tier,
    name: entry.name,
    file: entry.file,
    tests: testsCount,
    pass: passCount,
    fail: failCount,
    skipped: skippedCount,
    durationMs: tierDuration,
    success,
    exitCode,
    error: !success ? stderr || stdout.slice(-1000) : null,
  });

  if (success) {
    console.log(`PASSED (${passCount}/${testsCount} in ${tierDuration}ms)`);
  } else {
    console.log(`FAILED (Pass: ${passCount}, Fail: ${failCount}, Exit: ${exitCode})`);
  }
}

const totalDurationMs = Date.now() - suiteStartTime;

console.log('\n================================================================================');
console.log('                          TEST SUITE EXECUTION SUMMARY                          ');
console.log('================================================================================');
console.log('| Tier   | Scope / Description                       | Total | Pass | Fail | Time  |');
console.log('|--------|-------------------------------------------|------:|-----:|-----:|------:|');

for (const r of results) {
  const tStr = r.tier.padEnd(6);
  const nStr = r.name.padEnd(41).slice(0, 41);
  const totStr = String(r.tests).padStart(5);
  const passStr = String(r.pass).padStart(4);
  const failStr = String(r.fail).padStart(4);
  const durStr = `${(r.durationMs / 1000).toFixed(2)}s`.padStart(5);
  console.log(`| ${tStr} | ${nStr} | ${totStr} | ${passStr} | ${failStr} | ${durStr} |`);
}

console.log('|--------|-------------------------------------------|------:|-----:|-----:|------:|');
console.log(
  `| TOTAL  | All 4 Tiers (Target >= 511)               | ${String(totalTests).padStart(5)} | ${String(totalPass).padStart(4)} | ${String(totalFail).padStart(4)} | ${`${(totalDurationMs / 1000).toFixed(2)}s`.padStart(5)} |`
);
console.log('================================================================================');

// Output structured JSON report
const jsonReport = {
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  summary: {
    totalTests,
    totalPass,
    totalFail,
    totalSkipped,
    totalDurationMs,
    success: overallPass,
  },
  tiers: results,
};

const reportPath = join(SUITE_DIR, 'test-results.json');
writeFileSync(reportPath, JSON.stringify(jsonReport, null, 2), 'utf8');
console.log(`JSON Report generated at: ${reportPath}`);

if (!overallPass) {
  console.error('\nE2E Test Suite FAILED.');
  process.exit(1);
} else {
  console.log('\nE2E Test Suite PASSED 100% CLEANLY (Exit Code: 0).');
  process.exit(0);
}
