import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { getModelForTask, LLMTaskType } from "../config/llm_config.js";
import { TelemetryService } from "../services/telemetry.js";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";

export const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

class ProcessRateLimiter {
  private maxRequests: number;
  private windowSizeMs = 60000;
  private requestTimestamps: number[] = [];
  private queue: (() => void)[] = [];
  private isProcessing = false;
  private timeoutId: any = null;

  constructor() {
    const maxReqStr = process.env.GEMINI_MAX_REQUESTS_PER_MINUTE;
    const parsed = maxReqStr ? parseInt(maxReqStr, 10) : 12;
    this.maxRequests = isNaN(parsed) || parsed <= 0 ? 12 : parsed;
  }

  public async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleProcess();
    });
  }

  private scheduleProcess() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    Promise.resolve().then(() => {
      this.processQueue();
    });
  }

  private processQueue() {
    this.isProcessing = false;
    if (this.queue.length === 0) return;

    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => now - ts < this.windowSizeMs
    );

    while (this.queue.length > 0) {
      const availableSlots = this.maxRequests - this.requestTimestamps.length;
      if (availableSlots <= 0) {
        break;
      }

      const nextResolve = this.queue.shift();
      if (nextResolve) {
        this.requestTimestamps.push(Date.now());
        nextResolve();
      }
    }

    if (this.queue.length > 0) {
      const oldestTimestamp = this.requestTimestamps[0] || now;
      const waitTime = oldestTimestamp + this.windowSizeMs - Date.now();
      
      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        this.scheduleProcess();
      }, Math.max(0, waitTime));
    }
  }
}

export class LLMProvider {
  private static rateLimiter = new ProcessRateLimiter();

  /**
   * Helper to execute an API call with automatic retries on 429 Resource Exhausted.
   * Returns both the result and the number of retries encountered.
   */
  private static async executeWithRetry<R>(
    fn: () => Promise<R>,
    maxRetries = 3
  ): Promise<{ result: R; retries: number }> {
    let attempt = 0;
    while (true) {
      try {
        await this.rateLimiter.acquire();
        const result = await fn();
        return { result, retries: attempt };
      } catch (error: any) {
        attempt++;
        const errorMessage = error?.message || String(error);
        const errorStatus = error?.status || error?.code || 0;
        
        const is429 = errorStatus === 429 || 
                      errorMessage.includes("429") || 
                      errorMessage.toLowerCase().includes("resource_exhausted") ||
                      errorMessage.toLowerCase().includes("quota exceeded");
                      
        if (is429 && attempt <= maxRetries) {
          let delayMs = 1000 * Math.pow(2, attempt) + Math.random() * 500;
          
          if (error?.details && Array.isArray(error.details)) {
            for (const detail of error.details) {
              if (detail?.retryDelay) {
                const parsedSec = parseFloat(detail.retryDelay);
                if (!isNaN(parsedSec)) {
                  delayMs = parsedSec * 1000 + 500; // 500ms safety buffer
                  break;
                }
              }
            }
          }
          
          console.warn(`[Gemini Provider 429] RESOURCE_EXHAUSTED. Retrying attempt ${attempt}/${maxRetries} after ${Math.ceil(delayMs)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Generates text response using Gemini with task-based routing and telemetry tracking.
   */
  static async generate(
    prompt: string,
    systemInstruction?: string,
    context?: {
      taskType: LLMTaskType;
      compilationId?: string;
      questionId?: string;
    }
  ): Promise<string> {
    const taskType = context?.taskType || "ANSWER_GENERATION";
    const model = getModelForTask(taskType);
    
    if (!apiKey) {
      const errMsg = "GEMINI_API_KEY is not defined.";
      console.warn(errMsg);
      TelemetryService.recordCall({
        taskType,
        provider: "gemini",
        exactModelId: model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        retries: 0,
        success: false,
        errorMessage: errMsg,
        compilationId: context?.compilationId,
        questionId: context?.questionId,
      });
      return "Error: GEMINI_API_KEY is missing. Please set your API key in the secrets panel.";
    }

    const startTime = Date.now();
    let retriesCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let success = false;
    let errorMessage: string | undefined;

    try {
      const { result, retries } = await this.executeWithRetry(() =>
        ai.models.generateContent({
          model: model,
          contents: prompt,
          config: systemInstruction
            ? {
                systemInstruction,
                temperature: 0.1,
              }
            : {
                temperature: 0.1,
              },
        })
      );

      retriesCount = retries;
      inputTokens = result.usageMetadata?.promptTokenCount || 0;
      outputTokens = result.usageMetadata?.candidatesTokenCount || 0;
      success = true;

      return result.text || "";
    } catch (error: any) {
      success = false;
      errorMessage = error?.message || String(error);
      console.error(`Gemini API generation failed for task ${taskType} after retries:`, error);
      throw error;
    } finally {
      const latencyMs = Date.now() - startTime;
      TelemetryService.recordCall({
        taskType,
        provider: "gemini",
        exactModelId: model,
        inputTokens,
        outputTokens,
        latencyMs,
        retries: retriesCount,
        success,
        errorMessage,
        compilationId: context?.compilationId,
        questionId: context?.questionId,
      });
    }
  }

  /**
   * Generates structured JSON response conforming to a specific schema with task-based routing and telemetry tracking.
   */
  static async generateStructured<T>(
    prompt: string,
    schema: any, // Gemini schema structure
    systemInstruction?: string,
    context?: {
      taskType: LLMTaskType;
      compilationId?: string;
      questionId?: string;
    }
  ): Promise<T> {
    const taskType = context?.taskType || "ANSWER_GENERATION";
    const model = getModelForTask(taskType);

    if (!apiKey) {
      const errMsg = "GEMINI_API_KEY is missing.";
      TelemetryService.recordCall({
        taskType,
        provider: "gemini",
        exactModelId: model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        retries: 0,
        success: false,
        errorMessage: errMsg,
        compilationId: context?.compilationId,
        questionId: context?.questionId,
      });
      throw new Error("GEMINI_API_KEY is missing. Please set your API key.");
    }

    const startTime = Date.now();
    let retriesCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let success = false;
    let errorMessage: string | undefined;

    try {
      const { result, retries } = await this.executeWithRetry(() =>
        ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        })
      );

      retriesCount = retries;
      inputTokens = result.usageMetadata?.promptTokenCount || 0;
      outputTokens = result.usageMetadata?.candidatesTokenCount || 0;
      success = true;

      const jsonText = result.text || "{}";
      return JSON.parse(jsonText.trim()) as T;
    } catch (error: any) {
      success = false;
      errorMessage = error?.message || String(error);
      console.error(`Gemini API structured generation failed for task ${taskType} after retries:`, error);
      throw error;
    } finally {
      const latencyMs = Date.now() - startTime;
      TelemetryService.recordCall({
        taskType,
        provider: "gemini",
        exactModelId: model,
        inputTokens,
        outputTokens,
        latencyMs,
        retries: retriesCount,
        success,
        errorMessage,
        compilationId: context?.compilationId,
        questionId: context?.questionId,
      });
    }
  }
}
