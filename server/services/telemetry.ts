import fs from "fs";
import path from "path";
import { getPricingForModel, PRICING_VERSION } from "../config/llm_config.js";

export interface TelemetryLog {
  timestamp: string;
  taskType: string;
  provider: string;
  exactModelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  retries: number;
  success: boolean;
  errorMessage?: string;
  compilationId?: string;
  questionId?: string;
  estimatedCost: {
    amount: number | null;
    status: "CALCULATED" | "UNKNOWN";
  };
}

export interface TelemetrySummary {
  pricingVersion: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number; // Sum of calculated costs
  hasUnknownCosts: boolean; // True if any calls have UNKNOWN cost status
  averageLatencyMs: number;
  taskBreakdown: Record<string, {
    calls: number;
    success: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    hasUnknownCosts: boolean;
    avgLatencyMs: number;
  }>;
  modelBreakdown: Record<string, {
    calls: number;
    success: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    hasUnknownCosts: boolean;
    avgLatencyMs: number;
  }>;
}

const LOG_FILE_PATH = path.join(process.cwd(), "telemetry_logs.json");

export class TelemetryService {
  private static logs: TelemetryLog[] = [];
  private static initialized = false;

  /**
   * Initializes the telemetry service by loading existing logs from disk.
   */
  static initialize(): void {
    if (this.initialized) return;
    try {
      if (fs.existsSync(LOG_FILE_PATH)) {
        const data = fs.readFileSync(LOG_FILE_PATH, "utf-8");
        this.logs = JSON.parse(data);
        console.log(`[Telemetry] Loaded ${this.logs.length} previous call logs from disk.`);
      }
    } catch (err) {
      console.error("[Telemetry] Failed to load logs from disk:", err);
      this.logs = [];
    }
    this.initialized = true;
  }

  /**
   * Records a new LLM call to telemetry.
   */
  static recordCall(params: {
    taskType: string;
    provider: string;
    exactModelId: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    retries: number;
    success: boolean;
    errorMessage?: string;
    compilationId?: string;
    questionId?: string;
  }): TelemetryLog {
    this.initialize();

    const pricing = getPricingForModel(params.exactModelId);
    let amount: number | null = null;
    let status: "CALCULATED" | "UNKNOWN" = "UNKNOWN";

    if (pricing && pricing.inputCostPer1M !== null && pricing.outputCostPer1M !== null) {
      const inputCost = (params.inputTokens / 1000000) * pricing.inputCostPer1M;
      const outputCost = (params.outputTokens / 1000000) * pricing.outputCostPer1M;
      amount = inputCost + outputCost;
      status = "CALCULATED";
    }

    const log: TelemetryLog = {
      timestamp: new Date().toISOString(),
      taskType: params.taskType,
      provider: params.provider,
      exactModelId: params.exactModelId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      latencyMs: params.latencyMs,
      retries: params.retries,
      success: params.success,
      errorMessage: params.errorMessage,
      compilationId: params.compilationId,
      questionId: params.questionId,
      estimatedCost: { amount, status },
    };

    this.logs.push(log);
    this.saveToDisk();
    return log;
  }

  /**
   * Saves logs to disk safely.
   */
  private static saveToDisk(): void {
    try {
      fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(this.logs, null, 2), "utf-8");
    } catch (err) {
      console.error("[Telemetry] Failed to save logs to disk:", err);
    }
  }

  /**
   * Returns all recorded logs, optionally filtered by compilation or question.
   */
  static getLogs(filter?: { compilationId?: string; questionId?: string }): TelemetryLog[] {
    this.initialize();
    let result = [...this.logs];

    if (filter?.compilationId) {
      result = result.filter(log => log.compilationId === filter.compilationId);
    }
    if (filter?.questionId) {
      result = result.filter(log => log.questionId === filter.questionId);
    }

    return result;
  }

  /**
   * Clears all telemetry logs from both memory and disk.
   */
  static clearLogs(): void {
    this.logs = [];
    this.saveToDisk();
    console.log("[Telemetry] Logs cleared successfully.");
  }

  /**
   * Computes an aggregated summary of the telemetry.
   */
  static getSummary(filter?: { compilationId?: string; questionId?: string }): TelemetrySummary {
    const logs = this.getLogs(filter);

    const summary: TelemetrySummary = {
      pricingVersion: PRICING_VERSION,
      totalCalls: logs.length,
      successfulCalls: 0,
      failedCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCost: 0,
      hasUnknownCosts: false,
      averageLatencyMs: 0,
      taskBreakdown: {},
      modelBreakdown: {},
    };

    if (logs.length === 0) {
      return summary;
    }

    let totalLatency = 0;

    for (const log of logs) {
      if (log.success) {
        summary.successfulCalls++;
      } else {
        summary.failedCalls++;
      }

      summary.totalInputTokens += log.inputTokens;
      summary.totalOutputTokens += log.outputTokens;
      totalLatency += log.latencyMs;

      // Handle estimated cost
      if (log.estimatedCost.status === "CALCULATED" && log.estimatedCost.amount !== null) {
        summary.totalEstimatedCost += log.estimatedCost.amount;
      } else {
        summary.hasUnknownCosts = true;
      }

      // 1. Task Breakdown
      if (!summary.taskBreakdown[log.taskType]) {
        summary.taskBreakdown[log.taskType] = {
          calls: 0,
          success: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
          hasUnknownCosts: false,
          avgLatencyMs: 0,
        };
      }
      const t = summary.taskBreakdown[log.taskType];
      t.calls++;
      if (log.success) t.success++;
      t.inputTokens += log.inputTokens;
      t.outputTokens += log.outputTokens;
      t.avgLatencyMs += log.latencyMs;
      if (log.estimatedCost.status === "CALCULATED" && log.estimatedCost.amount !== null) {
        t.estimatedCost += log.estimatedCost.amount;
      } else {
        t.hasUnknownCosts = true;
      }

      // 2. Model Breakdown
      if (!summary.modelBreakdown[log.exactModelId]) {
        summary.modelBreakdown[log.exactModelId] = {
          calls: 0,
          success: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
          hasUnknownCosts: false,
          avgLatencyMs: 0,
        };
      }
      const m = summary.modelBreakdown[log.exactModelId];
      m.calls++;
      if (log.success) m.success++;
      m.inputTokens += log.inputTokens;
      m.outputTokens += log.outputTokens;
      m.avgLatencyMs += log.latencyMs;
      if (log.estimatedCost.status === "CALCULATED" && log.estimatedCost.amount !== null) {
        m.estimatedCost += log.estimatedCost.amount;
      } else {
        m.hasUnknownCosts = true;
      }
    }

    summary.averageLatencyMs = Math.round(totalLatency / logs.length);

    // Finalize breakdowns with averages
    for (const key of Object.keys(summary.taskBreakdown)) {
      const t = summary.taskBreakdown[key];
      t.avgLatencyMs = Math.round(t.avgLatencyMs / t.calls);
      t.estimatedCost = parseFloat(t.estimatedCost.toFixed(6));
    }

    for (const key of Object.keys(summary.modelBreakdown)) {
      const m = summary.modelBreakdown[key];
      m.avgLatencyMs = Math.round(m.avgLatencyMs / m.calls);
      m.estimatedCost = parseFloat(m.estimatedCost.toFixed(6));
    }

    summary.totalEstimatedCost = parseFloat(summary.totalEstimatedCost.toFixed(6));

    return summary;
  }
}
