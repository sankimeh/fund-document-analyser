import { useState, useEffect } from "react";
import { DocumentMeta } from "./types.js";
import { DocumentManager } from "./components/DocumentManager.js";
import { QAInterface } from "./components/QAInterface.js";
import { EvaluationSuite } from "./components/EvaluationSuite.js";
import {
  FileText,
  Activity,
  Award,
  BookOpen,
  FolderOpen,
  BrainCircuit,
  Search,
  Database
} from "lucide-react";

export default function App() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<"qa" | "eval">("qa");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents/list");
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to fetch documents list:", err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col overflow-x-hidden antialiased selection:bg-blue-500/30 selection:text-blue-300">
      {/* Top Bento Nav Header */}
      <header className="bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 border-b border-slate-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/10">
            <BrainCircuit className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              FundWise <span className="text-blue-500 font-mono">EvidenceEngine</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
              v2.4.0 • MULTI-ROUTE RETRIEVAL
            </p>
          </div>
        </div>

        {/* Status indicator & Workspace Tabs */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
            <span className="text-[10px] font-mono font-bold text-slate-300">COMPILATION: 100% COVERAGE</span>
          </div>

          <div className="flex p-1 bg-slate-900/60 rounded-xl border border-slate-800/80 font-mono text-[11px] shrink-0">
            <button
              onClick={() => setActiveWorkspace("qa")}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-bold ${
                activeWorkspace === "qa"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Advisor Workspace</span>
            </button>
            <button
              onClick={() => setActiveWorkspace("eval")}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-bold ${
                activeWorkspace === "eval"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>System Evaluation</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* Left Side: Document Compilation Panel */}
        <section className="lg:col-span-3 flex flex-col h-full min-h-[500px] lg:min-h-0">
          <DocumentManager
            documents={documents}
            onRefresh={fetchDocuments}
            onSelectDoc={(id) => setSelectedDocId(id)}
          />
        </section>

        {/* Right Side: Active Workspace */}
        <section className="lg:col-span-9 h-full flex flex-col">
          {activeWorkspace === "qa" ? (
            <QAInterface documents={documents} />
          ) : (
            <EvaluationSuite />
          )}
        </section>
      </main>

      {/* Bento Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center font-mono text-[9px] text-slate-600 flex flex-col sm:flex-row justify-between items-center gap-2 max-w-7xl w-full mx-auto">
        <span>PROTOTYPE AUDIT TERMINAL // 100% GROUNDED RETRIEVAL PATHS // NO VECTOR RAG</span>
        <span className="flex items-center space-x-1">
          <Database className="w-3.5 h-3.5 text-blue-500" />
          <span>COMPILE UNSTRUCTURED CONTRACTS TO DETERMINISTIC KNOWLEDGE SYSTEMS</span>
        </span>
      </footer>
    </div>
  );
}
