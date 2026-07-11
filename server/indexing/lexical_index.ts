import { EvidenceUnit } from "../models/index.js";

export class LexicalIndex {
  private static k1 = 1.5;
  private static b = 0.75;

  private corpus: EvidenceUnit[] = [];
  private docLengths: Record<string, number> = {};
  private avgDocLength = 0;
  private termFrequencies: Record<string, Record<string, number>> = {}; // docId -> term -> freq
  private docFrequencies: Record<string, number> = {}; // term -> count of docs containing term
  private invertedIndex: Record<string, string[]> = {}; // term -> docIds[]

  constructor(evidenceUnits: EvidenceUnit[]) {
    this.buildIndex(evidenceUnits);
  }

  /**
   * Tokenizes text into normalized lowercase terms, filtering basic English stop words
   */
  private tokenize(text: string): string[] {
    const stopWords = new Set([
      "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
      "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
      "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't",
      "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have",
      "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him",
      "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't",
      "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor",
      "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out",
      "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some",
      "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
      "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through",
      "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've",
      "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who",
      "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll",
      "you're", "you've", "your", "yours", "yourself", "yourselves"
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove punctuation except hyphens
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token));
  }

  /**
   * Builds the inverted index and BM25 statistics
   */
  private buildIndex(evidenceUnits: EvidenceUnit[]): void {
    this.corpus = evidenceUnits;
    this.docLengths = {};
    this.termFrequencies = {};
    this.docFrequencies = {};
    this.invertedIndex = {};

    let totalLength = 0;
    const N = this.corpus.length;

    if (N === 0) return;

    for (const unit of this.corpus) {
      const tokens = this.tokenize(unit.text);
      const docId = unit.evidence_id;
      const docLen = tokens.length;

      this.docLengths[docId] = docLen;
      totalLength += docLen;

      const freqs: Record<string, number> = {};
      const uniqueTokens = new Set<string>();

      for (const token of tokens) {
        freqs[token] = (freqs[token] || 0) + 1;
        uniqueTokens.add(token);
      }

      this.termFrequencies[docId] = freqs;

      for (const token of uniqueTokens) {
        this.docFrequencies[token] = (this.docFrequencies[token] || 0) + 1;
        if (!this.invertedIndex[token]) {
          this.invertedIndex[token] = [];
        }
        this.invertedIndex[token].push(docId);
      }
    }

    this.avgDocLength = totalLength / N;
  }

  /**
   * Computes the IDF for a given term
   */
  private getIDF(term: string): number {
    const N = this.corpus.length;
    const n = this.docFrequencies[term] || 0;
    // Standard BM25 IDF formulation with smoothing
    return Math.max(0.0001, Math.log((N - n + 0.5) / (n + 0.5) + 1));
  }

  /**
   * Search candidates using BM25 scoring algorithm
   */
  public search(
    query: string,
    limit = 10,
    fundFilter?: string[]
  ): { evidence_id: string; score: number }[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const scores: Record<string, number> = {};
    const N = this.corpus.length;

    // Filter relevant units if fundFilter is specified
    const filteredDocIds = fundFilter
      ? new Set(this.corpus.filter((c) => fundFilter.includes(c.fund_id)).map((c) => c.evidence_id))
      : null;

    for (const term of queryTerms) {
      const idf = this.getIDF(term);
      const docIds = this.invertedIndex[term] || [];

      for (const docId of docIds) {
        // Apply fund filter if active
        if (filteredDocIds && !filteredDocIds.has(docId)) continue;

        const tf = this.termFrequencies[docId]?.[term] || 0;
        const dLen = this.docLengths[docId] || 0;

        // BM25 math formula
        const numerator = tf * (LexicalIndex.k1 + 1);
        const denominator = tf + LexicalIndex.k1 * (1 - LexicalIndex.b + LexicalIndex.b * (dLen / this.avgDocLength));
        const termScore = idf * (numerator / denominator);

        scores[docId] = (scores[docId] || 0) + termScore;
      }
    }

    // Sort and return top candidates
    return Object.entries(scores)
      .map(([evidence_id, score]) => ({ evidence_id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Supports phrase/token-based exact retrieval if BM25 is too permissive
   */
  public phraseSearch(phrase: string, fundFilter?: string[]): EvidenceUnit[] {
    const normalizedPhrase = phrase.toLowerCase().trim();
    return this.corpus.filter((unit) => {
      if (fundFilter && !fundFilter.includes(unit.fund_id)) return false;
      return unit.text.toLowerCase().includes(normalizedPhrase);
    });
  }
}
