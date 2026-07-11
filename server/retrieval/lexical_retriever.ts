import { QueryPlan, EvidenceUnit } from "../models/index.js";
import { LexicalIndex } from "../indexing/lexical_index.js";

export class LexicalRetriever {
  /**
   * Route B: Retrieves candidates from the BM25 lexical index using query planner terms.
   */
  static retrieve(
    lexicalIndex: LexicalIndex,
    queryPlan: QueryPlan,
    originalQuestion: string,
    fundFilter?: string[],
    limit = 10
  ): string[] {
    console.log("Executing Route B: Lexical Inverted Search...");

    const matchedIds = new Set<string>();

    // Pass 1: Search using the original natural-language question
    const qResults = lexicalIndex.search(originalQuestion, Math.ceil(limit / 2), fundFilter);
    qResults.forEach((r) => matchedIds.add(r.evidence_id));

    // Pass 2: Search using specific terms suggested by the query planner
    const plannerQuery = queryPlan.search_terms.join(" ");
    const termResults = lexicalIndex.search(plannerQuery, Math.ceil(limit / 2), fundFilter);
    termResults.forEach((r) => matchedIds.add(r.evidence_id));

    // Pass 3: Check for exact phrase matching on highly specialized terms
    queryPlan.search_terms.forEach((term) => {
      if (term.length > 5) {
        // e.g. "redemption period"
        const phraseUnits = lexicalIndex.phraseSearch(term, fundFilter);
        phraseUnits.slice(0, 3).forEach((u) => matchedIds.add(u.evidence_id));
      }
    });

    const resultList = Array.from(matchedIds).slice(0, limit);
    console.log(`Route B retrieved ${resultList.length} evidence units.`);
    return resultList;
  }
}
