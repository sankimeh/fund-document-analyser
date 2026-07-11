import { EvidenceUnit } from "../models/index.js";

export interface UnionedEvidenceUnit extends EvidenceUnit {
  retrieved_by: string[];
}

export class EvidenceUnion {
  /**
   * Combines candidate evidence from all retrieval routes, removes duplicates, and tracks provenance.
   */
  static union(
    allEvidenceUnits: EvidenceUnit[],
    routeAIds: string[],
    routeBIds: string[],
    routeCIds: string[]
  ): UnionedEvidenceUnit[] {
    console.log("Unifying evidence candidates...");

    const provenanceMap: Record<string, string[]> = {};

    const register = (id: string, route: string) => {
      if (!provenanceMap[id]) {
        provenanceMap[id] = [];
      }
      if (!provenanceMap[id].includes(route)) {
        provenanceMap[id].push(route);
      }
    };

    routeAIds.forEach((id) => register(id, "semantic_map"));
    routeBIds.forEach((id) => register(id, "bm25"));
    routeCIds.forEach((id) => register(id, "structured_fact"));

    const unionedUnits: UnionedEvidenceUnit[] = [];

    // Retain only those units that exist in the document base
    for (const unit of allEvidenceUnits) {
      if (provenanceMap[unit.evidence_id]) {
        unionedUnits.push({
          ...unit,
          retrieved_by: provenanceMap[unit.evidence_id],
        });
      }
    }

    console.log(`Unioned evidence set size: ${unionedUnits.length} candidate units.`);
    return unionedUnits;
  }
}
