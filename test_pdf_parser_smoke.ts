import { DocumentParser } from "./server/parsing/index.js";
import { SemanticMapBuilder } from "./server/compilation/semantic_map_builder.js";

// A valid minimal 1-page PDF containing the text "Hello World"
const validPDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 45 >>
stream
BT /F1 12 Tf 70 700 Td (Hello World) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000282 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
377
%%EOF
`
);

// An empty/image-only PDF containing no text streams at all
const emptyPDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000213 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
263
%%EOF
`
);

async function runSmokeTests() {
  console.log("==========================================");
  console.log("RUNNING PDF PARSER SMOKE TESTS");
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

  // 1. Test Valid PDF Parser Extraction
  try {
    console.log("--- Test 1: Real PDF Page Text Extraction ---");
    const evidenceUnits = await DocumentParser.parsePDF(validPDF, "DOC_SMOKE", "FUND_SMOKE");
    
    assert(evidenceUnits.length > 0, "EvidenceUnits are non-empty after parsing.");
    if (evidenceUnits.length > 0) {
      const firstUnit = evidenceUnits[0];
      console.log(`Extracted Text Sample: "${firstUnit.text}"`);
      assert(firstUnit.text.includes("Hello World"), "Page text extraction successfully retrieved 'Hello World'.");
    }

    // 2. Test DocumentTree Generation
    console.log("\n--- Test 2: DocumentTree Production ---");
    const docTree = DocumentParser.buildDocumentTree(evidenceUnits, "DOC_SMOKE", "FUND_SMOKE");
    assert(docTree !== null && typeof docTree === "object", "DocumentTree is produced successfully.");
    assert(docTree.root_node_id !== undefined, "DocumentTree has a valid root_node_id.");
    assert(Object.keys(docTree.nodes).length > 0, "DocumentTree nodes collection is non-empty.");
    console.log("Produced Tree Nodes:", Object.keys(docTree.nodes));

    // 3. Test Hierarchical Compilation Ingestion
    console.log("\n--- Test 3: Hierarchical Ingestion Pipeline ---");
    // Call buildSemanticMap, which internally compiles the DocumentTree
    const semanticMap = await SemanticMapBuilder.buildSemanticMap(evidenceUnits);
    assert(semanticMap !== null && typeof semanticMap === "object", "SemanticMapBuilder successfully runs on extracted units.");
    const hasHierarchical = "hierarchical_semantic_map" in semanticMap || (semanticMap as any).hierarchical_semantic_map !== undefined;
    assert(hasHierarchical, "SemanticMap has hierarchical_semantic_map attached.");

  } catch (error: any) {
    console.error("Test 1-3 Encountered Unexpected Error:", error);
    testFailed += 3;
  }

  // 4. Test Empty / Image-Only PDF explicitly fails
  try {
    console.log("\n--- Test 4: Empty / Image-Only PDF explicit failure ---");
    await DocumentParser.parsePDF(emptyPDF, "DOC_EMPTY", "FUND_EMPTY");
    assert(false, "Parsing empty/image-only PDF should have failed but silently succeeded.");
  } catch (error: any) {
    console.log(`Caught expected error: "${error.message}"`);
    assert(
      error.message.includes("Empty or image-only PDF extraction failed"),
      "Empty or image-only PDF extraction throws explicit failure error message."
    );
  }

  console.log("\n==========================================");
  console.log(`SMOKE TEST SUMMARY: Passed ${testPassed}, Failed ${testFailed}`);
  console.log("==========================================");

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSmokeTests().catch((err) => {
  console.error("Unhandle rejection in smoke test:", err);
  process.exit(1);
});
