import { getPricingForModel, PRICING_VERSION, PRICING_METADATA } from "./server/config/llm_config.js";

async function runPricingTests() {
  console.log("==========================================");
  console.log("RUNNING GEMINI API PRICING VERIFICATION TESTS");
  console.log(`Pricing Version: ${PRICING_VERSION}`);
  console.log(`Verification Date: ${PRICING_METADATA.verificationDate}`);
  console.log(`Official Source: ${PRICING_METADATA.sourceUrl}`);
  console.log("==========================================\n");

  let testPassed = 0;
  let testFailed = 0;

  function assertEqual(actual: number, expected: number, message: string) {
    // Avoid floating point inaccuracies in comparison
    const tolerance = 0.000001;
    if (Math.abs(actual - expected) < tolerance) {
      console.log(`✅ [PASS] ${message}: calculated $${actual.toFixed(6)} (Expected: $${expected.toFixed(6)})`);
      testPassed++;
    } else {
      console.error(`❌ [FAIL] ${message}: calculated $${actual.toFixed(6)} (Expected: $${expected.toFixed(6)})`);
      testFailed++;
    }
  }

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      testPassed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      testFailed++;
    }
  }

  // Cost calculator helper mimicking production telemetry code
  function calculateCost(modelId: string, inputTokens: number, outputTokens: number, useBatch: boolean = false): number | null {
    const pricing = getPricingForModel(modelId);
    if (!pricing) return null;

    const inputRate = useBatch ? pricing.batchInputCostPer1M : pricing.inputCostPer1M;
    const outputRate = useBatch ? pricing.batchOutputCostPer1M : pricing.outputCostPer1M;

    if (inputRate === null || outputRate === null) return null;

    const inputCost = (inputTokens / 1000000) * inputRate;
    const outputCost = (outputTokens / 1000000) * outputRate;
    return inputCost + outputCost;
  }

  // Test 1: Verify model config lookups (exact match and models/ prefix)
  console.log("--- Test 1: Model pricing lookup normalization ---");
  const modelsToTest = ["gemini-3.5-flash", "models/gemini-3.5-flash", "gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
  for (const model of modelsToTest) {
    const pricing = getPricingForModel(model);
    assert(pricing !== null, `Pricing exists for ${model}`);
  }

  // Test 2: Standard Interactive cost calculations for gemini-3.5-flash
  console.log("\n--- Test 2: Standard Interactive Cost for gemini-3.5-flash ---");
  // Rates: input $1.50/1M, output $9.00/1M
  assertEqual(
    calculateCost("gemini-3.5-flash", 1000000, 1000000, false)!,
    1.50 + 9.00,
    "1M input and 1M output tokens standard"
  );
  assertEqual(
    calculateCost("gemini-3.5-flash", 500000, 100000, false)!,
    0.75 + 0.90,
    "500k input and 100k output tokens standard"
  );

  // Test 3: Batch cost calculations for gemini-3.5-flash
  console.log("\n--- Test 3: Batch API Cost for gemini-3.5-flash ---");
  // Rates: input $0.75/1M, output $4.50/1M
  assertEqual(
    calculateCost("gemini-3.5-flash", 1000000, 1000000, true)!,
    0.75 + 4.50,
    "1M input and 1M output tokens batch"
  );

  // Test 4: Standard Interactive cost calculations for gemini-3.1-flash-lite
  console.log("\n--- Test 4: Standard Interactive Cost for gemini-3.1-flash-lite ---");
  // Rates: input $0.25/1M, output $1.50/1M
  assertEqual(
    calculateCost("gemini-3.1-flash-lite", 2000000, 500000, false)!,
    0.50 + 0.75,
    "2M input and 500k output tokens standard"
  );

  // Test 5: Batch cost calculations for gemini-3.1-flash-lite
  console.log("\n--- Test 5: Batch API Cost for gemini-3.1-flash-lite ---");
  // Rates: input $0.125/1M, output $0.75/1M
  assertEqual(
    calculateCost("gemini-3.1-flash-lite", 2000000, 500000, true)!,
    0.25 + 0.375,
    "2M input and 500k output tokens batch"
  );

  // Test 6: Standard Interactive cost calculations for gemini-3.1-pro-preview
  console.log("\n--- Test 6: Standard Interactive Cost for gemini-3.1-pro-preview ---");
  // Rates: input $2.00/1M, output $12.00/1M
  assertEqual(
    calculateCost("gemini-3.1-pro-preview", 100000, 20000, false)!,
    0.20 + 0.24,
    "100k input and 20k output tokens standard"
  );

  console.log("\n==========================================");
  console.log(`PRICING VERIFICATION SUMMARY: Passed ${testPassed}, Failed ${testFailed}`);
  console.log("==========================================");

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPricingTests().catch((err) => {
  console.error("Pricing verification execution error:", err);
  process.exit(1);
});
