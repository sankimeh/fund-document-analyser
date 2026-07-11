import {
  EvidenceUnit,
  DocumentTree,
  DocumentTreeUnit,
  HierarchicalSemanticMap,
  SemanticMapNode,
  RoutingManifest,
  SemanticMap,
} from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";

const LeafSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A factual, concise prose summary of this section's content. Focus on actual details, values, and rules.",
    },
    prominent_concepts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "The main topics or operational concepts covered.",
    },
    rare_high_specificity_concepts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Any rare or highly specific concepts (e.g. side-pockets, gating triggers, liquidation exceptions).",
    },
    structural_conditions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Structural or operational rules, notice periods, dealing days, or discretions.",
    },
    entities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Key named entities (funds, benchmarks, currencies, managers).",
    },
    restrictions_and_exceptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Any limits, restrictions, penalties, exemptions, or caps.",
    },
    distinctive_terminology: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Specific financial, technical, or legal terms used in the text.",
    },
  },
  required: [
    "summary",
    "prominent_concepts",
    "rare_high_specificity_concepts",
    "structural_conditions",
    "entities",
    "restrictions_and_exceptions",
    "distinctive_terminology",
  ],
};

const ParentSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A synthesized prose summary of all child sections. Avoid generic phrases, be factual and specific.",
    },
    prominent_concepts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Synthesized prominent concepts. Consolidate and select the most prominent.",
    },
    rare_high_specificity_concepts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Rare and highly specific concepts. CRITICAL: Do NOT prune rare rules or exceptions. Retain them.",
    },
    structural_conditions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Synthesized structural conditions and operational rules.",
    },
    entities: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Distinctive entities across child nodes.",
    },
    restrictions_and_exceptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Synthesized restrictions, limits, penalties, or exceptions.",
    },
    distinctive_terminology: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Unique terminology combined and preserved.",
    },
  },
  required: [
    "summary",
    "prominent_concepts",
    "rare_high_specificity_concepts",
    "structural_conditions",
    "entities",
    "restrictions_and_exceptions",
    "distinctive_terminology",
  ],
};

export class HierarchicalCompiler {
  /**
   * Compiles a flat Document Tree into a Hierarchical Semantic Map bottom-up.
   */
  static async compile(
    tree: DocumentTree,
    evidenceUnits: EvidenceUnit[]
  ): Promise<HierarchicalSemanticMap> {
    if (!tree) {
      throw new Error("[Schema Validation Error] DocumentTree is undefined or null.");
    }
    if (!tree.root_node_id) {
      throw new Error("[Schema Validation Error] DocumentTree is missing 'root_node_id'.");
    }
    if (!tree.nodes) {
      throw new Error(`[Schema Validation Error] DocumentTree (ID: ${tree.document_id || 'unknown'}) is missing 'nodes'.`);
    }

    // Validate each node structure in the tree
    Object.entries(tree.nodes).forEach(([nodeId, n]) => {
      if (!n.node_id) {
        throw new Error(`[Schema Validation Error] DocumentTree node ${nodeId} is missing 'node_id'.`);
      }
      if (typeof n.title !== "string") {
        throw new Error(`[Schema Validation Error] DocumentTree node ${nodeId} ('${n.node_id}') is missing or has invalid 'title'.`);
      }
      if (typeof n.level !== "number") {
        throw new Error(`[Schema Validation Error] DocumentTree node ${nodeId} ('${n.title}') is missing or has invalid 'level'.`);
      }
      if (!Array.isArray(n.child_node_ids)) {
        throw new Error(`[Schema Validation Error] DocumentTree node ${nodeId} ('${n.title}') is missing 'child_node_ids'.`);
      }
      if (!Array.isArray(n.evidence_ids)) {
        throw new Error(`[Schema Validation Error] DocumentTree node ${nodeId} ('${n.title}') is missing 'evidence_ids'.`);
      }
    });

    console.log(`Starting bottom-up hierarchical compilation for tree: ${tree.root_node_id}`);
    
    const nodes: Record<string, SemanticMapNode> = {};
    const evidenceMap = new Map<string, EvidenceUnit>();
    evidenceUnits.forEach(u => evidenceMap.set(u.evidence_id, u));

    // Group tree nodes by level so we can process bottom-up
    const levels: Record<number, string[]> = {};
    Object.values(tree.nodes).forEach(n => {
      if (!levels[n.level]) levels[n.level] = [];
      levels[n.level].push(n.node_id);
    });

    const maxLevel = Math.max(...Object.keys(levels).map(Number));

    // Compile from deepest levels up to the root
    for (let currentLevel = maxLevel; currentLevel >= 0; currentLevel--) {
      const nodeIdsAtLevel = levels[currentLevel] || [];
      console.log(`Compiling level ${currentLevel} with ${nodeIdsAtLevel.length} nodes...`);

      // We can parallelize nodes compilation at the same level
      const compilePromises = nodeIdsAtLevel.map(async (nodeId) => {
        const treeNode = tree.nodes[nodeId];
        
        if (treeNode.level === maxLevel || treeNode.child_node_ids.length === 0) {
          // This is a Leaf Node (e.g. Subsections or sections with no children)
          nodes[nodeId] = await this.compileLeaf(treeNode, evidenceMap, tree.document_id);
        } else {
          // This is a Parent Node (e.g. Sections or Document Root)
          const childSemanticNodes = treeNode.child_node_ids
            .map(cid => nodes[cid])
            .filter(Boolean);

          nodes[nodeId] = await this.compileParent(treeNode, childSemanticNodes, evidenceMap, tree.document_id);
        }
      });

      await Promise.all(compilePromises);
    }

    return {
      root_node_id: tree.root_node_id,
      nodes,
    };
  }

