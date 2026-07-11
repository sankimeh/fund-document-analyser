import { EvidenceUnit, GroundedAnswer, StructuredFact } from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";
import { getModelForTask } from "../config/llm_config.js";

export class AnswerGenerator {
  /**
   * Generates a precise, grounded answer utilizing only vetted relevant evidence and structured facts.
   */
  static async generateAnswer(
    question: string,
    vettedEvidence: EvidenceUnit[],
    matchedFacts: StructuredFact[],
    questionId?: string
  ): Promise<GroundedAnswer> {
    console.log(`Generating grounded answer using ${vettedEvidence.length} vetted units...`);

    if (vettedEvidence.length === 0) {
      return {
        answer: "The provided fund documents do not contain sufficient evidence to answer this conclusively.",
        sufficiency: "INSUFFICIENT",
        citations: [],
      };
    }

    const factsStr = matchedFacts
      .map((f) => `- ${f.fact_type}: ${f.value} ${f.unit} (Evidence: ${f.evidence_ids.join(", ")})`)
      .join("\n");

    const evidenceStr = vettedEvidence
      .map(
        (e) =>
          `[ID: ${e.evidence_id}] Page ${e.page} (Section: ${e.section}, Subsection: ${e.subsection}):\n"${e.text}"`
      )
      .join("\n\n");

    const prompt = `
You are a highly precise, compliant financial advisor assistant. Your goal is to write a comprehensive, advisor-ready answer to the query based SOLELY on the vetted Evidence Units and Structured Facts provided below.

Advisor's Question: "${question}"

Vetted Evidence Units:
${evidenceStr}

Vetted Structured Facts:
${factsStr || "None"}

CRITICAL COMPLIANCE RULES:
1. Synthesize a professional, structured, clear answer using ONLY the vetted facts and text.
2. Every claim or statistic you write MUST be immediately followed by an inline citation to its evidence ID, page, and section. For example: "The fund requires at least 30 calendar days' notice before the applicable dealing date [Page 71, E_DOC_001_15]".
3. Do NOT invent, extrapolate, or inject external general financial knowledge. Stick 100% to what is written.
4. If the provided evidence is incomplete or doesn't mention the specifics, explicitly output: "The provided fund documents do not contain sufficient evidence to answer this conclusively."
5. Output your result strictly as a structured JSON conforming to the schema.
`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        answer: {
          type: Type.STRING,
          description: "Markdown formatted, advisor-ready detailed response with inline citations.",
        },
        sufficiency: {
          type: Type.STRING,
          description: "Must be 'SUFFICIENT' or 'INSUFFICIENT'.",
        },
        citations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              evidence_id: { type: Type.STRING },
              page: { type: Type.INTEGER },
              section: { type: Type.STRING },
              fund_id: { type: Type.STRING },
              text: { type: Type.STRING, description: "Literal snippet cited." },
            },
            required: ["evidence_id", "page", "section", "fund_id", "text"],
          },
          description: "Exact structured list of all original source units used to generate this answer.",
        },
      },
      required: ["answer", "sufficiency", "citations"],
    };

    try {
      const groundedAnswer = await LLMProvider.generateStructured<GroundedAnswer>(
        prompt,
        schema,
        "You are an elite, compliant financial writer producing audited, grounded responses.",
        {
          taskType: "ANSWER_GENERATION",
          questionId,
        }
      );

      return groundedAnswer;
    } catch (error: any) {
      const approxTokens = Math.ceil((prompt.length + 80) / 4); // basic estimate
      const evidenceIds = vettedEvidence.map((e) => e.evidence_id);
      const modelId = getModelForTask("ANSWER_GENERATION");
      const errorStatus = error?.status || error?.code || "N/A";
      const errorType = error?.constructor?.name || typeof error;
      const errorMessage = error?.message || String(error);
      const rawResponse = error?.response?.text || "N/A";

      // Determine failure stage
      let failureStage = "API generation";
      if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
        failureStage = "response parsing";
      } else if (errorMessage.includes("validation") || errorMessage.includes("schema") || errorMessage.includes("required")) {
        failureStage = "structured JSON validation";
      } else if (errorMessage.includes("citation") || errorMessage.includes("Cite")) {
        failureStage = "citation validation";
      } else if (errorMessage.includes("mapping") || errorMessage.includes("map")) {
        failureStage = "final response mapping";
      }

      console.error("================ ANSWER GENERATOR DIAGNOSTIC LOG ================");
      console.error(`[Failure Stage] ${failureStage}`);
      console.error(`[Vetted Evidence Count] ${vettedEvidence.length}`);
      console.error(`[Evidence IDs] ${JSON.stringify(evidenceIds)}`);
      console.error(`[Approx Input Tokens] ${approxTokens}`);
      console.error(`[Gemini Model ID] ${modelId}`);
      console.error(`[Gemini API Status] ${errorStatus}`);
      console.error(`[Exception Type] ${errorType}`);
      console.error(`[Exception Message] ${errorMessage}`);
      console.error(`[Raw Response] ${rawResponse}`);
      console.error("=================================================================");

      return {
        answer: `Error: Failed to safely synthesize the answer. The provided fund documents do contain candidate information, but structured generation was interrupted.\n\n[Diagnostics]\n- Stage: ${failureStage}\n- Model: ${modelId}\n- Error Type: ${errorType}\n- Status Code: ${errorStatus}\n- Error Message: ${errorMessage}\n- Approximate Input Tokens: ${approxTokens}\n- Vetted Evidence Count: ${vettedEvidence.length}\n- Evidence IDs: ${evidenceIds.join(", ")}`,
        sufficiency: "INSUFFICIENT",
        citations: vettedEvidence.map((e) => ({
          evidence_id: e.evidence_id,
          page: e.page,
          section: e.section,
          fund_id: e.fund_id,
          text: e.text.slice(0, 100) + "...",
        })),
      };
    }
  }
}
