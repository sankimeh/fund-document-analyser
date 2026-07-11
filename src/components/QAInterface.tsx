import React, { useState } from "react";
import { DocumentMeta, QAResponse, UnionedEvidence } from "../types.js";
import {
  Search,
  BookOpen,
  Compass,
  AlertCircle,
  HelpCircle,
  FileCheck,
  ShieldCheck,
  Cpu,
  Bookmark,
  ExternalLink,
  GitMerge,
  ChevronRight,
  Info,
  Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface QAInterfaceProps {
  documents: DocumentMeta[];
}

export const QAInterface: React.FC<QAInterfaceProps> = ({ documents }) => {
  const [selectedFundIds, setSelectedFundIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QAResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<UnionedEvidence | null>(null);
  const [activeDiagTab, setActiveDiagTab] = useState<"plan" | "routes" | "judge" | "facts">("judge");

  const handleFundSelect = (fundId: string) => {
    setSelectedFundIds((prev) =>
      prev.includes(fundId) ? prev.filter((id) => id !== fundId) : [...prev, fundId]
    );
  };

  const handleQuickQuestion = (qText: string, fundIds: string[]) => {
    setQuestion(qText);
    setSelectedFundIds(fundIds);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFundIds.length === 0) {
      setError("Please select at least one investment fund.");
      return;
    }
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          fundIds: selectedFundIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResponse(data.data);
      } else {
        setError(data.error || "An error occurred during Q&A generation.");
      }
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const openCitationModal = (evidenceId: string) => {
    if (!response) return;
    const unit = response.unioned_evidence.find((u) => u.evidence_id === evidenceId);
    if (unit) {
      setSelectedCitation(unit);
    }
  };

  // Pre-seed some useful exploration questions
  const quickQuestions = [
    {
      label: "Redemption notice",
      text: "What is the redemption notice period for the Global Tech Growth Fund?",
      funds: ["FUND_001"],
    },
    {
      label: "Fee Comparison",
      text: "Compare the management fees and performance fees of Global Tech Growth Fund and Stable Income Bond Fund.",
      funds: ["FUND_001", "FUND_002"],
    },
    {
      label: "Liquidity Disambiguation",
      text: "How does the portfolio liquidity management differ from client redemptions in Global Tech Growth Fund?",
      funds: ["FUND_001"],
    },
    {
      label: "Leverage Limit",
      text: "Are there any leverage limits or borrowing restrictions applied to the Stable Income Bond Fund?",
      funds: ["FUND_002"],
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
      {/* Search Input Section */}
      <div className="lg:col-span-12">
        <form onSubmit={handleSearch} className="bg-slate-900/60 backdrop-blur-md border border-slate-900 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
              Target Pool:
            </span>
            {documents.length === 0 ? (
              <span className="text-slate-500 font-mono text-[11px]">No active funds compiled yet.</span>
            ) : (
              documents.map((doc) => {
                const isSelected = selectedFundIds.includes(doc.fund_id);
                return (
                  <button
                    key={doc.document_id}
                    type="button"
                    onClick={() => handleFundSelect(doc.fund_id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-950/40 border-blue-500 text-blue-400 font-bold"
                        : "bg-slate-950/80 border-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {doc.filename.replace(".txt", "")} ({doc.fund_id})
                  </button>
                );
              })
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Ask natural-language questions (e.g. 'What is the redemption notice period?')..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-900 rounded-xl pl-10 pr-28 py-3 text-slate-200 text-xs outline-none focus:border-blue-500/50 font-sans"
            />
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
            <button
              type="submit"
              disabled={loading || selectedFundIds.length === 0}
              className="absolute right-2 top-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold px-4 py-1.5 rounded-lg text-[10px] uppercase font-mono transition-colors cursor-pointer"
            >
              {loading ? "Routing..." : "Query"}
            </button>
          </div>

          {/* Quick templates */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] font-mono text-slate-500">
            <span>Quick Queries:</span>
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickQuestion(q.text, q.funds)}
                className="hover:text-blue-400 hover:underline cursor-pointer"
              >
                [{q.label}]
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Answer Pane */}
      <div className="lg:col-span-7 flex flex-col space-y-4">
        {error && (
          <div className="bg-rose-950/30 border border-rose-900 text-rose-300 p-4 rounded-2xl flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-xs font-mono">{error}</span>
          </div>
        )}

        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-900 rounded-2xl p-5 flex-1 shadow-xl flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center pb-3 border-b border-slate-900 mb-4">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-mono font-bold uppercase text-slate-300 tracking-wider">
                Grounded Advisor Response
              </h2>
            </div>
            {response && (
              <div className="flex items-center space-x-1 font-mono text-[9px] bg-blue-950/40 border border-blue-900/50 px-2 py-0.5 rounded text-blue-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Evidence Grounded</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-slate-300 text-sm leading-relaxed">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500 space-y-3">
                <Compass className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="font-mono text-[10px] text-slate-400 text-center max-w-xs">
                  Executing multi-route parallel retrieval and LLM evidence audit...
                </span>
              </div>
            ) : response ? (
              <div className="space-y-4">
                {/* Grounded response with parsed citations */}
                <div className="prose prose-invert max-w-none text-slate-300 text-[11px] font-sans leading-relaxed bg-blue-950/5 border border-blue-500/10 rounded-xl p-4">
                  {response.grounded_answer.answer.split(/(\[Page\s+\d+,\s+E_.*?\])/).map((part, i) => {
                    const match = part.match(/\[Page\s+(\d+),\s+(E_.*?)\]/);
                    if (match) {
                      const [_, page, evidenceId] = match;
                      return (
                        <button
                          key={i}
                          onClick={() => openCitationModal(evidenceId)}
                          className="mx-1 px-1.5 py-0.5 bg-blue-950/50 border border-blue-900/50 hover:border-blue-400 rounded text-[9px] font-mono text-blue-400 transition-colors inline-flex items-center cursor-pointer"
                        >
                          <Bookmark className="w-2.5 h-2.5 mr-0.5 text-blue-500" />
                          Page {page}
                        </button>
                      );
                    }
                    return part;
                  })}
                </div>

                {/* Citation list */}
                <div className="mt-8 pt-6 border-t border-slate-900">
                  <h3 className="text-slate-400 font-mono text-[9px] uppercase tracking-widest mb-3 flex items-center">
                    <FileCheck className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    PROVENANCE AUDIT TRAIL ({response.grounded_answer.citations.length} Sources)
                  </h3>
                  <div className="space-y-2">
                    {response.grounded_answer.citations.map((cit, idx) => (
                      <div
                        key={idx}
                        onClick={() => openCitationModal(cit.evidence_id)}
                        className="p-2.5 bg-slate-950/40 border border-slate-900 hover:border-blue-500/30 rounded-xl cursor-pointer flex items-start justify-between group transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2 text-[10px] font-mono">
                            <span className="text-blue-400 font-bold">{cit.fund_id}</span>
                            <span className="text-slate-700">|</span>
                            <span className="text-slate-300 truncate max-w-[200px]">{cit.section}</span>
                            <span className="text-slate-700">|</span>
                            <span className="text-slate-400">Page {cit.page}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-1 italic">
                            "{cit.text}"
                          </p>
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-blue-400 self-center transition-colors shrink-0 ml-2" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-slate-600 font-mono text-xs">
                <HelpCircle className="w-10 h-10 text-slate-700 mb-2" />
                <span>Submit a question to compile evidence and synthesize answer.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Traceable Diagnostics Panel */}
      <div className="lg:col-span-5">
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-900 rounded-2xl p-5 h-full shadow-xl flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center pb-3 border-b border-slate-900 mb-3">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-blue-500 animate-pulse" />
              <h2 className="text-xs font-mono font-bold uppercase text-slate-300 tracking-wider">
                System Diagnostics
              </h2>
            </div>
          </div>

          {response ? (
            <div className="flex-1 flex flex-col">
              {/* Tab navigation */}
              <div className="flex border-b border-slate-900 mb-3 text-[10px] font-mono">
                <button
                  onClick={() => setActiveDiagTab("plan")}
                  className={`pb-1.5 px-2 font-bold transition-all ${
                    activeDiagTab === "plan"
                      ? "border-b-2 border-blue-500 text-blue-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Query Plan
                </button>
                <button
                  onClick={() => setActiveDiagTab("routes")}
                  className={`pb-1.5 px-2 font-bold transition-all ${
                    activeDiagTab === "routes"
                      ? "border-b-2 border-blue-500 text-blue-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  3 Routes
                </button>
                <button
                  onClick={() => setActiveDiagTab("judge")}
                  className={`pb-1.5 px-2 font-bold transition-all ${
                    activeDiagTab === "judge"
                      ? "border-b-2 border-blue-500 text-blue-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  LLM Judge
                </button>
                <button
                  onClick={() => setActiveDiagTab("facts")}
                  className={`pb-1.5 px-2 font-bold transition-all ${
                    activeDiagTab === "facts"
                      ? "border-b-2 border-blue-500 text-blue-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Facts Checked
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1">
                {activeDiagTab === "plan" && (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <div className="text-blue-400 text-[9px] uppercase mb-1">Intent Classified</div>
                      <div className="text-slate-200 font-bold">{response.query_plan.intent}</div>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <div className="text-blue-400 text-[9px] uppercase mb-1">Target Parameter</div>
                      <div className="text-slate-200 font-bold">{response.query_plan.target}</div>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <div className="text-blue-400 text-[9px] uppercase mb-1">Extracted Concepts</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {response.query_plan.concepts.map((c, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-900 rounded text-slate-300 text-[9px]">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                      <div className="text-blue-400 text-[9px] uppercase mb-1">Lexical Terms</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {response.query_plan.search_terms.map((t, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-900 rounded text-blue-400 text-[9px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeDiagTab === "routes" && (
                  <div className="space-y-3 font-mono text-[11px]">
                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900 relative overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] mb-1 text-sky-400 uppercase font-bold">
                        <span>Route A: Semantic map matcher</span>
                        <span className="bg-sky-950/60 px-1.5 rounded">{response.route_a_ids.length} hits</span>
                      </div>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        LLM analyzed map categories, matching intent against specific document structure clusters.
                      </p>
                    </div>

                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900 relative overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] mb-1 text-emerald-400 uppercase font-bold">
                        <span>Route B: BM25 Inverted Lexical Index</span>
                        <span className="bg-emerald-950/60 px-1.5 rounded">{response.route_b_ids.length} hits</span>
                      </div>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        Pure lexical search scoring units against vocabulary and phrase frequencies in document base.
                      </p>
                    </div>

                    <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-900 relative overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] mb-1 text-purple-400 uppercase font-bold">
                        <span>Route C: Parameter Fact Store</span>
                        <span className="bg-purple-950/60 px-1.5 rounded">{response.route_c_ids.length} hits</span>
                      </div>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        Checked structured parameters extracted during offline compilation phase.
                      </p>
                    </div>

                    <div className="flex items-center justify-center p-3 border border-dashed border-slate-800 rounded-xl text-[10px] text-slate-500 space-x-1.5">
                      <GitMerge className="w-3.5 h-3.5 text-slate-500" />
                      <span>Evidence Union combined to {response.candidate_union_count} candidates.</span>
                    </div>
                  </div>
                )}

                {activeDiagTab === "judge" && (
                  <div className="space-y-3">
                    {response.unioned_evidence.map((unit) => {
                      const verdict = response.judge_verdicts[unit.evidence_id];
                      
                      return (
                        <div key={unit.evidence_id} className="bg-slate-950/50 p-3 rounded-xl border border-slate-900 text-[10px] font-mono">
                          <div className="flex items-start justify-between mb-1.5">
                            <span className="text-blue-400 font-bold">{unit.evidence_id}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                verdict?.classification === "DIRECTLY_RELEVANT"
                                  ? "bg-emerald-950/50 border border-emerald-900/50 text-emerald-300"
                                  : verdict?.classification === "SUPPORTING"
                                  ? "bg-sky-950/50 border border-sky-850/50 text-sky-300"
                                  : "bg-slate-900/50 border border-slate-850/50 text-slate-400"
                              }`}
                            >
                              {verdict?.classification || "UNGRADED"}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-1 text-[8px] text-slate-500 mb-1">
                            <span>Routes:</span>
                            {unit.retrieved_by.map((r, i) => (
                              <span key={i} className="bg-slate-900 px-1 rounded text-slate-400">
                                {r}
                              </span>
                            ))}
                          </div>

                          <p className="text-slate-300 line-clamp-2 text-[9px] italic bg-slate-900/30 p-1.5 rounded-lg border border-slate-900/50">
                            "{unit.text}"
                          </p>

                          <div className="mt-1.5 text-[9px] text-slate-400">
                            <span className="text-blue-400">Judge reason:</span> {verdict?.explanation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeDiagTab === "facts" && (
                  <div className="space-y-3 font-mono text-xs">
                    {response.matched_facts.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-[10px]">
                        No structured parameter facts matched for this question.
                      </div>
                    ) : (
                      response.matched_facts.map((fact) => (
                        <div key={fact.fact_id} className="bg-slate-950/50 p-3 rounded-xl border border-slate-900">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-blue-400 font-bold uppercase text-[9px]">
                              {fact.fact_type}
                            </span>
                            <span className="text-slate-600 text-[9px]">{fact.fact_id}</span>
                          </div>
                          <div className="text-base font-bold text-slate-200">
                            {fact.value} <span className="text-slate-400 text-xs">{fact.unit}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {fact.explanation}
                          </p>
                          <div className="text-[9px] text-slate-500 mt-2 flex items-center space-x-1">
                            <span>Backed by units:</span>
                            {fact.evidence_ids.map((id) => (
                              <span key={id} className="bg-slate-900 px-1 rounded text-slate-300">
                                {id}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16 text-slate-600 font-mono text-xs">
              <Info className="w-10 h-10 text-slate-700 mb-2" />
              <span>Diagnostic routing telemetry will appear here in real-time.</span>
            </div>
          )}
        </div>
      </div>

      {/* Citation Detail Modal */}
      <AnimatePresence>
        {selectedCitation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-850 rounded-2xl w-full max-w-lg p-5 shadow-2xl overflow-hidden flex flex-col font-mono text-xs relative"
            >
              <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                <span className="text-blue-400 font-bold">Provenance Inspector</span>
                <button
                  onClick={() => setSelectedCitation(null)}
                  className="text-slate-400 hover:text-slate-200 text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <div>
                    <span className="text-slate-500">Evidence ID:</span>{" "}
                    <span className="text-slate-200 font-bold">{selectedCitation.evidence_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Fund Code:</span>{" "}
                    <span className="text-blue-400 font-bold">{selectedCitation.fund_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Document ID:</span>{" "}
                    <span className="text-slate-200">{selectedCitation.document_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Page Reference:</span>{" "}
                    <span className="text-slate-200">Page {selectedCitation.page}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 text-[10px] block mb-1 uppercase tracking-wider">
                    Structural Location:
                  </span>
                  <div className="p-2 bg-slate-950 rounded text-slate-300">
                    {selectedCitation.section} &gt; {selectedCitation.subsection}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 text-[10px] block mb-1 uppercase tracking-wider">
                    Direct Provenance Text:
                  </span>
                  <div className="p-3 bg-slate-950 rounded border border-slate-850 text-slate-200 leading-relaxed max-h-[150px] overflow-y-auto italic">
                    "{selectedCitation.text}"
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 text-[10px] text-slate-500">
                  <span>Routing Provenance:</span>
                  <div className="flex space-x-1">
                    {selectedCitation.retrieved_by?.map((r, i) => (
                      <span key={i} className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Helper helper
const vettedIdsSet = (vetted: any[]) => new Set(vetted.map((v) => v.evidence_id));
