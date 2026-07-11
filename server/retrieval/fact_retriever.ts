import { StructuredFact, QueryPlan } from "../models/index.js";

export class FactRetriever {
  /**
   * Route C: Scans the structured fact store for parameter matches and their backing evidence.
   */
  static retrieve(
    structuredFacts: StructuredFact[],
    queryPlan: QueryPlan,
    fundFilter?: string[]
  ): { matchedFacts: StructuredFact[]; evidenceIds: string[] } {
    console.log("Executing Route C: Structured Fact Retrieval...");

    const matchedFacts: StructuredFact[] = [];
    const evidenceIdsSet = new Set<string>();

    const targetTypes = queryPlan.possible_fact_types.map((t) => t.toLowerCase());
    const queryIntent = queryPlan.intent.toLowerCase();

    for (const fact of structuredFacts) {
      // Filter by fund if active
      if (fundFilter && !fundFilter.includes(fact.fund_id)) continue;

      let isMatch = false;

      // Match Route 1: Direct fact type matches expected fact types from planner
      if (targetTypes.includes(fact.fact_type.toLowerCase())) {
        isMatch = true;
      }

      // Match Route 2: Fact type or explanation contains semantic match with query intent/target
      if (
        fact.fact_type.toLowerCase().includes(queryIntent) ||
        fact.explanation.toLowerCase().includes(queryIntent) ||
        queryPlan.concepts.some((c) => fact.explanation.toLowerCase().includes(c.toLowerCase()))
      ) {
        isMatch = true;
      }

      if (isMatch) {
        matchedFacts.push(fact);
        if (fact.evidence_ids) {
          fact.evidence_ids.forEach((id) => evidenceIdsSet.add(id));
        }
      }
    }

    const matchedEvidenceIds = Array.from(evidenceIdsSet);
    console.log(
      `Route C matched ${matchedFacts.length} structured facts, referencing ${matchedEvidenceIds.length} evidence units.`
    );

    return {
      matchedFacts,
      evidenceIds: matchedEvidenceIds,
    };
  }
}
