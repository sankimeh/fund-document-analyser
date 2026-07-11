import { EvidenceUnit, SemanticMap } from "../models/index.js";
import { DocumentParser } from "../parsing/index.js";
import { HierarchicalCompiler } from "./hierarchical_compiler.js";

export class SemanticMapBuilder {
  /**
   * Generates a compact document-specific semantic map using Gemini.
   */
  static async buildSemanticMap(
    evidenceUnits: EvidenceUnit[]
  ): Promise<SemanticMap> {
    console.log(`Building Hierarchical Semantic Map for ${evidenceUnits.length} units`);

    if (evidenceUnits.length === 0) {
      return {};
    }

    const documentId = evidenceUnits[0]?.document_id || "DOC_UNKNOWN";
    const fundId = evidenceUnits[0]?.fund_id || "FUND_UNKNOWN";

    try {
      // 1. Build the Hierarchical DocumentTree
      const tree = DocumentParser.buildDocumentTree(evidenceUnits, documentId, fundId);
      
      // 2. Perform the bottom-up hierarchical compilation
      const hMap = await HierarchicalCompiler.compile(tree, evidenceUnits);

      // 3. Flatten the Hierarchical map into the legacy flat SemanticMap
      const flatMap = HierarchicalCompiler.flattenToLegacyMap(hMap);

      // 4. Attach the hierarchical map for persistence and usage by advanced routes
      (flatMap as any).hierarchical_semantic_map = hMap;

      return flatMap;
    } catch (error) {
      console.error("Hierarchical semantic compilation failed, falling back to heuristic map:", error);
      const flatFallback = this.fallbackHeuristicMap(evidenceUnits);
      return flatFallback;
    }
  }

  /**
   * Dynamic fallback generator to ensure the system is robust even if LLM fails
   */
  private static fallbackHeuristicMap(evidenceUnits: EvidenceUnit[]): SemanticMap {
    const semanticMap: SemanticMap = {};

    evidenceUnits.forEach((unit) => {
      // Group by normalized section heading
      const categoryKey = unit.section
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 40);

      if (!semanticMap[categoryKey]) {
        semanticMap[categoryKey] = {
          description: `Automatic grouping for section: ${unit.section}`,
          concepts: [unit.subsection],
          evidence_ids: [],
        };
      }

      if (!semanticMap[categoryKey].concepts.includes(unit.subsection)) {
        semanticMap[categoryKey].concepts.push(unit.subsection);
      }

      semanticMap[categoryKey].evidence_ids.push(unit.evidence_id);
    });

    return semanticMap;
  }
}
