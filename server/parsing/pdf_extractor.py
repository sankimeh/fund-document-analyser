import os
import sys
import json
import re
import math

try:
    import fitz  # PyMuPDF
    import pdfplumber
except ImportError as e:
    print(json.dumps({"error": f"Missing required python libraries: {str(e)}"}))
    sys.exit(1)


class LayoutAwarePDFParser:
    def __init__(self, pdf_path, document_id, fund_id):
        self.pdf_path = pdf_path
        self.document_id = document_id
        self.fund_id = fund_id
        self.fitz_doc = fitz.open(pdf_path)
        self.plumber_doc = pdfplumber.open(pdf_path)
        self.pages_count = len(self.fitz_doc)
        
        # Calculate median font size for relative heading detection
        self.median_font_size = self._calculate_median_font_size()

    def _calculate_median_font_size(self):
        font_sizes = []
        for page_idx in range(min(5, self.pages_count)):  # sample first few pages
            page = self.fitz_doc[page_idx]
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            if span["text"].strip():
                                font_sizes.append(span["size"])
        if not font_sizes:
            return 10.0
        font_sizes.sort()
        return font_sizes[len(font_sizes) // 2]

    def _is_valid_heading_candidate(self, text, avg_size, has_bold_span):
        text = text.strip()
        if not text:
            return False
            
        # 1. Length and word count checks
        if len(text) > 100:  # Excessive heading length
            return False
            
        words = text.split()
        if len(words) > 12:  # Too many words for a heading
            return False
            
        # 2. Punctuation checks
        # Headings should not end in standard sentence punctuation
        if text[-1] in ('.', '?', '!', ';', ':'):
            # Check if it's a section numbering like "1.1." or "I."
            if not re.match(r"^\d+(\.\d+)*\.$", text) and not re.match(r"^[IVXLCDM]+\.$", text):
                return False
                
        # Headings should not contain sentence-ending punctuation inside
        if re.search(r"[\.\?\!]\s+[A-Z]", text):
            return False
            
        # 3. Capitalization check (Title Case, UPPERCASE, or numbered header)
        # Avoid lowercase-heavy prose
        letters = [c for c in text if c.isalpha()]
        if letters:
            lowercase_count = sum(1 for c in letters if c.islower())
            lowercase_ratio = lowercase_count / len(letters)
            # If more than 75% of letters are lowercase and it doesn't start with a number/bullet, reject it
            has_numbering = re.match(r"^\d", text) is not None
            if lowercase_ratio > 0.75 and not has_numbering:
                return False

        # 4. Starting character checks
        # Headings almost always start with a capital letter, a number, or a quote/symbol
        if text[0].islower():
            return False

        # 5. Incomplete fragments check
        # e.g., ending with a comma, or transition words that suggest continuing prose
        if text.endswith(','):
            return False
            
        # Avoid ending with small prepositions/conjunctions
        if re.search(r"\b(and|or|but|the|of|to|for|with|in|on|by|at|from|this)\s*$", text, re.IGNORECASE):
            return False

        return True

    def detect_headers_footers(self):
        """
        Detects repeated text at the top 10% or bottom 10% of pages.
        Returns two sets of strings: headers, footers.
        """
        top_texts = {}
        bottom_texts = {}

        for page_idx in range(self.pages_count):
            page = self.fitz_doc[page_idx]
            height = page.rect.height
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            txt = span["text"].strip()
                            if not txt:
                                continue
                            # Ignore pure page numbers
                            if re.match(r"^(Page\s+\d+|\d+)$", txt, re.IGNORECASE):
                                continue
                            
                            y0 = span["bbox"][1]
                            y1 = span["bbox"][3]
                            
                            # Top 10%
                            if y1 < height * 0.10:
                                top_texts[txt] = top_texts.get(txt, 0) + 1
                            # Bottom 10%
                            elif y0 > height * 0.90:
                                bottom_texts[txt] = bottom_texts.get(txt, 0) + 1

        # Identical text on >= 2 pages is a header/footer
        headers = {txt for txt, count in top_texts.items() if count >= 2}
        footers = {txt for txt, count in bottom_texts.items() if count >= 2}
        return headers, footers

    def extract_tables(self):
        """
        Extract tables using pdfplumber with structural mappings,
        including separating footnote markers and tracking uncertainty.
        """
        all_tables = []
        table_counter = 1

        for page_idx in range(self.pages_count):
            plumber_page = self.plumber_doc.pages[page_idx]
            extracted_tables = plumber_page.find_tables()
            
            for index, p_table in enumerate(extracted_tables):
                bbox = p_table.bbox  # [x0, y0, x1, y1]
                raw_table = p_table.extract()
                if not raw_table or len(raw_table) < 2:
                    continue

                headers = [str(cell).strip() if cell else "" for cell in raw_table[0]]
                headers = [h if h else f"Column_{j+1}" for j, h in enumerate(headers)]

                rows = []
                row_mappings = []
                confidence = "HIGH"
                
                # Check for structural uncertainty / low confidence signals:
                # - Highly nested / blank-heavy tables
                # - No outer borderless currency grids (where column boundaries are too close)
                empty_cells = sum(1 for row in raw_table for cell in row if not cell)
                total_cells = len(raw_table) * len(raw_table[0])
                if total_cells > 0 and (empty_cells / total_cells) > 0.6:
                    confidence = "LOW_CONFIDENCE"

                for row_idx, row in enumerate(raw_table[1:]):
                    cleaned_row = []
                    row_map = {}
                    
                    for col_idx, cell in enumerate(row):
                        cell_str = str(cell).strip() if cell is not None else ""
                        
                        # Separate footnote markers from numeric values (e.g., 2.00%*** or 12[1] or Class A*)
                        # Look for trailing symbols like *, **, ***, [1], †, ‡ at the end of cell string
                        footnote_marker = ""
                        clean_val = cell_str
                        
                        # Match trailing footnotes: e.g. ***, †, ‡, [1]
                        fn_match = re.search(r"(\*+|†+|‡+|\[\d+\])$", cell_str)
                        if fn_match:
                            footnote_marker = fn_match.group(1)
                            clean_val = cell_str[:fn_match.start()].strip()
                        
                        cleaned_row.append(cell_str)
                        
                        if col_idx < len(headers):
                            header_name = headers[col_idx]
                            row_map[header_name] = {
                                "raw_value": cell_str,
                                "clean_value": clean_val,
                                "footnote_marker": footnote_marker
                            }
                    
                    rows.append(cleaned_row)
                    row_mappings.append(row_map)

                all_tables.append({
                    "table_id": f"T_{page_idx + 1}_{table_counter}",
                    "page_number": page_idx + 1,
                    "bbox": bbox,
                    "headers": headers,
                    "rows": rows,
                    "row_mappings": row_mappings,
                    "confidence": confidence
                })
                table_counter += 1

        return all_tables

    def stitch_multi_page_tables(self, tables):
        """
        Stitch contiguous tables across successive pages.
        """
        if not tables:
            return []

        stitched_tables = []
        skip_indices = set()

        for i in range(len(tables)):
            if i in skip_indices:
                continue

            current_table = dict(tables[i])
            current_table["row_provenance"] = [current_table["page_number"]] * len(current_table["rows"])
            
            j = i + 1
            while j < len(tables):
                next_table = tables[j]
                
                # Verify consecutive pages
                page_diff = next_table["page_number"] - current_table["page_number"]
                if page_diff == 1:
                    # Column count must match
                    if len(current_table["headers"]) == len(next_table["headers"]):
                        # Check header similarity or close horizontal alignment
                        headers_match = [h.lower() for h in current_table["headers"]] == [h.lower() for h in next_table["headers"]]
                        geom_aligns = abs(current_table["bbox"][0] - next_table["bbox"][0]) < 25 and abs(current_table["bbox"][2] - next_table["bbox"][2]) < 25
                        
                        if headers_match or geom_aligns:
                            # Skip header row in the next table if it is identical
                            start_row_idx = 1 if headers_match else 0
                            
                            # Append rows and mappings
                            current_table["rows"].extend(next_table["rows"][start_row_idx:])
                            current_table["row_mappings"].extend(next_table["row_mappings"][start_row_idx:])
                            current_table["row_provenance"].extend([next_table["page_number"]] * len(next_table["rows"][start_row_idx:]))
                            
                            # Mark next table to skip
                            skip_indices.add(j)
                            current_table["table_id"] = f"{current_table['table_id']}_STITCHED"
                            j += 1
                            continue
                break
            
            stitched_tables.append(current_table)

        return stitched_tables

    def reconstruct_reading_order(self, page_idx, headers_to_ignore, footers_to_ignore, table_bboxes):
        """
        Sort page text spans utilizing X/Y geometry to handle multi-column, sidebars, and reading order.
        """
        page = self.fitz_doc[page_idx]
        width = page.rect.width
        height = page.rect.height
        blocks = page.get_text("dict")["blocks"]

        spans_to_sort = []

        for block in blocks:
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        text = span["text"].strip()
                        if not text:
                            continue

                        bbox = span["bbox"]  # [x0, y0, x1, y1]
                        
                        # Filter out headers and footers
                        if text in headers_to_ignore or text in footers_to_ignore:
                            continue
                        if bbox[3] > height * 0.95 or bbox[1] < height * 0.05:
                            continue

                        # Filter out spans overlapping tables
                        overlaps_table = False
                        for t_bbox in table_bboxes:
                            # Overlap test: bbox1 and bbox2 overlap if:
                            # not (x1_1 < x0_2 or x0_1 > x1_2 or y1_1 < y0_2 or y0_1 > y1_2)
                            if not (bbox[2] < t_bbox[0] or bbox[0] > t_bbox[2] or bbox[3] < t_bbox[1] or bbox[1] > t_bbox[3]):
                                overlaps_table = True
                                break
                        if overlaps_table:
                            continue

                        spans_to_sort.append(span)

        if not spans_to_sort:
            return []

        # Multi-column / Sidebar detection
        midpoint = width / 2
        left_count = 0
        right_count = 0
        is_two_column = False

        for span in spans_to_sort:
            x0, y0, x1, y1 = span["bbox"]
            if x1 < midpoint - 15:
                left_count += 1
            elif x0 > midpoint + 15:
                right_count += 1

        # If both sides contain sufficient distinct spans, classify as two-column
        if left_count > 4 and right_count > 4:
            is_two_column = True

        if is_two_column:
            # Separate spans into columns
            left_spans = []
            right_spans = []
            for span in spans_to_sort:
                x0, y0, x1, y1 = span["bbox"]
                if x1 <= midpoint + 10:
                    left_spans.append(span)
                else:
                    right_spans.append(span)
            
            # Sort each column top-to-bottom, then left-to-right
            left_spans.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
            right_spans.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
            sorted_spans = left_spans + right_spans
        else:
            # Single column flow. Sort by Y coordinate first, grouping lines within a tiny threshold (5px)
            spans_to_sort.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
            sorted_spans = []
            current_line = []
            last_y = -999.0
            
            for span in spans_to_sort:
                y0 = span["bbox"][1]
                if last_y == -999.0:
                    current_line.append(span)
                    last_y = y0
                elif abs(y0 - last_y) < 5:
                    current_line.append(span)
                else:
                    current_line.sort(key=lambda s: s["bbox"][0])
                    sorted_spans.extend(current_line)
                    current_line = [span]
                    last_y = y0
            if current_line:
                current_line.sort(key=lambda s: s["bbox"][0])
                sorted_spans.extend(current_line)

        return sorted_spans

    def extract(self):
        """
        Run the layout-aware parser extraction and build final structured output.
        """
        # 1. Header/Footer detection
        headers_ignore, footers_ignore = self.detect_headers_footers()

        # 2. Extract tables & stitch multi-page ones
        raw_tables = self.extract_tables()
        stitched_tables = self.stitch_multi_page_tables(raw_tables)

        # 3. Process text blocks
        reconstructed_blocks = []
        footnote_blocks = []
        
        for page_idx in range(self.pages_count):
            page_num = page_idx + 1
            page_table_bboxes = [t["bbox"] for t in raw_tables if t["page_number"] == page_num]

            # Reconstruct reading order spans
            ordered_spans = self.reconstruct_reading_order(
                page_idx, headers_ignore, footers_ignore, page_table_bboxes
            )
            
            if not ordered_spans:
                continue

            current_block_spans = []
            
            def flush_block_spans(spans):
                if not spans:
                    return None
                
                text_content = " ".join([s["text"] for s in spans]).strip()
                if not text_content:
                    return None

                avg_size = sum(s["size"] for s in spans) / len(spans)
                has_bold_span = any("bold" in s["font"].lower() or (s.get("flags", 0) & 2) for s in spans)
                
                # Headings multi-signal classifier
                is_heading = False
                is_larger_than_median = avg_size > self.median_font_size * 1.15
                is_short = len(text_content) < 100
                not_ending_period = not text_content.endswith(".")
                
                numbering_match = re.match(
                    r"^(SECTION\s+\d+|ARTICLE\s+[IVXLCDM\d]+|CHAPTER\s+\d+|APPENDIX\s+[A-Z]|\d+\.\d+|\d+\s+[A-Z])", 
                    text_content, 
                    re.IGNORECASE
                )

                if is_larger_than_median and is_short and not_ending_period:
                    is_heading = True
                elif has_bold_span and is_short and not_ending_period:
                    is_heading = True
                elif numbering_match and is_short:
                    is_heading = True
                # NOTE: uppercase regex must not independently classify a heading, 
                # but if it's combined with being short and not ending with a period:
                elif text_content.isupper() and is_short and not_ending_period and avg_size >= self.median_font_size:
                    is_heading = True

                # Secondary structural validation for headings
                if is_heading:
                    if not self._is_valid_heading_candidate(text_content, avg_size, has_bold_span):
                        is_heading = False

                # Footnote detection (typically at bottom or starts with footnote marker)
                is_footnote = False
                if re.match(r"^(\*+|†+|‡+|\[\d+\]|footnote)", text_content, re.IGNORECASE):
                    is_footnote = True

                block_type = "header" if is_heading else ("footnote" if is_footnote else "paragraph")
                
                bbox_x0 = min(s["bbox"][0] for s in spans)
                bbox_y0 = min(s["bbox"][1] for s in spans)
                bbox_x1 = max(s["bbox"][2] for s in spans)
                bbox_y1 = max(s["bbox"][3] for s in spans)

                return {
                    "type": block_type,
                    "text": text_content,
                    "page_number": page_num,
                    "bbox": [bbox_x0, bbox_y0, bbox_x1, bbox_y1],
                    "font_name": spans[0]["font"],
                    "font_size": avg_size
                }

            last_span = None
            for span in ordered_spans:
                if not current_block_spans:
                    current_block_spans.append(span)
                    last_span = span
                    continue

                gap = span["bbox"][1] - last_span["bbox"][3]
                size_diff = abs(span["size"] - last_span["size"])

                is_new_block = False
                if gap > 18:
                    is_new_block = True
                elif size_diff > 1.5:
                    is_new_block = True
                elif last_span["text"].strip().endswith(".") and gap > 12:
                    is_new_block = True
                
                if is_new_block:
                    block_data = flush_block_spans(current_block_spans)
                    if block_data:
                        if block_data["type"] == "footnote":
                            footnote_blocks.append(block_data)
                        else:
                            reconstructed_blocks.append(block_data)
                    current_block_spans = [span]
                else:
                    current_block_spans.append(span)
                
                last_span = span

            if current_block_spans:
                block_data = flush_block_spans(current_block_spans)
                if block_data:
                    if block_data["type"] == "footnote":
                        footnote_blocks.append(block_data)
                    else:
                        reconstructed_blocks.append(block_data)

        # 4. Construct Evidence Units
        evidence_units = []
        unit_id_counter = 1
        
        # Track section/subsection hierarchy
        current_section = "Introduction"
        current_subsection = "General"
        heading_hierarchy = ["Introduction", "General"]

        for block in reconstructed_blocks:
            if block["type"] == "header":
                # Detect if section or subsection
                is_sec = False
                text_lower = block["text"].lower()
                
                # We only promote to main section if it meets robust heading guidelines and:
                if len(block["text"]) < 80:
                    if re.match(r"^\d+\.", block["text"]):
                        is_sec = True
                    elif block["text"].isupper() and not re.search(r"\b(dated|prospectus|plc|vanguard)\b", text_lower):
                        # Avoid random large uppercase supplement headings or document titles as section headers
                        is_sec = True
                    elif re.search(r"\bobjective\b", text_lower) and not re.search(r"\b(environmental|sustainable|social|take|into)\b", text_lower):
                        is_sec = True
                    elif re.search(r"\bsection\b", text_lower) and not re.search(r"\b(under|see|in|of|this)\b", text_lower):
                        is_sec = True
                
                if is_sec:
                    current_section = block["text"]
                    current_subsection = "General"
                    heading_hierarchy = [current_section, current_subsection]
                else:
                    current_subsection = block["text"]
                    heading_hierarchy = [current_section, current_subsection]

            evidence_units.append({
                "evidence_id": f"E_{self.document_id}_{unit_id_counter}",
                "document_id": self.document_id,
                "fund_id": self.fund_id,
                "page": block["page_number"],
                "section": current_section,
                "subsection": current_subsection,
                "type": block["type"],
                "text": block["text"],
                "heading_hierarchy": list(heading_hierarchy),
                "metadata": {
                    "bbox": block["bbox"],
                    "font_name": block["font_name"],
                    "font_size": block["font_size"]
                }
            })
            unit_id_counter += 1

        # Link and add footnotes
        for fn in footnote_blocks:
            # Find candidate parent blocks on the same page containing footnote reference
            # Match footnote prefix e.g. [1] or * or **
            fn_prefix_match = re.match(r"^(\*+|†+|‡+|\[\d+\])", fn["text"])
            marker = fn_prefix_match.group(1) if fn_prefix_match else "*"
            
            target_ids = []
            for unit in evidence_units:
                if unit["page"] == fn["page_number"] and marker in unit["text"]:
                    target_ids.append(unit["evidence_id"])

            evidence_units.append({
                "evidence_id": f"E_{self.document_id}_{unit_id_counter}",
                "document_id": self.document_id,
                "fund_id": self.fund_id,
                "page": fn["page_number"],
                "section": current_section,
                "subsection": current_subsection,
                "type": "footnote",
                "text": fn["text"],
                "heading_hierarchy": list(heading_hierarchy),
                "footnote_relationships": {
                    "target_evidence_ids": target_ids,
                    "footnote_number": marker
                },
                "metadata": {
                    "bbox": fn["bbox"],
                    "font_name": fn["font_name"],
                    "font_size": fn["font_size"]
                }
            })
            unit_id_counter += 1

        # Add Tables to Evidence Units
        for tbl in stitched_tables:
            # Represent table as robust text
            formatted_lines = []
            formatted_lines.append(" | ".join(tbl["headers"]))
            formatted_lines.append("-" * (len(tbl["headers"]) * 10))
            for r in tbl["rows"]:
                formatted_lines.append(" | ".join(r))
            
            table_text = "\n".join(formatted_lines)
            
            # Reconstruct row mappings for TS
            ts_row_mappings = []
            for r_map in tbl["row_mappings"]:
                ts_row_map = {}
                for k, cell_info in r_map.items():
                    ts_row_map[k] = cell_info["clean_value"]
                ts_row_mappings.append(ts_row_map)

            evidence_units.append({
                "evidence_id": f"E_{self.document_id}_{unit_id_counter}",
                "document_id": self.document_id,
                "fund_id": self.fund_id,
                "page": tbl["page_number"],
                "section": current_section,
                "subsection": f"Table: {tbl['table_id']}",
                "type": "table",
                "text": table_text,
                "heading_hierarchy": [current_section, f"Table: {tbl['table_id']}"],
                "table_context": {
                    "headers": tbl["headers"],
                    "title": f"Table {tbl['table_id']}",
                    "row_mappings": ts_row_mappings
                },
                "metadata": {
                    "bbox": tbl["bbox"],
                    "confidence": tbl["confidence"]
                }
            })
            unit_id_counter += 1

        # Calculate metrics for Quality Report
        total_tables = len(raw_tables)
        quality_report = {
            "pages_processed": self.pages_count,
            "reconstructed_paragraphs": sum(1 for u in evidence_units if u["type"] == "paragraph"),
            "headings_detected": sum(1 for u in evidence_units if u["type"] == "header"),
            "tables_detected": total_tables,
            "repeated_headers_removed": len(headers_ignore),
            "repeated_footers_removed": len(footers_ignore),
            "final_EvidenceUnit_count": len(evidence_units)
        }

        return {
            "success": True,
            "quality_report": quality_report,
            "evidence_units": evidence_units
        }


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Usage: python3 pdf_extractor.py <pdf_path> <document_id> <fund_id>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    document_id = sys.argv[2]
    fund_id = sys.argv[3]

    if not os.path.exists(pdf_path):
        print(json.dumps({"success": False, "error": f"File does not exist: {pdf_path}"}))
        sys.exit(1)

    try:
        parser = LayoutAwarePDFParser(pdf_path, document_id, fund_id)
        result = parser.extract()
        print(json.dumps(result))
    except Exception as e:
        import traceback
        print(json.dumps({
            "success": False, 
            "error": str(e), 
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
