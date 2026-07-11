import { StorageService } from "../storage/index.js";
import { QueryPlanner } from "../retrieval/query_planner.js";
import { SemanticMapRetriever } from "../retrieval/semantic_map_retriever.js";
import { LexicalRetriever } from "../retrieval/lexical_retriever.js";
import { FactRetriever } from "../retrieval/fact_retriever.js";
import { EvidenceUnion, UnionedEvidenceUnit } from "../retrieval/evidence_union.js";
import { EvidenceJudge } from "../reasoning/evidence_judge.js";
import { AnswerGenerator } from "../reasoning/answer_generator.js";
import { EvidenceUnit, StructuredFact, GroundedAnswer, QueryPlan } from "../models/index.js";
import { getModelForTask } from "../config/llm_config.js";

export interface AdvisorQAResponse {
  question: string;
  query_plan: QueryPlan;
  route_a_ids: string[];
  route_b_ids: string[];
  route_c_ids: string[];
  candidate_union_count: number;
  unioned_evidence: UnionedEvidenceUnit[];
  judge_verdicts: Record<string, { classification: string; explanation: string }>;
  vetted_evidence: EvidenceUnit[];
  matched_facts: StructuredFact[];
  grounded_answer: GroundedAnswer;
  pipeline_status?: "SUCCESS" | "EVIDENCE_JUDGE_UNAVAILABLE";
}

export class AdvisorQAService {
  /**
   * Run the full multi-route high-precision question-answering pipeline.
   */
  static async askQuestion(
    question: string,
    fundIds: string[]
  ): Promise<AdvisorQAResponse> {
    const questionId = `Q_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    console.log(`Advisor QA requested for funds: ${JSON.stringify(fundIds)}, Question: "${question}" (QuestionId: ${questionId})`);

    // 1. Plan retrieval routes using LLM Query Planner
    const queryPlan = await QueryPlanner.planQuery(question, questionId);

    // Filter compiled data matching requested funds
    const compilations = StorageService.getCompilations().filter((c) =>
      fundIds.includes(c.fund_id)
    );

    // Aggregate evidence pool, semantic maps, and facts for selected funds
    let targetEvidenceUnits: EvidenceUnit[] = [];
    let allStructuredFacts: StructuredFact[] = [];

    compilations.forEach((comp) => {
      targetEvidenceUnits.push(...comp.evidence_units);
      allStructuredFacts.push(...comp.structured_facts);
    });

    // 2. Parallel Route Execution
    // Route A: Semantic Map Matcher
    const routeAPromises = compilations.map((comp) =>
      SemanticMapRetriever.retrieve(
        comp.hierarchical_semantic_map || comp.semantic_map,
        queryPlan,
        comp.evidence_units,
        questionId
      )
    );
    const routeAResults = await Promise.all(routeAPromises);
    const routeAIds = Array.from(new Set(routeAResults.flat()));

    // Route B: Lexical BM25 Search
    const lexicalIndex = StorageService.getLexicalIndex();
    const routeBIds = LexicalRetriever.retrieve(
      lexicalIndex,
      queryPlan,
      question,
      fundIds,
      12 // limit
    );

    // Route C: Structured Fact Store Lookup
    const { matchedFacts, evidenceIds: routeCIds } = FactRetriever.retrieve(
      allStructuredFacts,
      queryPlan,
      fundIds
    );

    // 3. Evidence Union & De-duplication with Provenance tracking
    const unionedEvidence = EvidenceUnion.union(
      targetEvidenceUnits,
      routeAIds,
      routeBIds,
      routeCIds
    );

    // 4 & 5. LLM Evidence Judge and Grounded Answer Synthesis
    let verdictsMap: Record<string, { classification: string; explanation: string }> = {};
    let vettedEvidence: EvidenceUnit[] = [];
    let groundedAnswer: GroundedAnswer;
    let pipeline_status: "SUCCESS" | "EVIDENCE_JUDGE_UNAVAILABLE" = "SUCCESS";

    try {
      const judgeVerdicts = await EvidenceJudge.judgeEvidence(question, unionedEvidence, questionId);

      // Index verdicts by evidence ID for easy mapping
      judgeVerdicts.forEach((v) => {
        verdictsMap[v.evidence_id] = {
          classification: v.classification,
          explanation: v.explanation,
        };
      });

      // Filter units judged as relevant or supporting
      vettedEvidence = unionedEvidence.filter((unit) => {
        const v = verdictsMap[unit.evidence_id];
        return (
          v && (v.classification === "DIRECTLY_RELEVANT" || v.classification === "SUPPORTING")
        );
      });

      // Grounded Answer Synthesis
      groundedAnswer = await AnswerGenerator.generateAnswer(
        question,
        vettedEvidence,
        matchedFacts,
        questionId
      );
    } catch (error: any) {
      console.error("================ EVIDENCE JUDGE PIPELINE FAILURE ================");
      console.error("Evidence judging failed or answer generation was interrupted. Failing closed.");
      console.error(`Error Type: ${error?.constructor?.name || typeof error}`);
      console.error(`Message: ${error?.message || String(error)}`);
      console.error("===============================================================");

      pipeline_status = "EVIDENCE_JUDGE_UNAVAILABLE";
      vettedEvidence = [];

      // Safe placeholder/diagnostics verdicts
      unionedEvidence.forEach((unit) => {
        verdictsMap[unit.evidence_id] = {
          classification: "IRRELEVANT",
          explanation: `System limits or API error prevented classification. Original error: ${error?.message || String(error)}`,
        };
      });

      const modelId = getModelForTask("EVIDENCE_JUDGING");
      const errorStatus = error?.status || error?.code || "N/A";
      const errorType = error?.constructor?.name || typeof error;
      const errorMessage = error?.message || String(error);

      groundedAnswer = {
        answer: `Error: Failed to safely synthesize the answer. The Evidence Judge is unavailable due to system limits or API failure (EVIDENCE_JUDGE_UNAVAILABLE).\n\n[Diagnostics]\n- Stage: Evidence Judging\n- Model: ${modelId}\n- Error Type: ${errorType}\n- Status Code: ${errorStatus}\n- Error Message: ${errorMessage}`,
        sufficiency: "EVIDENCE_JUDGE_UNAVAILABLE",
        citations: [], // Fail closed: do not include unvetted citations
      };
    }

    return {
      question,
      query_plan: queryPlan,
      route_a_ids: routeAIds,
      route_b_ids: routeBIds,
      route_c_ids: routeCIds,
      candidate_union_count: unionedEvidence.length,
      unioned_evidence: unionedEvidence,
      judge_verdicts: verdictsMap,
      vetted_evidence: vettedEvidence,
      matched_facts: matchedFacts,
      grounded_answer: groundedAnswer,
      pipeline_status,
    };
  }
}