  /**
   * Compile a leaf node using its associated raw EvidenceUnits.
   */
  private static async compileLeaf(
    treeNode: DocumentTreeUnit,
    evidenceMap: Map<string, EvidenceUnit>,
    compilationId?: string
  ): Promise<SemanticMapNode> {
    const node_id = treeNode.node_id;
    console.log(`Compiling leaf node: ${node_id} ("${treeNode.title}")`);

    // Get raw evidence units
    const units = treeNode.evidence_ids
      .map(id => evidenceMap.get(id))
      .filter((u): u is EvidenceUnit => !!u);

    if (units.length === 0) {
      // Empty leaf node
      return {
        node_id,
        parent_id: treeNode.parent_id,
        title: treeNode.title,
        summary: `No content available in section ${treeNode.title}.`,
        evidence_ids: [],
        all_descendant_evidence_ids: [],
        child_node_ids: [],
        state: "COMPLETED",
        compilation_completeness: 1.0,
        missing_child_node_ids: [],
        routing_manifest: this.emptyRoutingManifest(),
      };
    }

    // Prepare text for the leaf node
    const formattedText = units
      .map(u => `[Page ${u.page}] [${u.type.toUpperCase()}] ${u.text}`)
      .join("\n\n");

    const prompt = `
Analyze the following section titled "${treeNode.title}" from a fund document.
Extract a factual summary and populate a multi-label Routing Manifest representing:
- Prominent Concepts
- Rare or High-Specificity Concepts (e.g. side pockets, locks, gates, specific structural rules, specific exceptions/discretions)
- Structural Conditions (rules, notice periods, dealing frequency, thresholds)
- Key Entities (funds, benchmarks, currencies, managers)
- Restrictions and Exceptions (penalties, concentration limits, borrowing caps)
- Distinctive Terminology (specific jargon or phrases)

Section Text Content:
${formattedText}
`;

    let attempts = 0;
    while (attempts < 3) {
      try {
        const result = await LLMProvider.generateStructured<any>(
          prompt,
          LeafSchema,
          "You are an expert financial document compiler translating raw prospectus text into high-precision indexing manifests.",
          {
            taskType: "LEAF_COMPILATION",
            compilationId,
          }
        );

        this.validateLLMResponse(node_id, result);

        return {
          node_id,
          parent_id: treeNode.parent_id,
          title: treeNode.title,
          summary: result.summary,
          evidence_ids: treeNode.evidence_ids,
          all_descendant_evidence_ids: treeNode.evidence_ids,
          child_node_ids: [],
          state: "COMPLETED",
          compilation_completeness: 1.0,
          missing_child_node_ids: [],
          routing_manifest: {
            prominent_concepts: result.prominent_concepts || [],
            rare_high_specificity_concepts: result.rare_high_specificity_concepts || [],
            structural_conditions: result.structural_conditions || [],
            entities: result.entities || [],
            restrictions_and_exceptions: result.restrictions_and_exceptions || [],
            distinctive_terminology: result.distinctive_terminology || [],
          },
        };
      } catch (error: any) {
        attempts++;
        console.warn(`Leaf node ${node_id} compilation failed (attempt ${attempts}/3):`, error);
        if (attempts >= 3) {
          // Failure isolation: Return FAILED state instead of crashing entire document
          return {
            node_id,
            parent_id: treeNode.parent_id,
            title: treeNode.title,
            summary: `Compilation failed for leaf node: ${treeNode.title}.`,
            evidence_ids: treeNode.evidence_ids,
            all_descendant_evidence_ids: treeNode.evidence_ids,
            child_node_ids: [],
            state: "FAILED",
            compilation_completeness: 0.0,
            missing_child_node_ids: [],
            failure_metadata: {
              error_message: error?.message || String(error),
              failed_at: new Date().toISOString(),
              attempt_count: attempts,
            },
            routing_manifest: this.emptyRoutingManifest(),
          };
        }
      }
    }

    throw new Error(`Unreachable state in compileLeaf for node ${node_id}`);
  }

