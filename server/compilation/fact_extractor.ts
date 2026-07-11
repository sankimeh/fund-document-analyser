import { EvidenceUnit, StructuredFact } from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";

export class FactExtractor {
  /**
   * Scans Evidence Units to extract key financial parameters with full audit-trail provenance.
   */
  static async extractStructuredFacts(
    evidenceUnits: EvidenceUnit[],
    fundId: string,
    compilationId?: string
  ): Promise<StructuredFact[]> {
    console.log(`Extracting Structured Facts for Fund: ${fundId}...`);

    // Only send relevant sections to save tokens and focus LLM attention
    const relevantUnits = evidenceUnits.filter((u) => {
      const text = u.text.toLowerCase();
      return (
        text.includes("fee") ||
        text.includes("redemption") ||
        text.includes("notice") ||
        text.includes("minimum") ||
        text.includes("invest") ||
        text.includes("dealing") ||
        text.includes("frequency") ||
        text.includes("leverage") ||
        text.includes("exposure") ||
        text.includes("nav") ||
        text.includes("lock-in") ||
        text.includes("benchmark") ||
        text.includes("currency") ||
        text.includes("inception") ||
        u.type === "table"
      );
    });

    const compactUnits = relevantUnits.map((u) => ({
      evidence_id: u.evidence_id,
      section: u.section,
      subsection: u.subsection,
      text: u.text,
    }));

    const prompt = `
You are a highly precise financial database parser.
Analyze these Evidence Units from a fund prospectus. Your goal is to extract key structured financial facts with absolute precision.

For each fact you extract, you MUST:
1. Classify it as one of the following exact types:
   - "redemption_notice_period" (e.g., 30 calendar days)
   - "management_fee" (e.g., 1.5%)
   - "performance_fee" (e.g., 20%)
   - "minimum_investment" (e.g., 100,000 USD)
   - "dealing_frequency" (e.g., Monthly)
   - "benchmark" (e.g., S&P 500 Index)
   - "fund_currency" (e.g., USD, EUR)
   - "inception_date" (e.g., 2018-05-12)
   - "leverage_limits" (e.g., 200% of NAV)
   - "exposure_limits" (e.g., 20% in single stock)
   - "nav_frequency" (e.g., Daily)
   - "lock_in_period" (e.g., 12 months)
2. Extract the literal value (can be a string or number).
3. Specify the unit (e.g., "calendar_days", "percent", "USD", "months", "daily", "monthly").
4. Provide the exact list of evidence_ids where this fact was explicitly stated. EVERY FACT MUST BE BACKED BY EVIDENCE IDs.
5. Provide a short explanation of the fact from the text.

Do NOT make up any facts. If the document is silent or ambiguous on any of these parameters, do not output that fact type.

Relevant Evidence Units:
${JSON.stringify(compactUnits.slice(0, 80), null, 2)}
`;

    const schema = {
      type: Type.ARRAY,
      description: "List of extracted structured facts",
      items: {
        type: Type.OBJECT,
        properties: {
          fact_type: {
            type: Type.STRING,
            description: "Must be one of the specified fact type strings.",
          },
          value: {
            type: Type.STRING,
            description: "Literal value as text, e.g. '30' or '1.5' or 'S&P 500'",
          },
          unit: {
            type: Type.STRING,
            description: "Metric unit, e.g. 'percent', 'calendar_days', 'USD'",
          },
          evidence_ids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of evidence_ids proving this fact.",
          },
          explanation: {
            type: Type.STRING,
            description: "Short sentence confirming the exact source statement.",
          },
        },
        required: ["fact_type", "value", "unit", "evidence_ids", "explanation"],
      },
    };

    try {
      const results = await LLMProvider.generateStructured<any[]>(
        prompt,
        schema,
        "You are an expert financial parameters extractor returning strict validated JSON structures.",
        {
          taskType: "FACT_EXTRACTION",
          compilationId,
        }
      );

      return results.map((item, index) => ({
        fact_id: `FACT_${fundId}_${index + 1}`,
        fact_type: item.fact_type as StructuredFact["fact_type"],
        value: item.value,
        unit: item.unit,
        fund_id: fundId,
        evidence_ids: item.evidence_ids || [],
        explanation: item.explanation,
      }));
    } catch (error) {
      console.error("Failed to extract structured facts via LLM, returning empty array:", error);
      return [];
    }
  }
}
