import { EvidenceUnit, EvidenceJudgeVerdict } from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";

export class EvidenceJudge {
  /**
   * Acts as an LLM evidence judge, classifying the relevance of candidates with explanation.
   */
  static async judgeEvidence(
    question: string,
    candidates: EvidenceUnit[],
    questionId?: string
  ): Promise<EvidenceJudgeVerdict[]> {
    if (candidates.length === 0) return [];
    console.log(`Judging ${candidates.length} candidate evidence units...`);

    const formattedCandidates = candidates.map((c) => ({
      evidence_id: c.evidence_id,
      section: c.section,
      subsection: c.subsection,
      type: c.type,
      text: c.text,
    }));

    const prompt = `
You are a meticulous financial auditor and evidence judge.
Evaluate the following candidate Evidence Units extracted from a fund document against the advisor's question.

Advisor's Question: "${question}"

Your job is to judge each Evidence Unit independently and classify it into one of these exact values:
1. "DIRECTLY_RELEVANT": Contains the direct, explicit answer or exact financial metric requested (e.g. the specific notice period number).
2. "SUPPORTING": Contains secondary detail, conditions, exceptions, or definitions directly related to the direct answer (e.g. dealing frequency, grace periods, holidays).
3. "CONTEXTUAL": General details about fees, fund setup, or unrelated concepts that set context but do NOT help answer the specific question.
4. "IRRELEVANT": Mentions similar words but is semantically different. 
   - CRITICAL WARNING: If the question is about *investor redemptions* (how clients withdraw money), any text discussing *portfolio assets liquidity* (the manager selling stocks) or *market volume liquidity* is strictly "IRRELEVANT" unless the document explicitly links it to client redemptions!
5. "CONTRADICTORY": Directly contradicts other facts in the document or standard understanding.

Provide your verdict for each candidate. You MUST explain internally why the evidence holds this classification.

Candidates to evaluate:
${JSON.stringify(formattedCandidates, null, 2)}
`;

    const schema = {
      type: Type.ARRAY,
      description: "List of evidence classification verdicts",
      items: {
        type: Type.OBJECT,
        properties: {
          evidence_id: { type: Type.STRING },
          classification: {
            type: Type.STRING,
            description: "Must be DIRECTLY_RELEVANT, SUPPORTING, CONTEXTUAL, IRRELEVANT, or CONTRADICTORY",
          },
          explanation: {
            type: Type.STRING,
            description: "Detailed reason explaining why this evidence matches the classification.",
          },
        },
        required: ["evidence_id", "classification", "explanation"],
      },
    };

    try {
      const verdicts = await LLMProvider.generateStructured<EvidenceJudgeVerdict[]>(
        prompt,
        schema,
        "You are an expert investment auditor classifying text evidence strictly by financial intent.",
        {
          taskType: "EVIDENCE_JUDGING",
          questionId,
        }
      );

      return verdicts;
    } catch (error) {
      console.error("Evidence judging failed, propagating error to fail closed:", error);
      throw error;
    }
  }
}