  /**
   * Compile a parent node by aggregating child node manifests and summaries.
   */
  private static async compileParent(
    treeNode: DocumentTreeUnit,
    childNodes: SemanticMapNode[],
    evidenceMap: Map<string, EvidenceUnit>,
    compilationId?: string
  ): Promise<SemanticMapNode> {
    const node_id = treeNode.node_id;
    console.log(`Compiling parent node: ${node_id} ("${treeNode.title}") with ${childNodes.length} children`);

    const childStates = childNodes.map(c => c.state);
    const totalChildLeaves = childNodes.reduce((acc, c) => acc + (c.child_node_ids.length || 1), 0);
    const successfullyCompiledCount = childNodes.filter(c => c.state === "COMPLETED" || c.state === "DEGRADED").length;

    // Check if we are degraded or failed
    let state: SemanticMapNode["state"] = "COMPLETED";
    const missing_child_node_ids = treeNode.child_node_ids.filter(
      cid => !childNodes.some(c => c.node_id === cid && (c.state === "COMPLETED" || c.state === "DEGRADED"))
    );

    if (missing_child_node_ids.length > 0) {
      if (successfullyCompiledCount > 0) {
        state = "DEGRADED";
      } else {
        state = "FAILED";
      }
    }

    const compilation_completeness = totalChildLeaves > 0 ? successfullyCompiledCount / childNodes.length : 1.0;

    // Direct evidence units owned by this parent (if any)
    const directEvidenceIds = treeNode.evidence_ids || [];
    const allDescendantEvidenceIds = [
      ...directEvidenceIds,
      ...childNodes.flatMap(c => c.all_descendant_evidence_ids),
    ];

    // If state is failed and we have no successful children, bypass LLM
    if (state === "FAILED") {
      return {
        node_id,
        parent_id: treeNode.parent_id,
        title: treeNode.title,
        summary: `Compilation failed for parent node: ${treeNode.title} (all children failed).`,
        evidence_ids: directEvidenceIds,
        all_descendant_evidence_ids: allDescendantEvidenceIds,
        child_node_ids: treeNode.child_node_ids,
        state: "FAILED",
        compilation_completeness: 0.0,
        missing_child_node_ids: treeNode.child_node_ids,
        routing_manifest: this.emptyRoutingManifest(),
      };
    }

    // Format successfully compiled child nodes' data to feed to parent compiler LLM
    const activeChildren = childNodes.filter(c => c.state === "COMPLETED" || c.state === "DEGRADED");
    const childrenData = activeChildren.map(c => ({
      node_id: c.node_id,
      title: c.title,
      summary: c.summary,
      routing_manifest: c.routing_manifest,
    }));

    const prompt = `
You are compiling a parent section titled "${treeNode.title}" from its sub-sections.
Analyze the summaries and routing manifests of the sub-sections.
Synthesize a single factual parent prose summary and a consolidated Routing Manifest.

Apply a Bounded Retention Strategy to prevent parent routing manifest dilution:
- Consolidate and select prominent concepts.
- CRITICAL: Do NOT prune rare, distinctive, or high-specificity concepts (such as side pockets, liquidation exceptions, gate thresholds, or penalty fees) even if they only appear in one sub-section. They must be preserved.
- Retain structural conditions, key entities, exceptions, limits, and unique terminology.
- Keep each manifest list compact (at most 10-12 highly specific items).

Sub-Sections Data:
${JSON.stringify(childrenData, null, 2)}
`;

    let attempts = 0;
    while (attempts < 3) {
      try {
        const result = await LLMProvider.generateStructured<any>(
          prompt,
          ParentSchema,
          "You are an expert financial document compiler synthesizing parent category summaries and routing manifests.",
          {
            taskType: "PARENT_COMPILATION",
            compilationId,
          }
        );

        this.validateLLMResponse(node_id, result);

        return {
          node_id,
          parent_id: treeNode.parent_id,
          title: treeNode.title,
          summary: result.summary,
          evidence_ids: directEvidenceIds,
          all_descendant_evidence_ids: allDescendantEvidenceIds,
          child_node_ids: treeNode.child_node_ids,
          state,
          compilation_completeness,
          missing_child_node_ids,
          routing_manifest: {
            prominent_concepts: result.prominent_concepts || [],
            rare_high_specificity_concepts: result.rare_high_specificity_concepts || [],
            structural_conditions: result.structural_conditions || [],
            entities: result.entities || [],
            restrictions_and_exceptions: result.restrictions_and_exceptions || [],
            distinctive_terminology: result.distinctive_terminology || [],
          },
        };
      } catch (error: any) {
        attempts++;
        console.warn(`Parent node ${node_id} compilation failed (attempt ${attempts}/3):`, error);
        if (attempts >= 3) {
          // Recover gracefully as DEGRADED using child manifests direct merger
          const mergedManifest = this.fallbackMergeManifests(activeChildren.map(c => c.routing_manifest));
          return {
            node_id,
            parent_id: treeNode.parent_id,
            title: treeNode.title,
            summary: `Parent node synthesized using simple fallback merger of sub-sections: ${treeNode.title}.`,
            evidence_ids: directEvidenceIds,
            all_descendant_evidence_ids: allDescendantEvidenceIds,
            child_node_ids: treeNode.child_node_ids,
            state: "DEGRADED",
            compilation_completeness,
            missing_child_node_ids: [...missing_child_node_ids, node_id],
            failure_metadata: {
              error_message: `Parent LLM synthesis failed: ${error?.message || String(error)}`,
              failed_at: new Date().toISOString(),
              attempt_count: attempts,
            },
            routing_manifest: mergedManifest,
          };
        }
      }
    }

    throw new Error(`Unreachable state in compileParent for node ${node_id}`);
  }

