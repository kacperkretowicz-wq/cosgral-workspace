import { expect, it } from "vitest";
import { containsInstructionCredential, redactSensitiveText } from "../redaction.js";

it("rejects credential assignments with and without a quoted key", () => {
  for (const text of ["authorization: value", "authorization  = value", "authorization  \"  : value", "password' = value", "api_key\n: value"]) {
    expect(containsInstructionCredential(text)).toBe(true);
  }
  for (const text of ["authorization is required", "authorization   !", "a discussion about password handling"]) {
    expect(containsInstructionCredential(text)).toBe(false);
  }
});

it("keeps repeated maximum-length instruction checks responsive", () => {
  const text = `authorization${" ".repeat(7985)}!`;
  const started = performance.now();
  for (let i = 0; i < 40; i++) expect(containsInstructionCredential(text)).toBe(false);
  // A generous bound accommodates slow CI while catching quadratic whitespace
  // backtracking, which accumulates across concurrent instruction updates.
  expect(performance.now() - started).toBeLessThan(3000);
}, 10000);

it("redacts quoted authorization credentials while handling repeated malformed labels promptly", () => {
  for (const text of ['Authorization "Bearer synthetic-value"', 'Authorization \\"Basic synthetic-value\\"']) {
    expect(redactSensitiveText(text)).not.toContain("synthetic-value");
  }
  // Even a malformed, unterminated value must retain the existing fail-closed behavior.
  expect(redactSensitiveText('Authorization \\"Beareraa')).not.toContain("Beareraa");
  expect(redactSensitiveText('Authorization "Bearerx')).not.toContain("Bearerx");
  const text = ('Authorization "abc Authorization "Bearerfoo ').repeat(2500);
  const started = performance.now();
  expect(redactSensitiveText(text)).toBe(text);
  expect(performance.now() - started).toBeLessThan(3000);
}, 10000);
