import dotenv from "dotenv";

dotenv.config();

export type LLMTaskType =
  | "QUERY_PLANNING"
  | "EVIDENCE_JUDGING"
  | "ANSWER_GENERATION"
  | "FACT_EXTRACTION"
  | "LEAF_COMPILATION"
  | "PARENT_COMPILATION"
  | "HIERARCHICAL_ROUTING"
  | "EVALUATION";

// Default model assignments
const DEFAULT_MODELS: Record<LLMTaskType, string> = {
  QUERY_PLANNING: "gemini-3.5-flash",
  EVIDENCE_JUDGING: "gemini-3.5-flash",
  ANSWER_GENERATION: "gemini-3.5-flash",
  FACT_EXTRACTION: "gemini-3.5-flash",
  LEAF_COMPILATION: "gemini-3.1-flash-lite",
  PARENT_COMPILATION: "gemini-3.1-flash-lite",
  HIERARCHICAL_ROUTING: "gemini-3.1-flash-lite",
  EVALUATION: "gemini-3.1-flash-lite",
};

/**
 * Configuration-driven model routing.
 * Resolves model IDs from process.env with fallback to validated active models.
 */
export function getModelForTask(taskType: LLMTaskType): string {
  const envVarName = `MODEL_${taskType}`;
  const envModel = process.env[envVarName];
  if (envModel && envModel.trim().length > 0) {
    return envModel.trim();
  }
  return DEFAULT_MODELS[taskType];
}

export interface ModelPricing {
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
  batchInputCostPer1M: number | null;
  batchOutputCostPer1M: number | null;
}

export const PRICING_VERSION = "2026.07.11-v2";

export interface PricingMetadata {
  sourceUrl: string;
  verificationDate: string;
  notes: string;
}

export const PRICING_METADATA: PricingMetadata = {
  sourceUrl: "https://openrouter.ai/models",
  verificationDate: "2026-07-11",
  notes: "Verified standard and batch pricing for Gemini 3.5 Flash, Gemini 3.1 Flash-Lite, and Gemini 3.1 Pro Preview. Distinguishes standard interactive API pricing from 50% discount Batch API pricing. Batch pricing is not yet applied to live calls as Batch API is not implemented."
};

/**
 * Standard model pricing per 1 Million tokens.
 * Values are based on standard production pricing where available.
 * If unknown, we set values to null to status-report UNKNOWN instead of inventing cost.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // gemini-3.5-flash pricing per 1M tokens
  "gemini-3.5-flash": {
    inputCostPer1M: 1.50,
    outputCostPer1M: 9.00,
    batchInputCostPer1M: 0.75,
    batchOutputCostPer1M: 4.50,
  },
  "models/gemini-3.5-flash": {
    inputCostPer1M: 1.50,
    outputCostPer1M: 9.00,
    batchInputCostPer1M: 0.75,
    batchOutputCostPer1M: 4.50,
  },
  
  // gemini-3.1-flash-lite pricing per 1M tokens
  "gemini-3.1-flash-lite": {
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.50,
    batchInputCostPer1M: 0.125,
    batchOutputCostPer1M: 0.75,
  },
  "models/gemini-3.1-flash-lite": {
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.50,
    batchInputCostPer1M: 0.125,
    batchOutputCostPer1M: 0.75,
  },

  // Fallbacks if prefixes or variations are used
  "gemini-3.1-pro-preview": {
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00,
    batchInputCostPer1M: 1.00,
    batchOutputCostPer1M: 6.00,
  },
  "models/gemini-3.1-pro-preview": {
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00,
    batchInputCostPer1M: 1.00,
    batchOutputCostPer1M: 6.00,
  },
};

/**
 * Gets pricing for a model ID.
 * Returns null if the model is not priced or unknown.
 */
export function getPricingForModel(modelId: string): ModelPricing | null {
  const normalizedId = modelId.toLowerCase();
  
  // Try exact match or match on normalized keys
  for (const [key, value] of Object.entries(MODEL_PRICING)) {
    if (key.toLowerCase() === normalizedId) {
      return value;
    }
  }

  // Check if it's a known model with an unknown price (e.g. preview or experimental agent)
  return null;
}