  /**
   * Simple non-LLM fallback merger of child manifests applying bounded retention strategy.
   */
  private static fallbackMergeManifests(manifests: RoutingManifest[]): RoutingManifest {
    const union = (key: keyof RoutingManifest, limit = 12): string[] => {
      const items = new Set<string>();
      manifests.forEach(m => {
        if (Array.isArray(m[key])) {
          m[key].forEach(val => items.add(val));
        }
      });
      return Array.from(items).slice(0, limit);
    };

    return {
      prominent_concepts: union("prominent_concepts", 10),
      rare_high_specificity_concepts: union("rare_high_specificity_concepts", 12), // slightly larger limit to ensure we don't prune rare concepts
      structural_conditions: union("structural_conditions", 10),
      entities: union("entities", 8),
      restrictions_and_exceptions: union("restrictions_and_exceptions", 10),
      distinctive_terminology: union("distinctive_terminology", 12),
    };
  }

  private static emptyRoutingManifest(): RoutingManifest {
    return {
      prominent_concepts: [],
      rare_high_specificity_concepts: [],
      structural_conditions: [],
      entities: [],
      restrictions_and_exceptions: [],
      distinctive_terminology: [],
    };
  }

  private static validateLLMResponse(nodeId: string, result: any): void {
    if (!result) {
      throw new Error(`[Schema Validation Error] Node ID: ${nodeId} - LLM returned null or empty result.`);
    }
    if (typeof result.summary !== "string" || !result.summary.trim()) {
      throw new Error(`[Schema Validation Error] Node ID: ${nodeId} - Missing or empty 'summary' field.`);
    }
    const arrayFields = [
      "prominent_concepts",
      "rare_high_specificity_concepts",
      "structural_conditions",
      "entities",
      "restrictions_and_exceptions",
      "distinctive_terminology"
    ];
    for (const field of arrayFields) {
      if (result[field] === undefined) {
        throw new Error(`[Schema Validation Error] Node ID: ${nodeId} - Missing field '${field}'.`);
      }
      if (!Array.isArray(result[field])) {
        throw new Error(`[Schema Validation Error] Node ID: ${nodeId} - Field '${field}' is not an array.`);
      }
    }
  }

  /**
   * Dynamic converter that builds a legacy flat SemanticMap representation from our compiled HierarchicalSemanticMap.
   * This guarantees 100% backward compatibility with components expecting flat maps.
   */
  static flattenToLegacyMap(hMap: HierarchicalSemanticMap): SemanticMap {
    const flatMap: SemanticMap = {};
    
    // Process sections (level 1) and subsections (level 2) to build flat entries
    Object.values(hMap.nodes).forEach(node => {
      if (node.parent_id === null) return; // Skip Document Root at flat level

      const key = node.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .substring(0, 50);

      // Union all concepts, conditions, and terms for the flat index
      const concepts = Array.from(new Set([
        ...(node.routing_manifest?.prominent_concepts || []),
        ...(node.routing_manifest?.rare_high_specificity_concepts || []),
        ...(node.routing_manifest?.structural_conditions || []),
        ...(node.routing_manifest?.distinctive_terminology || []),
      ])).slice(0, 15);

      flatMap[key] = {
        description: node.summary || `Summary for: ${node.title}`,
        concepts,
        evidence_ids: node.all_descendant_evidence_ids || [],
      };
    });

    return flatMap;
  }
}
