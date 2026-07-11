import { StorageService } from "../storage/index.js";
import { AdvisorQAService } from "./advisor_qa.js";
import { EvaluationResult, EvaluationTestCase } from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";

export class EvaluationService {
  /**
   * Executes a complete evaluation run on all seeded test cases
   */
  static async runFullEvaluation(): Promise<EvaluationResult[]> {
    console.log("Starting full evaluation run...");
    const testCases = StorageService.getEvaluationTestCases();
    const results: EvaluationResult[] = [];

    for (const tc of testCases) {
      try {
        const res = await this.evaluateTestCase(tc);
        StorageService.recordEvaluationResult(res);
        results.push(res);
      } catch (err) {
        console.error(`Evaluation failed for Test Case ${tc.id}:`, err);
      }
    }

    return results;
  }

  /**
   * Evaluates a single test case, calculating all requested metrics
   */
  static async evaluateTestCase(tc: EvaluationTestCase): Promise<EvaluationResult> {
    console.log(`Evaluating Test Case ${tc.id}: "${tc.question}"`);

    // 1. Run the online advisor QA pipeline
    const qaResult = await AdvisorQAService.askQuestion(tc.question, tc.fund_ids);

    // Collect retrieved evidence IDs across all routes
    const retrievedIds = new Set<string>();
    qaResult.unioned_evidence.forEach((e) => retrievedIds.add(e.evidence_id));

    const expectedSet = new Set(tc.expected_evidence_ids);

    // 2. Compute Retrieval metrics
    let tp_retrieval = 0;
    retrievedIds.forEach((id) => {
      if (expectedSet.has(id)) tp_retrieval++;
    });

    const retrieval_recall = expectedSet.size > 0 ? tp_retrieval / expectedSet.size : 1;
    const retrieval_precision = retrievedIds.size > 0 ? tp_retrieval / retrievedIds.size : 1;

    // 3. Compute Evidence Judge metrics
    // Relevant/vetted units
    const vettedIds = new Set(qaResult.vetted_evidence.map((v) => v.evidence_id));
    let tp_judge = 0;
    vettedIds.forEach((id) => {
      if (expectedSet.has(id)) tp_judge++;
    });

    const judge_recall = expectedSet.size > 0 ? tp_judge / expectedSet.size : 1;
    const judge_precision = vettedIds.size > 0 ? tp_judge / vettedIds.size : 1;

    // 4. Compute Answer Fact Accuracy (Using LLM to verify factual content match)
    const answer_fact_accuracy = await this.evaluateAnswerFactAccuracy(
      qaResult.grounded_answer.answer,
      tc.expected_answer_facts,
      tc.id
    );

    // 5. Compute Citation Accuracy
    // Citations are accurate if they belong to expected_evidence_ids (or are correct for the text)
    let correct_citations = 0;
    const citations = qaResult.grounded_answer.citations;
    citations.forEach((cit) => {
      if (expectedSet.has(cit.evidence_id)) {
        correct_citations++;
      }
    });
    const citation_accuracy = citations.length > 0 ? correct_citations / citations.length : 1;

    // 6. Compute Unsupported Claim Rate
    // Unsupported claims occur when citations reference evidence that is not inside our vetted evidence pool, 
    // or when claims are made without proper citation (though LLM handles citations, we check if cited IDs are real)
    let unsupported_count = 0;
    citations.forEach((cit) => {
      if (!vettedIds.has(cit.evidence_id)) {
        unsupported_count++;
      }
    });
    const unsupported_claim_rate = citations.length > 0 ? unsupported_count / citations.length : 0;

    return {
      test_case_id: tc.id,
      question: tc.question,
      retrieved_evidence_ids: Array.from(retrievedIds),
      expected_evidence_ids: tc.expected_evidence_ids,
      retrieval_recall: parseFloat(retrieval_recall.toFixed(2)),
      retrieval_precision: parseFloat(retrieval_precision.toFixed(2)),
      judge_recall: parseFloat(judge_recall.toFixed(2)),
      judge_precision: parseFloat(judge_precision.toFixed(2)),
      answer_fact_accuracy: parseFloat(answer_fact_accuracy.toFixed(2)),
      citation_accuracy: parseFloat(citation_accuracy.toFixed(2)),
      unsupported_claim_rate: parseFloat(unsupported_claim_rate.toFixed(2)),
      grounded_answer: qaResult.grounded_answer,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Helper using Gemini to verify if all expected facts are correctly represented in the generated text
   */
  private static async evaluateAnswerFactAccuracy(
    answer: string,
    expectedFacts: string[],
    questionId?: string
  ): Promise<number> {
    const prompt = `
You are a precision quality control auditor. Your task is to verify if the generated answer contains the listed "Expected Facts".

Generated Answer:
"${answer}"

Expected Facts to search for in the text:
${JSON.stringify(expectedFacts, null, 2)}

Output a list of booleans indicating whether each expected fact is correctly described/included in the generated answer.
`;

    const schema = {
      type: Type.ARRAY,
      items: { type: Type.BOOLEAN },
      description: "List of true/false values representing presence of each expected fact.",
    };

    try {
      const results = await LLMProvider.generateStructured<boolean[]>(
        prompt,
        schema,
        "You are a strict, objective factual auditor checking textual compliance.",
        {
          taskType: "EVALUATION",
          questionId,
        }
      );

      const trueCount = results.filter(Boolean).length;
      return results.length > 0 ? trueCount / results.length : 1;
    } catch (err) {
      console.error("Fact audit failed, falling back to basic substring matching:", err);
      // Fallback simple keyword match
      let matchCount = 0;
      expectedFacts.forEach((fact) => {
        const words = fact.toLowerCase().split(/\s+/);
        const containsAll = words.every((w) => answer.toLowerCase().includes(w));
        if (containsAll) matchCount++;
      });
      return expectedFacts.length > 0 ? matchCount / expectedFacts.length : 1;
    }
  }
}
