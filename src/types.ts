export interface DocumentMeta {
  document_id: string;
  fund_id: string;
  filename: string;
  metrics: {
    total_evidence_units: number;
    indexed_evidence_units: number;
    unindexed_evidence_units: number;
    generic_mapped_evidence_units: number;
    average_mappings_per_evidence_unit: number;
  };
  facts_count: number;
  evidence_count: number;
}

export interface GroundedCitation {
  evidence_id: string;
  page: number;
  section: string;
  fund_id: string;
  text: string;
}

export interface GroundedAnswer {
  answer: string;
  sufficiency: "SUFFICIENT" | "INSUFFICIENT" | "EVIDENCE_JUDGE_UNAVAILABLE";
  citations: GroundedCitation[];
}

export interface QueryPlan {
  intent: string;
  target: string;
  concepts: string[];
  search_terms: string[];
  possible_fact_types: string[];
}

export interface UnionedEvidence {
  evidence_id: string;
  document_id: string;
  fund_id: string;
  page: number;
  section: string;
  subsection: string;
  type: string;
  text: string;
  retrieved_by: string[];
}

export interface StructuredFact {
  fact_id: string;
  fact_type: string;
  value: any;
  unit: string;
  fund_id: string;
  evidence_ids: string[];
  explanation: string;
}

export interface QAResponse {
  question: string;
  query_plan: QueryPlan;
  route_a_ids: string[];
  route_b_ids: string[];
  route_c_ids: string[];
  candidate_union_count: number;
  unioned_evidence: UnionedEvidence[];
  judge_verdicts: Record<string, { classification: string; explanation: string }>;
  vetted_evidence: UnionedEvidence[];
  matched_facts: StructuredFact[];
  grounded_answer: GroundedAnswer;
  pipeline_status?: "SUCCESS" | "EVIDENCE_JUDGE_UNAVAILABLE";
}

export interface EvaluationResult {
  test_case_id: string;
  question: string;
  retrieved_evidence_ids: string[];
  expected_evidence_ids: string[];
  retrieval_recall: number;
  retrieval_precision: number;
  judge_recall: number;
  judge_precision: number;
  answer_fact_accuracy: number;
  citation_accuracy: number;
  unsupported_claim_rate: number;
  grounded_answer: GroundedAnswer;
  timestamp: string;
}

export interface EvaluationTestCase {
  id: string;
  question: string;
  fund_ids: string[];
  expected_evidence_ids: string[];
  expected_answer_facts: string[];
}
