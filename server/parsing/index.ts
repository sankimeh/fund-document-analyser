import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { EvidenceUnit } from "../models/index.js";

export class DocumentParser {
  /**
   * Parse a PDF buffer into structured Evidence Units using layout-aware Python extractor
   */
  static async parsePDF(
    pdfBuffer: Buffer,
    documentId: string,
    fundId: string
  ): Promise<EvidenceUnit[]> {
    const response = await this.parsePDFWithRawResponse(pdfBuffer, documentId, fundId);
    const evidenceUnits: EvidenceUnit[] = response.evidence_units;

    if (!evidenceUnits || evidenceUnits.length === 0) {
      throw new Error("Empty or image-only PDF extraction failed. No readable text found.");
    }

    return evidenceUnits;
  }

  /**
   * Parse a PDF buffer into structured Evidence Units and quality metrics using layout-aware Python extractor
   */
  static async parsePDFWithRawResponse(
    pdfBuffer: Buffer,
    documentId: string,
    fundId: string
  ): Promise<{ success: boolean; quality_report: any; evidence_units: EvidenceUnit[] }> {
    console.log(`Parsing PDF for Fund: ${fundId}, Document: ${documentId} (Layout-Aware)`);
    
    // Create a temporary file to write the PDF buffer
    const tempDir = "/tmp";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `temp_${documentId}_${Date.now()}.pdf`);
    
    try {
      await fs.promises.writeFile(tempFilePath, pdfBuffer);
    } catch (err: any) {
      throw new Error(`Failed to write temporary PDF file for parsing: ${err.message || err}`);
    }

    let stdoutData = "";
    let stderrData = "";

