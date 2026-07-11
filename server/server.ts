import express from "express";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { StorageService } from "./storage/index.js";

dotenv.config();

import { DocumentParser } from "./parsing/index.js";
import { SemanticMapBuilder } from "./compilation/semantic_map_builder.js";
import { FactExtractor } from "./compilation/fact_extractor.js";
import { CoverageValidator } from "./compilation/coverage_validator.js";
import { AdvisorQAService } from "./services/advisor_qa.js";
import { EvaluationService } from "./services/evaluation.js";
import { TelemetryService } from "./services/telemetry.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize express middlewares
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize storage (load seeded funds, build lexical indexes)
  console.log("Initializing Fund Database & Lexical Indexes...");
  await StorageService.initialize();

  // API Routes Go Here FIRST

  // 1. Get List of Compiled Documents/Funds
  app.get("/api/documents/list", (req, res) => {
    try {
      const docs = StorageService.getCompilations().map((c) => ({
        document_id: c.document_id,
        fund_id: c.fund_id,
        filename: c.filename,
        metrics: c.coverage_metrics,
        facts_count: c.structured_facts.length,
        evidence_count: c.evidence_units.length,
      }));
      res.json({ success: true, documents: docs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Fetch single compilation details
  app.get("/api/documents/:id", (req, res) => {
    try {
      const doc = StorageService.getCompilation(req.params.id);
      if (!doc) {
        return res.status(404).json({ success: false, error: "Document not found" });
      }
      res.json({ success: true, document: doc });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Compile/Ingest New Document (Accepts Base64 PDF or Text)
  app.post("/api/documents/compile", async (req, res) => {
    try {
      const { filename, fileContent, fundId, documentId, textContent } = req.body;

      if (!fundId || !documentId) {
        return res.status(400).json({ success: false, error: "Missing fundId or documentId" });
      }

      console.log(`Starting custom ingestion for file: ${filename} (Fund: ${fundId}, Doc: ${documentId})`);

      let evidenceUnits = [];

      if (textContent) {
        // Direct Text Paste
        evidenceUnits = await DocumentParser.parseStructuredText(textContent, documentId, fundId);
      } else if (fileContent) {
        // Base64 PDF Ingestion
        const buffer = Buffer.from(fileContent, "base64");
        evidenceUnits = await DocumentParser.parsePDF(buffer, documentId, fundId);
      } else {
        return res.status(400).json({ success: false, error: "No text or file content provided" });
      }

      if (evidenceUnits.length === 0) {
        return res.status(400).json({ success: false, error: "Parser could not extract any Evidence Units from the input." });
      }

      // Step 2: Semantic Map building
      const rawSemanticMap = await SemanticMapBuilder.buildSemanticMap(evidenceUnits);

      // Step 3: Coverage validation and secondary classification pass
      const { semanticMap, metrics } = await CoverageValidator.validateAndOptimize(evidenceUnits, rawSemanticMap);

      // Step 5: Structured Fact extraction
      const structuredFacts = await FactExtractor.extractStructuredFacts(evidenceUnits, fundId, documentId);

      // Save compiled document to storage
      StorageService.addCompilation({
        document_id: documentId,
        fund_id: fundId,
        filename: filename || "pasted_document.txt",
        evidence_units: evidenceUnits,
        semantic_map: semanticMap,
        hierarchical_semantic_map: (semanticMap as any).hierarchical_semantic_map,
        structured_facts: structuredFacts,
        coverage_metrics: metrics,
      });

      res.json({
        success: true,
        message: `Successfully compiled document into ${evidenceUnits.length} Evidence Units and ${structuredFacts.length} structured facts.`,
        document_id: documentId,
        metrics,
      });
    } catch (err: any) {
      console.error("Compilation endpoint failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3b. Diagnostic Extraction-only Endpoint
  app.post("/api/documents/diagnose", async (req, res) => {
    try {
      const { filename, fileContent, fundId = "DIAGNOSTIC_FUND", documentId = "DIAGNOSTIC_DOC" } = req.body;

      if (!fileContent) {
        return res.status(400).json({ success: false, error: "Missing fileContent" });
      }

      const buffer = Buffer.from(fileContent, "base64");
      const fileSize = buffer.length;
      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

      const startTime = Date.now();
      const response = await DocumentParser.parsePDFWithRawResponse(buffer, documentId, fundId);
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      const evidenceUnits = response.evidence_units || [];
      const qualityReport = response.quality_report || {};

      // Calculate counts by type
      const countByType: Record<string, number> = {};
      evidenceUnits.forEach((u: any) => {
        countByType[u.type] = (countByType[u.type] || 0) + 1;
      });

      // Calculate unique section/subsection counts
      const uniqueSections = new Set(evidenceUnits.map((u: any) => u.section).filter(Boolean));
      const uniqueSubsections = new Set(evidenceUnits.map((u: any) => u.subsection).filter(Boolean));

      // Slice first and last 20
      const mapUnit = (u: any) => ({
        evidence_id: u.evidence_id,
        page: u.page,
        section: u.section,
        subsection: u.subsection,
        type: u.type,
        text: u.text,
      });

      const first20 = evidenceUnits.slice(0, 20).map(mapUnit);
      const last20 = evidenceUnits.slice(-20).map(mapUnit);

      // Low confidence units count
      const lowConfidenceCount = evidenceUnits.filter((u: any) => {
        const conf = u.metadata?.confidence;
        return conf === "LOW_CONFIDENCE" || conf === "LOW" || (typeof conf === "number" && conf < 0.5);
      }).length;

      res.json({
        success: true,
        filename: filename || "diagnostic_document.pdf",
        file_size_bytes: fileSize,
        sha256: sha256,
        pdf_page_count: qualityReport.pages_processed || 0,
        extraction_duration_milliseconds: durationMs,
        evidence_unit_count: evidenceUnits.length,
        count_by_evidence_unit_type: countByType,
        unique_section_count: uniqueSections.size,
        unique_subsection_count: uniqueSubsections.size,
        first_20_evidence_units: first20,
        last_20_evidence_units: last20,
        paragraph_count: qualityReport.reconstructed_paragraphs !== undefined ? qualityReport.reconstructed_paragraphs : "NOT OBSERVABLE",
        heading_count: qualityReport.headings_detected !== undefined ? qualityReport.headings_detected : "NOT OBSERVABLE",
        table_count: qualityReport.tables_detected !== undefined ? qualityReport.tables_detected : "NOT OBSERVABLE",
        headers_removed: qualityReport.repeated_headers_removed !== undefined ? qualityReport.repeated_headers_removed : "NOT OBSERVABLE",
        footers_removed: qualityReport.repeated_footers_removed !== undefined ? qualityReport.repeated_footers_removed : "NOT OBSERVABLE",
        low_confidence_count: lowConfidenceCount,
      });
    } catch (err: any) {
      console.error("Diagnostic endpoint failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Delete Compilation
  app.delete("/api/documents/:id", (req, res) => {
    try {
      StorageService.deleteCompilation(req.params.id);
      res.json({ success: true, message: "Document deleted successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Ask advisor question across selected funds (Route Planning -> 3 Parallel Routes -> Union -> Judge -> Grounded Answer)
  app.post("/api/qa", async (req, res) => {
    try {
      const { question, fundIds } = req.body;

      if (!question || !fundIds || !Array.isArray(fundIds) || fundIds.length === 0) {
        return res.status(400).json({ success: false, error: "Question and fundIds are required parameters." });
      }

      const response = await AdvisorQAService.askQuestion(question, fundIds);
      res.json({ success: true, data: response });
    } catch (err: any) {
      console.error("QA endpoint failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Run Evaluation Suite
  app.post("/api/evaluation/run", async (req, res) => {
    try {
      const results = await EvaluationService.runFullEvaluation();
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Get Evaluation history
  app.get("/api/evaluation/history", (req, res) => {
    try {
      const history = StorageService.getEvaluationResults();
      const testCases = StorageService.getEvaluationTestCases();
      res.json({ success: true, history, test_cases: testCases });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. Get Telemetry Summary
  app.get("/api/telemetry/summary", (req, res) => {
    try {
      const { compilationId, questionId } = req.query;
      const summary = TelemetryService.getSummary({
        compilationId: compilationId as string,
        questionId: questionId as string,
      });
      res.json({ success: true, summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. Get Raw Telemetry Logs
  app.get("/api/telemetry/logs", (req, res) => {
    try {
      const { compilationId, questionId } = req.query;
      const logs = TelemetryService.getLogs({
        compilationId: compilationId as string,
        questionId: questionId as string,
      });
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. Clear Telemetry Logs
  app.post("/api/telemetry/clear", (req, res) => {
    try {
      TelemetryService.clearLogs();
      res.json({ success: true, message: "Telemetry logs cleared successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware setup for Development vs Production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start custom server:", err);
});
