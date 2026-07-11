import {
  SemanticMap,
  QueryPlan,
  EvidenceUnit,
  HierarchicalSemanticMap,
  SemanticMapNode,
} from "../models/index.js";
import { LLMProvider } from "../llm/gemini_provider.js";
import { Type } from "@google/genai";
import { LexicalIndex } from "../indexing/lexical_index.js";

export interface RouteAProvenance {
  evidence_id: string;
  traversed_path: string[];
  routing_signals: string[];
  method: "hierarchical_traversal" | "degraded_lexical_fallback" | "failed_lexical_fallback";
}

export interface TraversalSafeguards {
  maxDepth: number;
  maxVisited: number;
  maxEvidenceCandidates: number;
  relevanceThreshold: number;
}

export class SemanticMapRetriever {
  /**
   * Route A: Matches the Query Plan against the Document Hierarchical Semantic Map
   * to perform true query-time recursive routing.
   */
  static async retrieve(
    hierarchicalMapOrNode: HierarchicalSemanticMap | SemanticMapNode | SemanticMap,
    queryPlan: QueryPlan,
    evidenceUnits: EvidenceUnit[],
    questionId?: string
  ): Promise<string[]> {
    console.log("Executing Route A: Hierarchical Semantic Map Query-Time Traversal...");

    // 1. Resolve Hierarchical Map
    let hMap: HierarchicalSemanticMap | null = null;
    if (typeof hierarchicalMapOrNode === "object" && hierarchicalMapOrNode !== null) {
      if ("root_node_id" in hierarchicalMapOrNode && "nodes" in hierarchicalMapOrNode) {
        hMap = hierarchicalMapOrNode as HierarchicalSemanticMap;
      } else if ("node_id" in hierarchicalMapOrNode && "routing_manifest" in hierarchicalMapOrNode) {
        const node = hierarchicalMapOrNode as SemanticMapNode;
        hMap = {
          root_node_id: node.node_id,
          nodes: { [node.node_id]: node },
        };
      } else if ("hierarchical_semantic_map" in hierarchicalMapOrNode) {
        hMap = (hierarchicalMapOrNode as any).hierarchical_semantic_map;
      }
    }

    // Fallback to legacy retrieval if no hierarchy is present
    if (!hMap) {
      console.warn("No hierarchical semantic map found. Falling back to legacy flat retrieval.");
      return this.legacyRetrieve(hierarchicalMapOrNode as SemanticMap, queryPlan, questionId);
    }

    // 2. Traversal Safeguards and Tracking Setup
    const safeguards: TraversalSafeguards = {
      maxDepth: 4,
      maxVisited: 20,
      maxEvidenceCandidates: 15,
      relevanceThreshold: 0.5,
    };

    let visitedNodesCount = 0;
    const matchedEvidenceIds = new Set<string>();
    const provenanceMap: Record<string, RouteAProvenance> = {};

    // 3. Define the recursive traversal function
    const traverse = async (
      nodeId: string,
      currentDepth: number,
      parentPath: string[],
      incomingSignals: string[] = []
    ): Promise<void> => {
      // Safeguard: visited count
      if (visitedNodesCount >= safeguards.maxVisited) {
        console.warn(`[Safeguard] Maximum visited nodes reached (${safeguards.maxVisited}). Halting traversal at node: ${nodeId}`);
        return;
      }
      visitedNodesCount++;

      // Safeguard: depth limit
      if (currentDepth > safeguards.maxDepth) {
        console.warn(`[Safeguard] Maximum depth reached (${safeguards.maxDepth}). Halting traversal at node: ${nodeId}`);
        return;
      }

      const node = hMap!.nodes[nodeId];
      if (!node) {
        console.warn(`Node ID ${nodeId} not found in Hierarchical Semantic Map.`);
        return;
      }

      const currentPath = [...parentPath, node.title];
      console.log(`[Traversal] Node: "${node.title}" (ID: ${nodeId}, Level: ${currentDepth}, State: ${node.state})`);

      // 4. Handle Failed / Blocked Subtrees with Lexical BM25 Fallback
      if (node.state === "FAILED" || node.state === "BLOCKED") {
        console.warn(`[Self-Healing] Subtree "${node.title}" (${nodeId}) is ${node.state}. Triggering failed lexical fallback...`);
        this.runScopedBM25Fallback(
          nodeId,
          hMap!,
          evidenceUnits,
          queryPlan,
          parentPath,
          "failed_lexical_fallback",
          matchedEvidenceIds,
          provenanceMap
        );
        return;
      }

      // 5. Handle Degraded Nodes (Missing child subtrees)
      if (node.state === "DEGRADED" && node.missing_child_node_ids && node.missing_child_node_ids.length > 0) {
        console.warn(`[Self-Healing] Subtree "${node.title}" is DEGRADED. Triggering fallback on ${node.missing_child_node_ids.length} missing child subtrees...`);
        node.missing_child_node_ids.forEach((missingCid) => {
          this.runScopedBM25Fallback(
            missingCid,
            hMap!,
            evidenceUnits,
            queryPlan,
            currentPath,
            "degraded_lexical_fallback",
            matchedEvidenceIds,
            provenanceMap
          );
        });
      }

      // 6. Check if this is a leaf node
      if (!node.child_node_ids || node.child_node_ids.length === 0) {
        console.log(`[Traversal] Reached Leaf Node: "${node.title}" (${nodeId}). Retrieving ${node.evidence_ids.length} direct evidence units.`);
        
        node.evidence_ids.forEach((eid) => {
          if (matchedEvidenceIds.size >= safeguards.maxEvidenceCandidates) return;
          matchedEvidenceIds.add(eid);
          provenanceMap[eid] = {
            evidence_id: eid,
            traversed_path: currentPath,
            routing_signals: incomingSignals.length > 0 ? incomingSignals : [node.title],
            method: "hierarchical_traversal",
          };
        });
        return;
      }

      // 7. Process child nodes of parent node
      const childNodes = node.child_node_ids
        .map((cid) => hMap!.nodes[cid])
        .filter((child): child is SemanticMapNode => !!child && child.state !== "FAILED" && child.state !== "BLOCKED");

      if (childNodes.length === 0) {
        console.warn(`[Traversal] Parent node "${node.title}" has no successfully compiled children.`);
        return;
      }

      // Format child node manifests to evaluate for relevance via structured LLM routing
      const childDataForLLM = childNodes.map((c) => ({
        node_id: c.node_id,
        title: c.title,
        summary: c.summary,
        routing_manifest: c.routing_manifest,
      }));

      const prompt = `
You are a high-precision investment semantic router.
Your objective is to evaluate the relevance of the following sub-sections under "${node.title}" against a Query Plan.

Query Plan:
- Intent: ${queryPlan.intent}
- Target: ${queryPlan.target}
- Concepts: ${queryPlan.concepts.join(", ")}
- Search Terms: ${queryPlan.search_terms.join(", ")}

Sub-Sections for Routing Evaluation:
${JSON.stringify(childDataForLLM, null, 2)}

For each sub-section, determine if it is relevant to answering the query.
- Score relevance from 0.0 to 1.0 based on matches in semantic concepts, summaries, structural conditions, entities, restrictions, and distinctive terminology.
- A branch is relevant (decision: true) if its score is >= ${safeguards.relevanceThreshold}.
- CRITICAL: Prioritize and preserve rare or high-specificity concepts (e.g. side-pockets, specific fees, lock-up exceptions, gating triggers) and structural conditions. If a query mentions or is related to a rare concept found in 'rare_high_specificity_concepts', that sub-section must receive a high score and decision: true, even if the general summary does not emphasize it.
- List specific keywords, concepts, or rules from the sub-section's Routing Manifest that triggered this match.
`;

      const scoringSchema = {
        type: Type.OBJECT,
        properties: {
          evaluations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                node_id: { type: Type.STRING },
                relevance_score: { type: Type.NUMBER, description: "Relevance score from 0.0 to 1.0." },
                routing_signals: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Matched concepts or conditions." },
                decision: { type: Type.BOOLEAN, description: "Whether to descend into this branch." },
              },
              required: ["node_id", "relevance_score", "routing_signals", "decision"],
            },
          },
        },
        required: ["evaluations"],
      };

      try {
        const result = await LLMProvider.generateStructured<any>(
          prompt,
          scoringSchema,
          "You are an expert investment index router executing recursive hierarchical routing.",
          {
            taskType: "HIERARCHICAL_ROUTING",
            questionId,
          }
        );

        const evaluations = result?.evaluations || [];
        console.log(`[Routing Decision] Evaluations under parent "${node.title}":`, JSON.stringify(evaluations, null, 2));

        for (const evalResult of evaluations) {
          if (evalResult.decision && evalResult.relevance_score >= safeguards.relevanceThreshold) {
            const childNode = childNodes.find((c) => c.node_id === evalResult.node_id);
            if (childNode) {
              console.log(`[Routing Decision] Descending into relevant child branch: "${childNode.title}" (${childNode.node_id}) with score ${evalResult.relevance_score}`);
              
              if (matchedEvidenceIds.size >= safeguards.maxEvidenceCandidates) {
                console.warn(`[Safeguard] Maximum evidence candidates limit reached (${safeguards.maxEvidenceCandidates}).`);
                break;
              }

              // Recurse into the relevant child branch
              await traverse(childNode.node_id, currentDepth + 1, currentPath, evalResult.routing_signals);
            }
          }
        }
      } catch (err) {
        console.error(`[Traversal Error] LLM routing decision failed at node "${node.title}". Falling back to uniform descent of all child nodes:`, err);
        // Fallback: recurse into all child nodes uniformly under error conditions
        for (const child of childNodes) {
          await traverse(child.node_id, currentDepth + 1, currentPath, ["LLM Route Fallback"]);
        }
      }
    };

    // 8. Initiate recursive traversal from the root node
    await traverse(hMap.root_node_id, 0, []);

    const resultList = Array.from(matchedEvidenceIds);
    // Attach provenance mapping to the list for downstream tracking/validation
    (resultList as any).provenance = provenanceMap;

    console.log(`[Hierarchical Traversal Finished] Visited ${visitedNodesCount} nodes. Retrieved ${resultList.length} evidence units.`);
    console.log("[Traversal Provenance]:", JSON.stringify(provenanceMap, null, 2));

    return resultList;
  }

  /**
   * Helper to run scoped BM25 Lexical search over a specific subtree.
   */
  private static runScopedBM25Fallback(
    subtreeNodeId: string,
    hMap: HierarchicalSemanticMap,
    evidenceUnits: EvidenceUnit[],
    queryPlan: QueryPlan,
    parentPath: string[],
    method: "degraded_lexical_fallback" | "failed_lexical_fallback",
    matchedEvidenceIds: Set<string>,
    provenanceMap: Record<string, RouteAProvenance>
  ): void {
    const subtreeNode = hMap.nodes[subtreeNodeId];
    if (!subtreeNode) return;

    const descendantIds = subtreeNode.all_descendant_evidence_ids || [];
    if (descendantIds.length === 0) return;

    // Filter evidence units strictly to this subtree
    const subtreeEvidence = evidenceUnits.filter((u) => descendantIds.includes(u.evidence_id));
    if (subtreeEvidence.length === 0) return;

    try {
      const miniIndex = new LexicalIndex(subtreeEvidence);
      const queryText = `${queryPlan.intent} ${queryPlan.target} ${queryPlan.concepts.join(" ")} ${queryPlan.search_terms.join(" ")}`;
      
      const searchResults = miniIndex.search(queryText, 5); // Scoped retrieval limit
      console.log(`[Self-Healing Fallback] BM25 found ${searchResults.length} units in subtree "${subtreeNode.title}"`);

      searchResults.forEach((res) => {
        if (matchedEvidenceIds.has(res.evidence_id)) return;
        matchedEvidenceIds.add(res.evidence_id);
        
        provenanceMap[res.evidence_id] = {
          evidence_id: res.evidence_id,
          traversed_path: [...parentPath, subtreeNode.title],
          routing_signals: ["Scoped BM25 Fallback", ...queryPlan.search_terms],
          method: method,
        };
      });
    } catch (err) {
      console.error(`[Self-Healing Fallback] LexicalIndex build or search failed for subtree "${subtreeNode.title}":`, err);
    }
  }

  /**
   * Legacy retrieval path, kept as robust fallback if no hierarchical structure is present.
   */
  private static async legacyRetrieve(
    semanticMap: SemanticMap,
    queryPlan: QueryPlan,
    questionId?: string
  ): Promise<string[]> {
    console.log("Executing Legacy Route A flat retrieval fallback...");
    const categories = Object.entries(semanticMap)
      .filter(([key]) => key !== "hierarchical_semantic_map")
      .map(([key, item]) => {
        if (!item) {
          throw new Error(`[Schema Validation Error] Category '${key}' is undefined.`);
        }
        return {
          key,
          description: item.description || `Automatic grouping for: ${key}`,
          concepts: item.concepts || [],
        };
      });

    const prompt = `
You are a high-precision investment semantic router.
Compare the following Query Plan against the fund document's Semantic Map entries. 
Identify which semantic categories are highly relevant to answering the query.

Query Plan:
- Intent: ${queryPlan.intent}
- Target: ${queryPlan.target}
- Concepts: ${queryPlan.concepts.join(", ")}

Semantic Map Entries:
${JSON.stringify(categories, null, 2)}

Select ONLY the category keys that are directly or supporting-level relevant to the advisor's target intent.
`;

    const schema = {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of relevant category keys from the semantic map.",
    };

    try {
      const selectedKeys = await LLMProvider.generateStructured<string[]>(
        prompt,
        schema,
        "You are an expert index router selecting relevant prospectus categories.",
        {
          taskType: "HIERARCHICAL_ROUTING",
          questionId,
        }
      );

      console.log("Legacy Route A selected keys:", selectedKeys);

      const matchedIds = new Set<string>();
      for (const key of selectedKeys) {
        const cat = semanticMap[key];
        if (cat && cat.evidence_ids) {
          cat.evidence_ids.forEach((id) => matchedIds.add(id));
        }
      }

      return Array.from(matchedIds);
    } catch (error) {
      console.error("Legacy Route A retrieval failed, returning empty list:", error);
      return [];
    }
  }
}
