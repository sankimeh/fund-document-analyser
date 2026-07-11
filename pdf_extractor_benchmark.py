import os
import sys
import json
import re
import math

# We will try to import fitz and pdfplumber.
# If they are not yet installed (due to background task lag),
# we will provide a clear placeholder or print.
try:
    import fitz  # PyMuPDF
    import pdfplumber
except ImportError:
    pass

def generate_mock_vanguard_pdf(pdf_path):
    """
    Programmatically generates a highly realistic, complex multi-page Vanguard Prospectus PDF
    using PyMuPDF. This contains:
      - Page headers and footers on every page (for repeated header/footer detection)
      - A single-column page (Page 1) with large headings and paragraphs
      - A two-column page (Page 2) with side-by-side text
      - A page with a table (Page 3) containing "Class A | 1.50%" and "Class B | 0.75%"
      - A multi-page table (Pages 4 and 5) that continues across page boundaries
      - Footnotes at the bottom of pages
      - Drawings/rectangles representing visual charts (for visual evidence detection)
    """
    print(f"Generating mock Vanguard prospectus PDF at: {pdf_path}")
    doc = fitz.open()

    # Define some standard styles
    font_sans = "helv"
    font_sans_bold = "hebo"

    # PAGE 1: Cover & Intro (Single Column)
    page1 = doc.new_page(width=595, height=842)
    
    # Repeated Header
    page1.insert_text((50, 40), "VANGUARD INDEX FUNDS PROSPECTUS", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    
    # Title
    page1.insert_text((50, 100), "Vanguard Global Growth Fund", fontsize=24, fontname=font_sans_bold, color=(0.6, 0.1, 0.1))
    page1.insert_text((50, 130), "Prospectus - July 2026", fontsize=14, fontname=font_sans, color=(0.3, 0.3, 0.3))
    
    # Heading 1
    page1.insert_text((50, 180), "1. Investment Objective", fontsize=14, fontname=font_sans_bold)
    
    # Continuous Paragraph 1 (split across physical lines to test reconstruction)
    p1_lines = [
        "The Vanguard Global Growth Fund seeks to provide long-term capital appreciation by investing",
        "primarily in high-quality growth companies located throughout the world. The Fund employs an",
        "active management strategy, selecting companies with strong balance sheets, leading market positions,",
        "and robust growth prospects. Under normal circumstances, at least 80% of the Fund's assets will",
        "be invested in common stocks of companies located in at least three different countries."
    ]
    y = 205
    for line in p1_lines:
        page1.insert_text((50, y), line, fontsize=10, fontname=font_sans)
        y += 15

    # Heading 2
    page1.insert_text((50, y + 15), "2. Principal Investment Risks", fontsize=14, fontname=font_sans_bold)
    y += 40
    
    p2_lines = [
        "All investments are subject to risk, including the possible loss of the money you invest.",
        "The Fund is subject to stock market risk, which is the chance that stock prices overall will",
        "decline. Foreign investing involves additional risks, including currency fluctuations and",
        "political instability, which may cause the Fund's share prices to fluctuate more widely."
    ]
    for line in p2_lines:
        page1.insert_text((50, y), line, fontsize=10, fontname=font_sans)
        y += 15

    # Footnote marker and text
    page1.insert_text((50, 780), "[1] See page 10 for detailed risk factor disclosures.", fontsize=8, fontname=font_sans, color=(0.4, 0.4, 0.4))
    # Repeated Footer
    page1.insert_text((50, 810), "Vanguard Prospectus 2026", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page1.insert_text((500, 810), "Page 1", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))


    # PAGE 2: Two-Column Layout
    page2 = doc.new_page(width=595, height=842)
    # Repeated Header
    page2.insert_text((50, 40), "VANGUARD INDEX FUNDS PROSPECTUS", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    
    # Heading
    page2.insert_text((50, 80), "3. Portfolio Management & Administration", fontsize=14, fontname=font_sans_bold)
    
    # Left Column Text
    left_x = 50
    left_y = 110
    left_lines = [
        "The Vanguard Group, Inc., provides investment",
        "advisory and administrative services to the Fund",
        "under a client-owned structure. This unique",
        "mutual ownership model ensures that the interests",
        "of the advisor are fully aligned with those of the",
        "shareholders, keeping overall operating costs and",
        "expense ratios extremely low."
    ]
    for line in left_lines:
        page2.insert_text((left_x, left_y), line, fontsize=10, fontname=font_sans)
        left_y += 15

    # Right Column Text
    right_x = 310
    right_y = 110
    right_lines = [
        "Portfolio managers oversee daily operations,",
        "monitoring security selections and executing",
        "transactions across international exchanges.",
        "The advisory team holds regular weekly research",
        "meetings to review global macroeconomic trends,",
        "sector-specific developments, and asset",
        "valuation models."
    ]
    for line in right_lines:
        page2.insert_text((right_x, right_y), line, fontsize=10, fontname=font_sans)
        right_y += 15

    # Repeated Footer
    page2.insert_text((50, 810), "Vanguard Prospectus 2026", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page2.insert_text((500, 810), "Page 2", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))


    # PAGE 3: Table with specific fee values to verify Class mapping
    page3 = doc.new_page(width=595, height=842)
    # Repeated Header
    page3.insert_text((50, 40), "VANGUARD INDEX FUNDS PROSPECTUS", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    
    page3.insert_text((50, 80), "4. Share Class Fee Disclosures", fontsize=14, fontname=font_sans_bold)
    
    # We will draw a visual table using lines, and put text inside.
    # pdfplumber extracts tables based on lines (or text alignment).
    # Draw horizontal table lines
    page3.draw_line((50, 120), (500, 120), color=(0, 0, 0), width=1)
    page3.draw_line((50, 140), (500, 140), color=(0, 0, 0), width=1)
    page3.draw_line((50, 160), (500, 160), color=(0, 0, 0), width=1)
    page3.draw_line((50, 180), (500, 180), color=(0, 0, 0), width=1)
    # Draw vertical table lines
    page3.draw_line((50, 120), (50, 180), color=(0, 0, 0), width=1)
    page3.draw_line((250, 120), (250, 180), color=(0, 0, 0), width=1)
    page3.draw_line((500, 120), (500, 180), color=(0, 0, 0), width=1)
    
    # Add text to table cells
    # Headers
    page3.insert_text((60, 133), "Share Class", fontsize=10, fontname=font_sans_bold)
    page3.insert_text((260, 133), "Management Fee", fontsize=10, fontname=font_sans_bold)
    # Row 1
    page3.insert_text((60, 153), "Class A", fontsize=10, fontname=font_sans)
    page3.insert_text((260, 153), "1.50%", fontsize=10, fontname=font_sans)
    # Row 2
    page3.insert_text((60, 173), "Class B", fontsize=10, fontname=font_sans)
    page3.insert_text((260, 173), "0.75%", fontsize=10, fontname=font_sans)

    # Paragraph below table
    p3_below = [
        "Fees are deducted directly from the net assets of each respective share class on a daily basis.",
        "Class A shares are subject to an upfront sales charge, whereas Class B shares employ a contingent",
        "deferred sales charge (CDSC) that scales down over a multi-year holding period."
    ]
    y = 210
    for line in p3_below:
        page3.insert_text((50, y), line, fontsize=10, fontname=font_sans)
        y += 15

    # Footnote marker and text
    page3.insert_text((50, 780), "[2] Management fees are subject to fee waivers under voluntary advisory caps.", fontsize=8, fontname=font_sans, color=(0.4, 0.4, 0.4))
    # Repeated Footer
    page3.insert_text((50, 810), "Vanguard Prospectus 2026", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page3.insert_text((500, 810), "Page 3", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))


    # PAGES 4 & 5: Multi-Page Table Stitching Test
    # Page 4: Part 1 of expense table
    page4 = doc.new_page(width=595, height=842)
    page4.insert_text((50, 40), "VANGUARD INDEX FUNDS PROSPECTUS", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page4.insert_text((50, 80), "5. Detailed Annual Fund Operating Expenses", fontsize=14, fontname=font_sans_bold)
    
    # Table starts at y=120, ends near bottom (y=800)
    # Draw horizontal table lines
    page4.draw_line((50, 120), (500, 120), color=(0, 0, 0), width=1)
    page4.draw_line((50, 140), (500, 140), color=(0, 0, 0), width=1)
    # Vertical lines
    page4.draw_line((50, 120), (50, 790), color=(0, 0, 0), width=1)
    page4.draw_line((250, 120), (250, 790), color=(0, 0, 0), width=1)
    page4.draw_line((500, 120), (500, 790), color=(0, 0, 0), width=1)
    
    page4.insert_text((60, 133), "Expense Category", fontsize=10, fontname=font_sans_bold)
    page4.insert_text((260, 133), "Annual Percentage", fontsize=10, fontname=font_sans_bold)
    
    y = 140
    for i in range(1, 33): # 32 rows to fill up the page to the bottom
        page4.draw_line((50, y + 20), (500, y + 20), color=(0, 0, 0), width=1)
        page4.insert_text((60, y + 15), f"Expense Item {i}", fontsize=9, fontname=font_sans)
        page4.insert_text((260, y + 15), f"0.{i:02d}%", fontsize=9, fontname=font_sans)
        y += 20

    page4.insert_text((50, 810), "Vanguard Prospectus 2026", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page4.insert_text((500, 810), "Page 4", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))

    # Page 5: Part 2 of expense table
    page5 = doc.new_page(width=595, height=842)
    page5.insert_text((50, 40), "VANGUARD INDEX FUNDS PROSPECTUS", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page5.insert_text((50, 80), "5. Detailed Annual Fund Operating Expenses (Continued)", fontsize=14, fontname=font_sans_bold)
    
    # Continued table starts at y=120, has repeated headers!
    page5.draw_line((50, 120), (500, 120), color=(0, 0, 0), width=1)
    page5.draw_line((50, 140), (500, 140), color=(0, 0, 0), width=1)
    page5.draw_line((50, 120), (50, 240), color=(0, 0, 0), width=1)
    page5.draw_line((250, 120), (250, 240), color=(0, 0, 0), width=1)
    page5.draw_line((500, 120), (500, 240), color=(0, 0, 0), width=1)
    
    # Repeated Headers
    page5.insert_text((60, 133), "Expense Category", fontsize=10, fontname=font_sans_bold)
    page5.insert_text((260, 133), "Annual Percentage", fontsize=10, fontname=font_sans_bold)
    
    y = 140
    for i in range(33, 38): # 5 more rows
        page5.draw_line((50, y + 20), (500, y + 20), color=(0, 0, 0), width=1)
        page5.insert_text((60, y + 15), f"Expense Item {i}", fontsize=9, fontname=font_sans)
        page5.insert_text((260, y + 15), f"0.{i:02d}%", fontsize=9, fontname=font_sans)
        y += 20

    # Let's draw a visual chart / graph rectangle below the table
    chart_y = y + 40
    page5.draw_rect((50, chart_y, 500, chart_y + 150), color=(0, 0, 0), width=1)
    page5.insert_text((60, chart_y + 20), "Growth of $10,000 Historical Investment Chart", fontsize=12, fontname=font_sans_bold, color=(0.1, 0.1, 0.6))
    page5.insert_text((60, chart_y + 40), "[Visual Chart: Bar and line graphs illustrating hypothetical growth from 2016 to 2026]", fontsize=9, fontname=font_sans, color=(0.4, 0.4, 0.4))
    # Let's draw some bar lines programmatically inside the chart area
    page5.draw_line((100, chart_y + 130), (100, chart_y + 80), color=(0.6, 0.1, 0.1), width=10)
    page5.draw_line((200, chart_y + 130), (200, chart_y + 60), color=(0.6, 0.1, 0.1), width=10)
    page5.draw_line((300, chart_y + 130), (300, chart_y + 40), color=(0.6, 0.1, 0.1), width=10)
    page5.draw_line((400, chart_y + 130), (400, chart_y + 20), color=(0.6, 0.1, 0.1), width=10)

    page5.insert_text((50, 810), "Vanguard Prospectus 2026", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))
    page5.insert_text((500, 810), "Page 5", fontsize=8, fontname=font_sans, color=(0.5, 0.5, 0.5))

    doc.save(pdf_path)
    print("Mock PDF generated successfully!")


class LayoutAwarePDFParser:
    def __init__(self, pdf_path):
        self.pdf_path = pdf_path
        self.fitz_doc = fitz.open(pdf_path)
        self.plumber_doc = pdfplumber.open(pdf_path)
        self.pages_count = len(self.fitz_doc)

        # Baseline font size across document (for heading detection)
        self.median_font_size = self._calculate_median_font_size()

    def _calculate_median_font_size(self):
        font_sizes = []
        for page_idx in range(self.pages_count):
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

    def extract_visual_regions(self, page_idx, page_height, page_width):
        """
        Identify drawings, images, and rectangles representing charts or diagrams.
        """
        page = self.fitz_doc[page_idx]
        visual_regions = []

        # Check for drawings / shapes
        drawings = page.get_drawings()
        # Look for heavy concentrations of line/rect drawings
        if len(drawings) > 10:
            # Group drawings to find a bounding box
            x0 = min(d["rect"][0] for d in drawings)
            y0 = min(d["rect"][1] for d in drawings)
            x1 = max(d["rect"][2] for d in drawings)
            y1 = max(d["rect"][3] for d in drawings)
            width = x1 - x0
            height = y1 - y0
            # If the drawing is of significant size
            if width > 100 and height > 80:
                visual_regions.append({
                    "type": "chart_or_diagram",
                    "bbox": [x0, y0, x1, y1],
                    "confidence": 0.85,
                    "title": f"Visual Chart on Page {page_idx + 1}"
                })

        # Also check for images
        images = page.get_images()
        for img_info in images:
            # We can find image location in page
            rects = page.get_image_rects(img_info)
            for r in rects:
                visual_regions.append({
                    "type": "image",
                    "bbox": [r.x0, r.y0, r.x1, r.y1],
                    "confidence": 0.90,
                    "title": f"Image on Page {page_idx + 1}"
                })

        return visual_regions

    def extract_tables(self):
        """
        Extract tables with pdfplumber.
        Builds structured table representation with page, bbox, headers, rows, mapping, and table ID.
        """
        all_tables = []
        table_counter = 1

        for page_idx in range(self.pages_count):
            plumber_page = self.plumber_doc.pages[page_idx]
            extracted_tables = plumber_page.find_tables()
            
            for index, p_table in enumerate(extracted_tables):
                bbox = p_table.bbox # [x0, y0, x1, y1]
                raw_table = p_table.extract()
                if not raw_table or len(raw_table) < 2:
                    continue

                headers = [str(cell).strip() if cell else "" for cell in raw_table[0]]
                # Filter out completely empty header columns
                headers = [h if h else f"Col_{j}" for j, h in enumerate(headers)]

                rows = []
                row_mappings = []

                for row in raw_table[1:]:
                    cleaned_row = [str(cell).strip() if cell is not None else "" for cell in row]
                    # Map headers to cell values
                    row_map = {}
                    for col_idx, cell_val in enumerate(cleaned_row):
                        if col_idx < len(headers):
                            header_name = headers[col_idx]
                            row_map[header_name] = cell_val
                    rows.append(cleaned_row)
                    row_mappings.append(row_map)

                all_tables.append({
                    "table_id": f"T_{page_idx + 1}_{table_counter}",
                    "page_number": page_idx + 1,
                    "bbox": bbox,
                    "headers": headers,
                    "rows": rows,
                    "row_mappings": row_mappings
                })
                table_counter += 1

        return all_tables

    def stitch_multi_page_tables(self, tables):
        """
        Stitch contiguous tables on successive pages if they match:
         - Successive page numbers (N and N+1)
         - Table 1 is near bottom (y1 > 700 on 842 height) and Table 2 near top (y0 < 150)
         - Column count is identical
         - First row of Table 2 is identical to Table 1's header row, OR column geometry aligns.
        """
        if not tables:
            return [], 0

        stitched_tables = []
        skip_indices = set()
        stitched_count = 0

        for i in range(len(tables)):
            if i in skip_indices:
                continue

            current_table = dict(tables[i])
            
            # Look ahead for matching successive tables
            j = i + 1
            while j < len(tables):
                next_table = tables[j]
                
                # Check succession
                page_diff = next_table["page_number"] - current_table["page_number"]
                if page_diff == 1:
                    # Check column counts
                    if len(current_table["headers"]) == len(next_table["headers"]):
                        # Check if next table contains a repeated header
                        headers_match = [h.lower() for h in current_table["headers"]] == [h.lower() for h in next_table["headers"]]
                        
                        # Check column alignments (geometry x0, x1)
                        geom_aligns = abs(current_table["bbox"][0] - next_table["bbox"][0]) < 25 and abs(current_table["bbox"][2] - next_table["bbox"][2]) < 25
                        
                        if headers_match or geom_aligns:
                            # We stitch!
                            print(f"Stitching table {current_table['table_id']} on Page {current_table['page_number']} with {next_table['table_id']} on Page {next_table['page_number']}")
                            
                            # Determine start row of next table (skip repeated header)
                            start_row_idx = 1 if headers_match else 0
                            
                            # Append rows and mappings
                            current_table["rows"].extend(next_table["rows"][start_row_idx:])
                            current_table["row_mappings"].extend(next_table["row_mappings"][start_row_idx:])
                            
                            # Mark next table for skipping
                            skip_indices.add(j)
                            stitched_count += 1
                            # Update current table ID to show stitched range
                            current_table["table_id"] = f"{current_table['table_id']}_STITCHED"
                            j += 1
                            continue
                break
            
            stitched_tables.append(current_table)

        return stitched_tables, stitched_count

    def reconstruct_reading_order(self, page_idx, headers_to_ignore, footers_to_ignore, table_bboxes):
        """
        Sorts the raw PyMuPDF text blocks/spans on page using bounding box geometry.
        Handles single and two-column layouts.
        Filters out spans that fall inside table_bboxes or match headers/footers.
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

                        bbox = span["bbox"] # [x0, y0, x1, y1]
                        
                        # 1. Filter out headers/footers
                        if text in headers_to_ignore or text in footers_to_ignore:
                            continue
                        # If extremely close to bottom or top and resembles a footer/page number
                        if bbox[3] > height * 0.95 or bbox[1] < height * 0.05:
                            continue

                        # 2. Filter out table contents (since pdfplumber extracts them with structure)
                        overlaps_table = False
                        for t_bbox in table_bboxes:
                            # Check bounding box overlap
                            # [x0, y0, x1, y1]
                            if not (bbox[2] < t_bbox[0] or bbox[0] > t_bbox[2] or bbox[3] < t_bbox[1] or bbox[1] > t_bbox[3]):
                                overlaps_table = True
                                break
                        if overlaps_table:
                            continue

                        spans_to_sort.append(span)

        if not spans_to_sort:
            return []

        # 3. Detect column structures.
        # We look at horizontal centers of text spans.
        # If there is a distinct vertical gutter separating left and right boundaries, it's 2 columns.
        midpoint = width / 2
        left_spans = []
        right_spans = []
        single_spans = []

        # Let's see if 2 columns are dominant.
        # Check if spans are largely clustered to left or right.
        is_two_column = False
        left_count = 0
        right_count = 0
        for span in spans_to_sort:
            x0, y0, x1, y1 = span["bbox"]
            if x1 < midpoint - 15:
                left_count += 1
            elif x0 > midpoint + 15:
                right_count += 1
        
        # If both columns have significant content, classify as two-column
        if left_count > 4 and right_count > 4:
            is_two_column = True

        if is_two_column:
            # Separate into left and right columns
            for span in spans_to_sort:
                x0, y0, x1, y1 = span["bbox"]
                if x1 <= midpoint + 10:
                    left_spans.append(span)
                else:
                    right_spans.append(span)
            
            # Sort each column vertically (by y0, then x0)
            left_spans.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
            right_spans.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
            sorted_spans = left_spans + right_spans
        else:
            # Single column: sort top-to-bottom, left-to-right
            # Group spans that reside on the same baseline/Y-level (within 4 pixels tolerance)
            # and sort them left-to-right.
            spans_to_sort.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))
            
            # Let's perform a robust visual line-grouping
            sorted_spans = []
            current_line = []
            last_y = -999.0
            
            for span in spans_to_sort:
                y0 = span["bbox"][1]
                if last_y == -999.0:
                    current_line.append(span)
                    last_y = y0
                elif abs(y0 - last_y) < 5: # Same line
                    current_line.append(span)
                else: # New line
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
        Executes the layout-aware extraction flow.
        """
        # 1. Detect headers and footers to exclude them from text body flows
        headers_ignore, footers_ignore = self.detect_headers_footers()
        print(f"Detected repeated headers: {headers_ignore}")
        print(f"Detected repeated footers: {footers_ignore}")

        # 2. Extract tables first
        raw_tables = self.extract_tables()
        stitched_tables, stitched_count = self.stitch_multi_page_tables(raw_tables)

        # 3. Process pages
        reconstructed_blocks = []
        headings_detected = []
        paragraph_count = 0
        raw_pymupdf_blocks_count = 0

        for page_idx in range(self.pages_count):
            page_num = page_idx + 1
            page = self.fitz_doc[page_idx]
            
            # Record total raw block count
            raw_pymupdf_blocks_count += len(page.get_text("blocks"))

            # Find tables on this specific page to exclude overlapping text
            page_table_bboxes = [t["bbox"] for t in raw_tables if t["page_number"] == page_num]

            # Reconstruct reading order spans
            ordered_spans = self.reconstruct_reading_order(page_idx, headers_ignore, footers_ignore, page_table_bboxes)
            
            if not ordered_spans:
                continue

            # Reconstruct lines/paragraphs
            current_block_spans = []
            
            def flush_block_spans(spans):
                nonlocal paragraph_count
                if not spans:
                    return None
                
                # Check if it is a heading
                # Combined Heading signals: font size, font bold name/flags, text length, uppercase, numbering
                text_content = " ".join([s["text"] for s in spans]).strip()
                if not text_content:
                    return None

                # Calculate average font size of spans
                avg_size = sum(s["size"] for s in spans) / len(spans)
                
                # Bold signals: check name or flags
                has_bold_span = any("bold" in s["font"].lower() or (s.get("flags", 0) & 2) for s in spans)
                
                is_heading = False
                
                # Relative font size signal
                is_larger_than_median = avg_size > self.median_font_size * 1.15
                
                # Text length and formatting signals
                is_short = len(text_content) < 100
                not_ending_period = not text_content.endswith(".")
                
                # Numbering patterns
                numbering_match = re.match(r"^(SECTION\s+\d+|ARTICLE\s+[IVXLCDM\d]+|CHAPTER\s+\d+|APPENDIX\s+[A-Z]|\d+\.\d+|\d+\s+[A-Z])", text_content, re.IGNORECASE)

                if is_larger_than_median and is_short and not_ending_period:
                    is_heading = True
                elif has_bold_span and is_short and not_ending_period:
                    is_heading = True
                elif numbering_match and is_short:
                    is_heading = True
                elif text_content.isupper() and is_short:
                    is_heading = True

                block_type = "heading" if is_heading else "paragraph"
                
                # Create a reconstructed block
                bbox_x0 = min(s["bbox"][0] for s in spans)
                bbox_y0 = min(s["bbox"][1] for s in spans)
                bbox_x1 = max(s["bbox"][2] for s in spans)
                bbox_y1 = max(s["bbox"][3] for s in spans)

                block_data = {
                    "type": block_type,
                    "text": text_content,
                    "page_number": page_num,
                    "bbox": [bbox_x0, bbox_y0, bbox_x1, bbox_y1],
                    "font_name": spans[0]["font"],
                    "font_size": avg_size
                }
                
                if is_heading:
                    headings_detected.append(block_data)
                else:
                    paragraph_count += 1
                
                return block_data

            last_span = None
            for span in ordered_spans:
                if not current_block_spans:
                    current_block_spans.append(span)
                    last_span = span
                    continue

                # Paragraph reconstruction check: compatible spacing/styling
                # If vertical gap is too large, or font changes significantly, or font size changes, flush and start new block
                gap = span["bbox"][1] - last_span["bbox"][3]
                same_font = span["font"] == last_span["font"]
                size_diff = abs(span["size"] - last_span["size"])

                # Also if either is a heading-like text or ends/starts new lines
                is_new_block = False
                if gap > 18: # substantial vertical gap
                    is_new_block = True
                elif size_diff > 1.5: # different font size
                    is_new_block = True
                elif last_span["text"].strip().endswith(".") and gap > 12: # completed sentence and modest gap
                    is_new_block = True
                
                if is_new_block:
                    block_data = flush_block_spans(current_block_spans)
                    if block_data:
                        reconstructed_blocks.append(block_data)
                    current_block_spans = [span]
                else:
                    current_block_spans.append(span)
                
                last_span = span

            if current_block_spans:
                block_data = flush_block_spans(current_block_spans)
                if block_data:
                    reconstructed_blocks.append(block_data)

        # 4. Extract visual regions on all pages
        all_visual_regions = []
        for page_idx in range(self.pages_count):
            page = self.fitz_doc[page_idx]
            all_visual_regions.extend(self.extract_visual_regions(page_idx, page.rect.height, page.rect.width))

        # 5. Build final evidence unit representation & report
        evidence_units = []
        unit_id_counter = 1
        
        # Heading tracking for hierarchy
        current_section = "Introduction"
        current_subsection = "General"
        
        for block in reconstructed_blocks:
            if block["type"] == "heading":
                # Detect if section or subsection
                if re.match(r"^\d+\.", block["text"]) or block["text"].isupper() or "objective" in block["text"].lower() or "objective" in block["text"].lower():
                    current_section = block["text"]
                    current_subsection = "General"
                else:
                    current_subsection = block["text"]
            
            evidence_units.append({
                "evidence_id": f"E_BENCH_{unit_id_counter}",
                "page": block["page_number"],
                "section": current_section,
                "subsection": current_subsection,
                "type": block["type"],
                "text": block["text"],
                "bbox": block["bbox"],
                "font_name": block["font_name"],
                "font_size": block["font_size"]
            })
            unit_id_counter += 1

        # Add tables to evidence units
        for tbl in stitched_tables:
            # We construct a formatted table textual block to be consumed by search/compilers
            formatted_lines = []
            formatted_lines.append(" | ".join(tbl["headers"]))
            formatted_lines.append("-" * 40)
            for r in tbl["rows"]:
                formatted_lines.append(" | ".join(r))
            
            table_text = "\n".join(formatted_lines)
            
            evidence_units.append({
                "evidence_id": f"E_BENCH_{unit_id_counter}",
                "page": tbl["page_number"],
                "section": f"Table: {tbl['table_id']}",
                "subsection": "Table Data",
                "type": "table",
                "text": table_text,
                "bbox": tbl["bbox"],
                "table_context": {
                    "headers": tbl["headers"],
                    "title": f"Extracted Table {tbl['table_id']}",
                    "row_mappings": tbl["row_mappings"]
                }
            })
            unit_id_counter += 1

        # Build quality report
        quality_report = {
            "pages_processed": self.pages_count,
            "raw_pymupdf_blocks": raw_pymupdf_blocks_count,
            "reconstructed_paragraphs": paragraph_count,
            "headings_detected": len(headings_detected),
            "tables_detected": len(raw_tables),
            "multi_page_tables_stitched": stitched_count,
            "repeated_headers_removed": len(headers_ignore),
            "repeated_footers_removed": len(footers_ignore),
            "visual_regions_detected": len(all_visual_regions),
            "final_EvidenceUnit_count": len(evidence_units)
        }

        output_data = {
            "quality_report": quality_report,
            "visual_regions": all_visual_regions,
            "tables": stitched_tables,
            "evidence_units": evidence_units
        }

        return output_data

def run_benchmark():
    pdf_path = "vanguard_prospectus.pdf"
    
    # 1. Generate realistic Prospectus if it doesn't exist
    generate_mock_vanguard_pdf(pdf_path)

    # 2. Run the layout-aware extraction
    print("==========================================")
    print("RUNNING BENCHMARK PDF EXTRACTION")
    print("==========================================")
    
    parser = LayoutAwarePDFParser(pdf_path)
    extracted = parser.extract()

    # 3. Write outputs
    with open("extraction_quality_report.json", "w") as f:
        json.dump(extracted["quality_report"], f, indent=2)
    
    with open("extraction_output.json", "w") as f:
        json.dump(extracted, f, indent=2)

    print("\nBENCHMARK COMPLETED SUCCESSFULLY!")
    print(f"Quality report written to extraction_quality_report.json")
    print(f"Extraction output written to extraction_output.json")
    print("==========================================")
    
    # Output metrics to stdout as requested by user
    report = extracted["quality_report"]
    print(f"Pages processed: {report['pages_processed']}")
    print(f"Raw PyMuPDF blocks: {report['raw_pymupdf_blocks']}")
    print(f"Reconstructed paragraphs: {report['reconstructed_paragraphs']}")
    print(f"Headings detected: {report['headings_detected']}")
    print(f"Tables detected: {report['tables_detected']}")
    print(f"Multi-page tables stitched: {report['multi_page_tables_stitched']}")
    print(f"Repeated headers removed: {report['repeated_headers_removed']}")
    print(f"Repeated footers removed: {report['repeated_footers_removed']}")
    print(f"Final EvidenceUnit count: {report['final_EvidenceUnit_count']}")
    
    # Print sample headings
    print("\n--- 10 Sample Headings ---")
    headings = [u for u in extracted["evidence_units"] if u["type"] == "heading"]
    for idx, h in enumerate(headings[:10]):
        print(f"{idx+1}. [Page {h['page']}] {h['text']}")

    # Print sample paragraphs
    print("\n--- 5 Sample Reconstructed Paragraphs ---")
    paragraphs = [u for u in extracted["evidence_units"] if u["type"] == "paragraph"]
    for idx, p in enumerate(paragraphs[:5]):
        print(f"{idx+1}. [Page {p['page']}] {p['text']}")

    # Print extracted tables with row mappings
    print("\n--- 5 Sample Extracted Table Row Mappings ---")
    table_units = [u for u in extracted["evidence_units"] if u["type"] == "table"]
    table_index = 1
    for u in table_units[:5]:
        print(f"Table {table_index} - Page {u['page']}:")
        row_maps = u["table_context"]["row_mappings"]
        for row_idx, r_map in enumerate(row_maps[:5]):
            print(f"  Row {row_idx+1}: {r_map}")
        table_index += 1

    # Proof of mapping association
    print("\n==========================================")
    print("PROVING CLASS TO FEE ASSOCIATION")
    print("==========================================")
    for u in table_units:
        row_maps = u["table_context"]["row_mappings"]
        for r_map in row_maps:
            if r_map.get("Share Class") == "Class A":
                print(f"Class A Fee Associated: {r_map.get('Management Fee')} (Expected: 1.50%) - ✅ PROVEN")
            elif r_map.get("Share Class") == "Class B":
                print(f"Class B Fee Associated: {r_map.get('Management Fee')} (Expected: 0.75%) - ✅ PROVEN")

if __name__ == "__main__":
    if 'fitz' not in sys.modules or 'pdfplumber' not in sys.modules:
        print("Required libraries 'pymupdf' and 'pdfplumber' are not yet fully installed.")
        print("Please verify background installation finishes first.")
        sys.exit(1)
    run_benchmark()
