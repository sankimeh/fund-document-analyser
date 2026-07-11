import React, { useState } from "react";
import { DocumentMeta } from "../types.js";
import { Upload, Trash2, CheckCircle2, AlertCircle, FileText, Database, Layers } from "lucide-react";
import { motion } from "motion/react";

interface DocumentManagerProps {
  documents: DocumentMeta[];
  onRefresh: () => void;
  onSelectDoc: (id: string) => void;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({
  documents,
  onRefresh,
  onSelectDoc,
}) => {
  const [activeTab, setActiveTab] = useState<"list" | "compile">("list");
  const [fundId, setFundId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [filename, setFilename] = useState("");
  const [textContent, setTextContent] = useState("");
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    
    // Auto populate IDs based on filename
    const cleanName = file.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "_");
    setFundId(`FUND_${cleanName.toUpperCase().slice(0, 8)}`);
    setDocumentId(`DOC_${cleanName.toUpperCase().slice(0, 8)}`);

    const reader = new FileReader();
    if (file.type === "application/pdf") {
      reader.onload = () => {
        const result = reader.result as string;
        // Extract base64 part
        const base64 = result.split(",")[1];
        setFileBase64(base64);
        setTextContent("");
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        setTextContent(reader.result as string);
        setFileBase64(null);
      };
      reader.readAsText(file);
    }
  };

  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundId || !documentId) {
      setStatus({ type: "error", message: "Please provide both Fund ID and Document ID." });
      return;
    }
    if (!textContent && !fileBase64) {
      setStatus({ type: "error", message: "Please upload a file or paste document text." });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/documents/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: filename || "pasted_text.txt",
          fileContent: fileBase64,
          textContent: textContent || undefined,
          fundId,
          documentId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setStatus({
          type: "success",
          message: `${data.message} Coverage: ${(data.metrics.indexed_evidence_units / data.metrics.total_evidence_units * 100).toFixed(1)}%`,
        });
        // Reset state
        setTextContent("");
        setFileBase64(null);
        setFilename("");
        setFundId("");
        setDocumentId("");
        onRefresh();
      } else {
        setStatus({ type: "error", message: data.error || "Failed to compile document." });
      }
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this compiled document? This will remove all Evidence Units and facts.")) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-slate-900 rounded-2xl overflow-hidden h-full flex flex-col shadow-xl">
      {/* Header bar */}
      <div className="flex justify-between items-center bg-slate-950 p-4 border-b border-slate-900">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-blue-500 animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-wider text-slate-300 font-bold">
            Evidence Pools
          </span>
        </div>
        <div className="flex space-x-1.5">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-colors ${
              activeTab === "list"
                ? "bg-slate-800 text-blue-400 border border-slate-700/60 font-bold"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Pools
          </button>
          <button
            onClick={() => setActiveTab("compile")}
            className={`px-2.5 py-1 text-[10px] font-mono rounded-lg transition-colors ${
              activeTab === "compile"
                ? "bg-slate-800 text-blue-400 border border-slate-700/60 font-bold"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            + Ingest
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "list" ? (
          <div className="space-y-3.5">
            {documents.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                No compiled documents available. Seed default funds or ingest a new one.
              </div>
            ) : (
              documents.map((doc) => {
                const pct = (doc.metrics.indexed_evidence_units / doc.metrics.total_evidence_units) * 100;
                return (
                  <motion.div
                    key={doc.document_id}
                    onClick={() => onSelectDoc(doc.document_id)}
                    className="p-3 bg-slate-950/70 rounded-xl border border-slate-900 hover:border-blue-500/30 transition-all cursor-pointer group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 transition-colors" />
                        <span className="text-slate-200 font-medium text-xs truncate max-w-[150px]">
                          {doc.filename}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleDelete(doc.document_id, e)}
                        className="p-1 text-slate-600 hover:text-rose-400 rounded-md hover:bg-slate-900 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-2 font-mono text-[9px] text-slate-400">
                      <div>
                        <span className="text-slate-600">Fund ID:</span>{" "}
                        <span className="text-slate-300 font-bold">{doc.fund_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Units:</span>{" "}
                        <span className="text-slate-300">{doc.evidence_count}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Facts:</span>{" "}
                        <span className="text-slate-300">{doc.facts_count}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">Avg Map:</span>{" "}
                        <span className="text-slate-300">
                          {doc.metrics.average_mappings_per_evidence_unit}
                        </span>
                      </div>
                    </div>

                    {/* Progress representation */}
                    <div className="mt-2.5">
                      <div className="flex justify-between items-center text-[9px] font-mono mb-1 text-slate-500">
                        <span>Coverage</span>
                        <span className="text-blue-400 font-bold">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        ) : (
          <form onSubmit={handleCompile} className="space-y-3.5 font-mono text-[11px]">
            <div>
              <label className="block text-slate-500 mb-1">Fund Identifier *</label>
              <input
                type="text"
                placeholder="e.g. FUND_ALPHA"
                value={fundId}
                onChange={(e) => setFundId(e.target.value.toUpperCase())}
                className="w-full bg-slate-950/80 border border-slate-900 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-blue-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Document Identifier *</label>
              <input
                type="text"
                placeholder="e.g. DOC_ALPHA"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value.toUpperCase())}
                className="w-full bg-slate-950/80 border border-slate-900 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-blue-500/50"
                required
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Source Document Ingestion *</label>
              <div className="border border-dashed border-slate-800 rounded-xl p-4 bg-slate-950/30 text-center hover:border-slate-700 transition-colors relative cursor-pointer">
                <input
                  type="file"
                  accept=".txt,.pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="w-4 h-4 text-slate-500 mx-auto mb-2" />
                <span className="text-[10px] text-slate-500 block">
                  {filename ? `Selected: ${filename}` : "Upload PDF or Text"}
                </span>
              </div>
            </div>

            <div className="text-center text-slate-600 font-bold text-[8px] uppercase tracking-wider">
              - OR PASTE RAW CONTENT BELOW -
            </div>

            <div>
              <textarea
                placeholder="Paste prospectus sections or tables here..."
                value={textContent}
                onChange={(e) => {
                  setTextContent(e.target.value);
                  setFileBase64(null);
                }}
                rows={4}
                className="w-full bg-slate-950/80 border border-slate-900 rounded-lg p-2 text-slate-200 outline-none focus:border-blue-500/50 font-mono text-[10px]"
              />
            </div>

            {status && (
              <div
                className={`p-2 rounded-lg text-[10px] flex items-start space-x-1 ${
                  status.type === "success"
                    ? "bg-blue-950/30 border border-blue-900/50 text-blue-300"
                    : "bg-rose-950/30 border border-rose-900/50 text-rose-300"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-blue-400" />
                ) : (
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-rose-400" />
                )}
                <span>{status.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 font-bold py-2 px-3 rounded-lg text-white cursor-pointer transition-colors flex items-center justify-center space-x-1"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{loading ? "Compiling..." : "Compile Document Map"}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
