import { describe, expect, it } from "vitest";
import { codexModelReferenceCost, priceCodexReceipt } from "./codex-pricing.js";

describe("executor model reference costs", () => {
  it("uses the receipt rate card for a declared standard uncached input/output basket", () => {
    expect(codexModelReferenceCost("gpt-6-luna")).toEqual({ usdPerReferenceBasket: 0.6, version: "openai-standard-2026-09-30" });
    expect(codexModelReferenceCost("gpt-6-astra")?.usdPerReferenceBasket).toBe(60);
    const receipt = priceCodexReceipt({ provider: "openai", biller: "openai", billingType: "api", complete: true,
      usageBasis: "per_run", model: "gpt-6-luna", costUsd: null, usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } });
    expect(receipt.costUsdExact).toBe("0.600000000");
  });
  it.each([null, "unknown", "toString", "__proto__", "gpt-6-luna-custom"])("does not infer a price for %s", model => {
    expect(codexModelReferenceCost(model)).toBeNull();
  });
});
