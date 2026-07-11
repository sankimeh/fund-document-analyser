import { QueryPlan } from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";

export class QueryPlanner {
  /**
   * Concurrently plans a multi-route query retrieval strategy based on natural language questions.
   */
  static async planQuery(question: string, questionId?: string): Promise<QueryPlan> {
    console.log(`Planning query for: "${question}"`);

    const prompt = `
You are a senior investment operations research assistant. Your task is to analyze the advisor's question and generate a structured multi-route "Retrieval Plan".

CRITICAL DISTINCTION IN FINANCIAL LIQUIDITY:
You MUST carefully distinguish between different financial concepts, even if they share words like "liquidity" or "cash":
1. "Investor Liquidity" (Investor Redemption Timeline, withdrawal limits, notice periods, dealing days, gate provisions, lockups, how fast clients get cash).
2. "Portfolio Liquidity" (How the manager buys/sells portfolio assets, liquid asset requirements, stress-testing, cash-holdings, buffer assets).
3. "Market Liquidity Risk" (Market conditions, systemic trading volume freeze, bid-ask spreads, asset valuation challenges).

Analyze the question: "${question}"

Generate a retrieval plan identifying:
- The primary intent
- The specific target information
- Relevant financial concepts (e.g. "redemption timeline", "dealing frequency", "portfolio assets")
- Specific keywords and search phrases for lexical indexes
- Possible fact types in our system: "redemption_notice_period", "management_fee", "performance_fee", "minimum_investment", "dealing_frequency", "benchmark", "fund_currency", "inception_date", "leverage_limits", "exposure_limits", "nav_frequency", "lock_in_period"
`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        intent: {
          type: Type.STRING,
          description: "Primary intent category, e.g., investor_redemption, portfolio_fees, investment_leverage",
        },
        target: {
          type: Type.STRING,
          description: "Target metric or question focus, e.g., redemption_notice_period, management_fee_rate",
        },
        concepts: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Detailed financial or legal concepts to look up.",
        },
        search_terms: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Key terminology and phrases for inverted search.",
        },
        possible_fact_types: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Expected matching structured fact types.",
        },
      },
      required: ["intent", "target", "concepts", "search_terms", "possible_fact_types"],
    };

    try {
      const plan = await LLMProvider.generateStructured<QueryPlan>(
        prompt,
        schema,
        "You are a financial query analyzer. Do not confuse portfolio-level assets with client-level redemptions.",
        {
          taskType: "QUERY_PLANNING",
          questionId,
        }
      );

      return plan;
    } catch (error) {
      console.error("Query planning failed, using fallback plan:", error);
      return this.fallbackPlan(question);
    }
  }

  private static fallbackPlan(question: string): QueryPlan {
    const tokens = question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
    return {
      intent: "general_query",
      target: "unspecified",
      concepts: ["general_fund_terms"],
      search_terms: tokens.slice(0, 5),
      possible_fact_types: [
        "redemption_notice_period",
        "management_fee",
        "performance_fee",
        "dealing_frequency",
      ],
    };
  }
}
