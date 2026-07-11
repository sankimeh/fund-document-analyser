/**
 * Core Data Models for Fund Document Analyser and Advisor Q&A
 */

export interface EvidenceUnit {
  evidence_id: string;
  document_id: string;
  fund_id: string;
  page: number;
  section: string;
  subsection: string;
  type: "paragraph" | "table" | "list" | "footnote" | "header";
  text: string;
  metadata?: Record<string, any>;
  heading_hierarchy?: string[];
  table_context?: {
    headers: string[];
    title?: string;
    row_index?: number;
    column_index?: number;
  };
  footnote_relationships?: {
    target_evidence_ids: string[];
    footnote_number?: string;
  };
}

export interface DocumentTreeUnit {
  node_id: string;
  title: string;
  level: number; // 0 for Document, 1 for Section, 2 for Subsection, etc.
  parent_id: string | null;
  child_node_ids: string[];
  evidence_ids: string[]; // Evidence units belonging directly to this heading
}

export interface DocumentTree {
  document_id: string;
  fund_id: string;
  root_node_id: string;
  nodes: Record<string, DocumentTreeUnit>;
}

export interface RoutingManifest {
  prominent_concepts: string[]; // top concepts by prominence
  rare_high_specificity_concepts: string[]; // rare but query-critical concepts (e.g. side-pockets, liquidation exceptions)
  structural_conditions: string[]; // structural or operational conditions/rules
  entities: string[]; // distinctive entities (funds, benchmarks, currencies, managers)
  restrictions_and_exceptions: string[]; // exceptions, restrictions, limits, penalties
  distinctive_terminology: string[]; // document-specific terminology
}

export interface SemanticMapNode {
  node_id: string;
  parent_id: string | null;
  title: string;
  summary: string;
  evidence_ids: string[]; // raw evidence units directly owned by this node
  all_descendant_evidence_ids: string[]; // all evidence units in this subtree
  child_node_ids: string[];
  
  // Compilation State
  state: "PENDING" | "COMPILING" | "COMPLETED" | "FAILED" | "DEGRADED" | "BLOCKED";
  compilation_completeness: number; // 0.0 to 1.0 representing ratio of successfully compiled leaves
  missing_child_node_ids: string[];
  failure_metadata?: {
    error_message: string;
    failed_at: string;
    attempt_count: number;
  };

  // Routing Manifest
  routing_manifest: RoutingManifest;
}

export interface HierarchicalSemanticMap {
  root_node_id: string;
  nodes: Record<string, SemanticMapNode>;
}

export interface SemanticMapEntry {
  description: string;
  concepts: string[];
  evidence_ids: string[];
}

export type SemanticMap = Record<string, SemanticMapEntry>;

export interface StructuredFact {
  fact_id: string;
  fact_type:
    | "redemption_notice_period"
    | "management_fee"
    | "performance_fee"
    | "minimum_investment"
    | "dealing_frequency"
    | "benchmark"
    | "fund_currency"
    | "inception_date"
    | "leverage_limits"
    | "exposure_limits"
    | "nav_frequency"
    | "lock_in_period"
    | "other_restrictions";
  value: any;
  unit: string; // e.g., 'calendar_days', 'percent', 'USD', 'weekly', etc.
  fund_id: string;
  evidence_ids: string[];
  explanation: string;
}

export interface CoverageMetrics {
  total_evidence_units: number;
  indexed_evidence_units: number;
  unindexed_evidence_units: number;
  generic_mapped_evidence_units: number;
  average_mappings_per_evidence_unit: number;
  structural_coverage_rate?: number;
  semantic_coverage_rate?: number;
  unclassified_evidence_units?: number;
}

export interface DocumentCompilation {
  document_id: string;
  fund_id: string;
  filename: string;
  evidence_units: EvidenceUnit[];
  semantic_map: SemanticMap;
  hierarchical_semantic_map?: HierarchicalSemanticMap;
  structured_facts: StructuredFact[];
  coverage_metrics: CoverageMetrics;
}

export interface QueryPlan {
  intent: string;
  target: string;
  concepts: string[];
  search_terms: string[];
  possible_fact_types: string[];
}

export interface EvidenceJudgeVerdict {
  evidence_id: string;
  classification: "DIRECTLY_RELEVANT" | "SUPPORTING" | "CONTEXTUAL" | "IRRELEVANT" | "CONTRADICTORY";
  explanation: string;
}

export interface GroundedAnswer {
  answer: string;
  sufficiency: "SUFFICIENT" | "INSUFFICIENT" | "EVIDENCE_JUDGE_UNAVAILABLE";
  citations: {
    evidence_id: string;
    page: number;
    section: string;
    fund_id: string;
    text: string;
  }[];
}

export interface EvaluationTestCase {
  id: string;
  question: string;
  fund_ids: string[];
  expected_evidence_ids: string[];
  expected_answer_facts: string[];
}

export interface EvaluationResult {
  test_case_id: string;
  question: string;
  retrieved_evidence_ids: string[];
  expected_evidence_ids: string[];
  retrieval_recall: number;       // TP / (TP + FN)
  retrieval_precision: number;    // TP / (TP + FP)
  judge_recall: number;
  judge_precision: number;
  answer_fact_accuracy: number;   // % of expected_answer_facts found in output
  citation_accuracy: number;      // % of citations pointing to correct expected evidence
  unsupported_claim_rate: number; // % of claims that are unsupported
  grounded_answer: GroundedAnswer;
  timestamp: string;
}