    try {
      const pythonScriptPath = path.join(process.cwd(), "server/parsing/pdf_extractor.py");
      const pythonProcess = spawn("python3", [
        pythonScriptPath,
        tempFilePath,
        documentId,
        fundId
      ]);

      pythonProcess.stdout.on("data", (chunk) => {
        stdoutData += chunk.toString();
      });

      pythonProcess.stderr.on("data", (chunk) => {
        stderrData += chunk.toString();
      });

      let settled = false;
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        pythonProcess.on("error", (err) => {
          if (!settled) {
            settled = true;
            reject(new Error(`Failed to spawn Python process: ${err.message}`));
          }
        });

        pythonProcess.on("close", (code) => {
          if (!settled) {
            settled = true;
            resolve(code);
          }
        });
      });

      if (exitCode !== 0) {
        throw new Error(`Python extractor failed with exit code ${exitCode}. Stderr: ${stderrData}`);
      }
    } finally {
      // Clean up temporary file
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch (cleanupErr) {
        console.warn("Failed to clean up temporary PDF file:", cleanupErr);
      }
    }

    let response;
    try {
      response = JSON.parse(stdoutData.trim());
    } catch (jsonErr: any) {
      throw new Error(`Failed to parse Python extractor JSON output: ${jsonErr.message}. Raw stdout: ${stdoutData}`);
    }

    if (!response.success) {
      throw new Error(`Python extractor failed: ${response.error || "Unknown error"}`);
    }

    return response;
  }

  /**
   * Parses structured or seeded text into Evidence Units with layout awareness.
   */
  static parseStructuredText(
    text: string,
    documentId: string,
    fundId: string
  ): Promise<EvidenceUnit[]> {
    const evidenceUnits: EvidenceUnit[] = [];
    
    // Split the text into pages
    const pageSplits = text.split(/---PAGE_START_(\d+)---/);
    
    let currentPageNum = 1;
    let currentSection = "Introduction";
    let currentSubsection = "General";
    let evidenceCounter = 1;

    // Keep track of parent heading hierarchy
    const heading_hierarchy: string[] = ["Introduction", "General"];

    const saveCurrentBlock = (blockLines: string[], blockType: EvidenceUnit["type"]) => {
      if (blockLines.length === 0) return;
      const blockText = blockLines.join("\n");
      
      // Refine block type based on heuristics
      let finalType = blockType;
      if (blockText.includes("|") && blockText.split("\n").length > 1) {
        finalType = "table";
      } else if (/^[*•\-\d+\.]/.test(blockText)) {
        finalType = "list";
      } else if (/^(Footnote|\*|\[\d+\])/i.test(blockText)) {
        finalType = "footnote";
      }

      // 1. Build Table Context
      let table_context: EvidenceUnit["table_context"] = undefined;
      if (finalType === "table") {
        const tableLines = blockText.split("\n").filter(l => l.includes("|"));
        if (tableLines.length > 0) {
          const firstLine = tableLines[0];
          const headers = firstLine.split("|").map(h => h.trim()).filter(h => h.length > 0);
          table_context = {
            headers,
            title: `Table under ${currentSection} - ${currentSubsection}`,
          };
        }
      }

      // 2. Build Footnote relationships
      let footnote_relationships: EvidenceUnit["footnote_relationships"] = undefined;
      if (finalType === "footnote") {
        const markerMatch = blockText.match(/^\[(\d+)\]|^Footnote\s*(\d+)|^\*/i);
        const marker = markerMatch ? (markerMatch[1] || markerMatch[2] || "*") : "*";
        const target_evidence_ids: string[] = [];
        // Look back for a matching superscript or bracket in text
        evidenceUnits.forEach(prev => {
          if (prev.page === currentPageNum && prev.text.includes(marker)) {
            target_evidence_ids.push(prev.evidence_id);
          }
        });
        footnote_relationships = {
          target_evidence_ids,
          footnote_number: marker,
        };
      }

      evidenceUnits.push({
        evidence_id: `E_${documentId}_${evidenceCounter++}`,
        document_id: documentId,
        fund_id: fundId,
        page: currentPageNum,
        section: currentSection,
        subsection: currentSubsection,
        type: finalType,
        text: blockText,
        heading_hierarchy: [...heading_hierarchy],
        table_context,
        footnote_relationships,
      });
    };

    // The split will alternate: [pre-content, "1", "page 1 text", "2", "page 2 text", ...]
    for (let i = 0; i < pageSplits.length; i++) {
      const part = pageSplits[i]?.trim();
      if (!part) continue;

      if (/^\d+$/.test(part)) {
        currentPageNum = parseInt(part, 10);
        continue;
      }

      // We are in page text content
      const lines = part.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      
      let currentBlock: string[] = [];
      let blockType: EvidenceUnit["type"] = "paragraph";

      const flushBlock = () => {
        saveCurrentBlock(currentBlock, blockType);
        currentBlock = [];
        blockType = "paragraph";
      };

      for (const line of lines) {
        // Detect section headings
        const isSection = /^(SECTION\s+\d+|ARTICLE\s+[IVXLCDM\d]+|CHAPTER\s+\d+|APPENDIX\s+[A-Z]|\d+\.\s+[A-Z])/i.test(line) || 
          (line === line.toUpperCase() && line.length > 4 && line.length < 65 && !line.endsWith(".") && /^[A-Z\s\d:&,\(\)\-\[\]]+$/.test(line));
        
        const isSubSection = !isSection && (/^(\d+\.\d+|[A-Z]\.\s+|[a-z]\)\s+|Notice\s+Period|Performance\s+Fees|Lock-in\s+Period|Portfolio\s+Liquidity|Dealing\s+Frequency|Management\s+Fee|Performance\s+Fee)/i.test(line) ||
          (line.length > 4 && line.length < 50 && /^[A-Z]/.test(line) && !line.endsWith(".") && !line.endsWith(",") && !line.endsWith(";")));

        if (isSection) {
          flushBlock();
          currentSection = line;
          currentSubsection = "General";
          heading_hierarchy[0] = currentSection;
          heading_hierarchy[1] = currentSubsection;
          heading_hierarchy.length = 2; // truncate extra sublevels

          // Header unit
          evidenceUnits.push({
            evidence_id: `E_${documentId}_${evidenceCounter++}`,
            document_id: documentId,
            fund_id: fundId,
            page: currentPageNum,
            section: currentSection,
            subsection: currentSubsection,
            type: "header",
            text: line,
            heading_hierarchy: [...heading_hierarchy],
          });
        } else if (isSubSection) {
          flushBlock();
          currentSubsection = line;
          heading_hierarchy[1] = currentSubsection;
          heading_hierarchy.length = 2;

          // Header unit
          evidenceUnits.push({
            evidence_id: `E_${documentId}_${evidenceCounter++}`,
            document_id: documentId,
            fund_id: fundId,
            page: currentPageNum,
            section: currentSection,
            subsection: currentSubsection,
            type: "header",
            text: line,
            heading_hierarchy: [...heading_hierarchy],
          });
        } else if (line.includes("|") || line.startsWith("+---")) {
          if (blockType !== "table" && currentBlock.length > 0) {
            flushBlock();
          }
          blockType = "table";
          currentBlock.push(line);
        } else if (/^[*•\-\d+\.]/.test(line)) {
          if (blockType !== "list" && currentBlock.length > 0) {
            flushBlock();
          }
          blockType = "list";
          currentBlock.push(line);
        } else if (line.startsWith("[") || line.startsWith("*") || line.toLowerCase().startsWith("footnote")) {
          if (blockType !== "footnote" && currentBlock.length > 0) {
            flushBlock();
          }
          blockType = "footnote";
          currentBlock.push(line);
        } else {
          if (blockType !== "paragraph" && currentBlock.length > 0) {
            flushBlock();
          }
          blockType = "paragraph";
          currentBlock.push(line);
        }
      }

      flushBlock();
    }

    return Promise.resolve(evidenceUnits);
  }

  /**
   * Helper to build a hierarchical DocumentTree from flat EvidenceUnits
   */
  static buildDocumentTree(
    evidenceUnits: EvidenceUnit[],
    documentId: string,
    fundId: string
  ): any {
    const nodes: Record<string, any> = {};
    const rootNodeId = `tree_${documentId}_root`;

    // Initialize root
    nodes[rootNodeId] = {
      node_id: rootNodeId,
      title: "Document Root",
      level: 0,
      parent_id: null,
      child_node_ids: [],
      evidence_ids: [],
    };

    const sectionMap = new Map<string, string>();
    const subsectionMap = new Map<string, string>();

    evidenceUnits.forEach((unit) => {
      if (unit.type === "header") return;

      const secTitle = unit.section || "Introduction";
      const subTitle = unit.subsection || "General";

      // 1. Get or create section node
      let secNodeId = sectionMap.get(secTitle);
      if (!secNodeId) {
        secNodeId = `tree_${documentId}_sec_${sectionMap.size + 1}`;
        sectionMap.set(secTitle, secNodeId);
        nodes[secNodeId] = {
          node_id: secNodeId,
          title: secTitle,
          level: 1,
          parent_id: rootNodeId,
          child_node_ids: [],
          evidence_ids: [],
        };
        nodes[rootNodeId].child_node_ids.push(secNodeId);
      }

      // 2. Get or create subsection node
      const subKey = `${secTitle}|${subTitle}`;
      let subNodeId = subsectionMap.get(subKey);
      if (!subNodeId) {
        subNodeId = `tree_${documentId}_sub_${subsectionMap.size + 1}`;
        subsectionMap.set(subKey, subNodeId);
        nodes[subNodeId] = {
          node_id: subNodeId,
          title: subTitle,
          level: 2,
          parent_id: secNodeId,
          child_node_ids: [],
          evidence_ids: [],
        };
        nodes[secNodeId].child_node_ids.push(subNodeId);
      }

      // Add evidence ID to the subsection node
      nodes[subNodeId].evidence_ids.push(unit.evidence_id);
    });

    return {
      document_id: documentId,
      fund_id: fundId,
      root_node_id: rootNodeId,
      nodes,
    };
  }
}
