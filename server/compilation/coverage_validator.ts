import { EvidenceUnit, SemanticMap, CoverageMetrics } from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";

export class CoverageValidator {
  /**
   * Performs validation on the Semantic Map and run correction passes if needed.
   */
  static async validateAndOptimize(
    evidenceUnits: EvidenceUnit[],
    semanticMap: SemanticMap
  ): Promise<{ semanticMap: SemanticMap; metrics: CoverageMetrics }> {
    console.log("Running Coverage Validation...");

    let unindexed = this.getUnindexedUnits(evidenceUnits, semanticMap);

    if (unindexed.length > 0) {
      console.log(`Detected ${unindexed.length} unclassified/unindexed units. Registering explicitly as UNCLASSIFIED...`);
      // Explicitly mark unclassified evidence under a dedicated unclassified category
      semanticMap["unclassified"] = {
        description: "Raw evidence units that did not map to any specific semantic category.",
        concepts: ["UNCLASSIFIED"],
        evidence_ids: unindexed.map(u => u.evidence_id),
      };
    }

    const metrics = this.calculateMetrics(evidenceUnits, semanticMap);
    console.log("Coverage Validation completed successfully", metrics);

    return { semanticMap, metrics };
  }

  /**
   * Helper to identify all unindexed units
   */
  private static getUnindexedUnits(
    evidenceUnits: EvidenceUnit[],
    semanticMap: SemanticMap
  ): EvidenceUnit[] {
    const indexedIds = new Set<string>();
    for (const [key, category] of Object.entries(semanticMap)) {
      if (key === "unclassified" || key === "hierarchical_semantic_map") continue;
      if (!category || !category.evidence_ids) {
        throw new Error(`[Schema Validation Error] Category '${key}' is malformed or missing 'evidence_ids' field.`);
      }
      category.evidence_ids.forEach((id) => indexedIds.add(id));
    }

    return evidenceUnits.filter((unit) => !indexedIds.has(unit.evidence_id));
  }

  /**
   * Calculates comprehensive index coverage metrics
   */
  static calculateMetrics(
    evidenceUnits: EvidenceUnit[],
    semanticMap: SemanticMap
  ): CoverageMetrics {
    const total = evidenceUnits.length;
    const unitToCategoriesCount: Record<string, number> = {};

    evidenceUnits.forEach((u) => {
      unitToCategoriesCount[u.evidence_id] = 0;
    });

    let genericCount = 0;
    let unclassifiedCount = 0;

    for (const [key, category] of Object.entries(semanticMap)) {
      if (key === "hierarchical_semantic_map") continue;

      if (!category || !category.evidence_ids) {
        throw new Error(`[Schema Validation Error] Category '${key}' is malformed or missing 'evidence_ids' field.`);
      }

      const isGeneric =
        key.includes("other") ||
        key.includes("general") ||
        key.includes("misc") ||
        key.includes("introduction");

      const isUnclassified = key === "unclassified";

      category.evidence_ids.forEach((id) => {
        if (unitToCategoriesCount[id] !== undefined) {
          unitToCategoriesCount[id]++;
        }
        if (isGeneric && unitToCategoriesCount[id] === 1) {
          genericCount++;
        }
        if (isUnclassified) {
          unclassifiedCount++;
        }
      });
    }

    let indexedCount = 0;
    let sumMappings = 0;

    Object.entries(unitToCategoriesCount).forEach(([id, count]) => {
      if (count > 0 && !semanticMap["unclassified"]?.evidence_ids.includes(id)) {
        indexedCount++;
        sumMappings += count;
      }
    });

    const unindexedCount = total - indexedCount;
    const averageMappings = indexedCount > 0 ? sumMappings / total : 0;

    const structuralCoverageRate = total > 0 ? 1.0 : 0.0; // All elements are structurally captured
    const semanticCoverageRate = total > 0 ? (total - unclassifiedCount) / total : 0.0;

    return {
      total_evidence_units: total,
      indexed_evidence_units: indexedCount,
      unindexed_evidence_units: unindexedCount,
      generic_mapped_evidence_units: genericCount,
      average_mappings_per_evidence_unit: parseFloat(averageMappings.toFixed(2)),
      structural_coverage_rate: parseFloat(structuralCoverageRate.toFixed(2)),
      semantic_coverage_rate: parseFloat(semanticCoverageRate.toFixed(2)),
      unclassified_evidence_units: unclassifiedCount,
    };
  }

}
