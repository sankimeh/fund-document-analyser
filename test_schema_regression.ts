import { CoverageValidator } from "./server/compilation/coverage_validator.js";
import { EvidenceUnit, SemanticMap } from "./server/models/index.js";

async function runRegressionTests() {
  console.log("==========================================");
  console.log("RUNNING SCHEMA VALIDATION REGRESSION TESTS");
  console.log("==========================================\n");

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      testPassed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      testFailed++;
    }
  }

  // Set up mock evidence units
  const mockEvidence: EvidenceUnit[] = [
    {
      evidence_id: "E_001",
      document_id: "DOC_TEST",
      fund_id: "FUND_TEST",
      page: 1,
      type: "paragraph",
      text: "The redemption notice period is 30 days.",
      section: "Redemptions",
      subsection: "Notice Period",
    }
  ];

  // Test 1: Ensure CoverageValidator correctly ignores hierarchical_semantic_map key
  try {
    console.log("--- Test 1: Ignore hierarchical_semantic_map key without TypeError ---");
    
    const validMapWithHierarchy: SemanticMap = {
      "redemptions": {
        description: "Redemption notices and details.",
        concepts: ["Redemption"],
        evidence_ids: ["E_001"],
      }
    };
    
    // Inject the non-standard hierarchical_semantic_map property
    (validMapWithHierarchy as any).hierarchical_semantic_map = {
      root_node_id: "root",
      nodes: {
        "root": {
          node_id: "root",
          parent_id: null,
          title: "Root Node",
          summary: "Root Node Summary",
          evidence_ids: [],
          all_descendant_evidence_ids: ["E_001"],
          child_node_ids: [],
          state: "COMPLETED",
          compilation_completeness: 1.0,
          missing_child_node_ids: [],
          routing_manifest: {
            prominent_concepts: [],
            rare_high_specificity_concepts: [],
            structural_conditions: [],
            entities: [],
            restrictions_and_exceptions: [],
            distinctive_terminology: [],
          }
        }
      }
    };

    const { semanticMap, metrics } = await CoverageValidator.validateAndOptimize(mockEvidence, validMapWithHierarchy);
    
    assert(semanticMap !== null, "validateAndOptimize returned a result.");
    assert(metrics.total_evidence_units === 1, "Correct total evidence units counted.");
    assert(metrics.unclassified_evidence_units === 0, "No units left unclassified.");
    assert(
      (semanticMap as any).hierarchical_semantic_map !== undefined,
      "The hierarchical_semantic_map key was preserved successfully."
    );

  } catch (error: any) {
    console.error("Test 1 Failed unexpectedly:", error);
    testFailed++;
  }

  // Test 2: Ensure CoverageValidator catches other keys that are actually malformed
  try {
    console.log("\n--- Test 2: Catch actually malformed categories with custom Schema Validation Error ---");
    
    const malformedMap: SemanticMap = {
      "redemptions": {
        description: "Redemption notices.",
        concepts: ["Redemption"],
        // missing evidence_ids completely!
      } as any
    };

    await CoverageValidator.validateAndOptimize(mockEvidence, malformedMap);
    assert(false, "Should have thrown a descriptive schema validation error but didn't.");
  } catch (error: any) {
    console.log(`Caught expected error: "${error.message}"`);
    assert(
      error.message.includes("[Schema Validation Error]") && error.message.includes("missing 'evidence_ids'"),
      "Throws descriptive custom Schema Validation Error on missing evidence_ids."
    );
  }

  console.log("\n==========================================");
  console.log(`REGRESSION TEST SUMMARY: Passed ${testPassed}, Failed ${testFailed}`);
  console.log("==========================================");

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRegressionTests().catch((err) => {
  console.error("Unhandle regression test failure:", err);
  process.exit(1);
});
