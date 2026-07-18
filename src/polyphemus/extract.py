"""PDF text/layout extraction via PyMuPDF, mirroring PyAeroCounter pdfminer flow."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF

from polyphemus.rules import (
    categorize_words,
    is_header_footer,
    matches_special_keyword,
    tokenize,
)


@dataclass
class LayoutElement:
    """A text or image element with pdfminer-style bottom-left bbox."""

    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1) pdfminer coords
    text: str = ""
    is_figure: bool = False
    is_image: bool = False


@dataclass
class PageStats:
    """Per-page display statistics (does not affect the official count)."""

    page: int = 0
    words: int = 0
    non_words: int = 0
    math_words: int = 0
    figures: int = 0
    counted: bool = True

    def to_dict(self) -> dict:
        return {
            "page": self.page,
            "words": self.words,
            "non_words": self.non_words,
            "math_words": self.math_words,
            "figures": self.figures,
            "counted": self.counted,
        }


@dataclass
class TextExtractionResult:
    countwords: int = 0
    countnonwords: int = 0
    countfigures: int = 0
    count_mathwords: int = 0
    number_of_pages: int = 0
    count_specialpages: int = 0
    counttext: list[list[list[str]]] = field(default_factory=list)
    notcounttext: list[list[list[str]]] = field(default_factory=list)
    page_stats: list[PageStats] = field(default_factory=list)


def _pymupdf_to_pdfminer_bbox(
    bbox: tuple[float, float, float, float], page_height: float
) -> tuple[float, float, float, float]:
    """Convert PyMuPDF top-left bbox to pdfminer bottom-left bbox."""
    x0, y0, x1, y1 = bbox
    return (x0, page_height - y1, x1, page_height - y0)


def _span_text(span: dict) -> str:
    return span.get("text", "")


def _line_text(line: dict) -> str:
    return "".join(_span_text(s) for s in line.get("spans", []))


def _block_text(block: dict) -> str:
    """Join lines in a text block with spaces (pdfminer-like get_text)."""
    parts: list[str] = []
    for line in block.get("lines", []):
        t = _line_text(line)
        if t:
            parts.append(t)
    return "\n".join(parts)


def iter_page_elements(page: fitz.Page) -> list[LayoutElement]:
    """Yield layout elements in document order, approximating pdfminer layout.

    Text blocks from get_text('dict') become text elements.
    Image blocks become figure/image elements.
    Text drawn inside image XObjects is also pulled via get_textpage /
    rawdict when present as separate text blocks overlapping figures —
    PyMuPDF typically exposes figure-embedded text as normal text blocks,
    which matches parse_layout behaviour for LTFigure contents.
    """
    page_height = float(page.rect.height)
    elements: list[LayoutElement] = []
    data = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

    for block in data.get("blocks", []):
        bbox_pm = _pymupdf_to_pdfminer_bbox(tuple(block["bbox"]), page_height)
        btype = block.get("type", 0)

        if btype == 1:
            # Image block
            elements.append(
                LayoutElement(bbox=bbox_pm, is_figure=True, is_image=True)
            )
            continue

        # Text block (type 0)
        text = _block_text(block)
        if text.strip() or text:
            elements.append(LayoutElement(bbox=bbox_pm, text=text))

    # Also count drawings that look like figures? Original counted LTFigure
    # and LTImage. Image XObjects already covered. Vector figures without
    # images won't match pdftohtml extraction anyway.

    # Detect image XObjects via page.get_images for figure count parity
    # when they are not exposed as type-1 blocks (rare). Prefer type-1
    # blocks to avoid double-counting; only add xref images not already
    # represented.
    return elements


def count_images_on_page(page: fitz.Page) -> int:
    """Count embedded images on a page (pdfminer LTImage/LTFigure analogue)."""
    # get_images returns unique xrefs; original counted layout instances.
    # Prefer layout image blocks for instance counting.
    data = page.get_text("dict")
    n = sum(1 for b in data.get("blocks", []) if b.get("type") == 1)
    if n == 0:
        # Fallback: unique image xrefs referenced on page
        n = len(page.get_images(full=True))
    return n


def extract_text(
    pdffile: str,
    mathmodewords_path: Optional[str] = None,
) -> TextExtractionResult:
    """Run Stage A — PDF text counting (faithful to PyAeroCounter loop)."""
    result = TextExtractionResult()
    countwords = 0
    countnonwords = 0
    countfigures = 0
    count_mathwords = 0
    count_specialpages = 0

    if mathmodewords_path:
        with open(mathmodewords_path, "w", encoding="utf8") as wfile:
            wfile.write("\n")

    doc = fitz.open(pdffile)
    j = 0

    for page in doc:
        j = j + 1
        countpage = True
        # remove first page
        if j <= 1:
            countpage = False
            count_specialpages = count_specialpages + 1

        page_height = float(page.rect.height)
        elements = iter_page_elements(page)

        page_words_before = countwords
        page_nonwords_before = countnonwords
        page_mathwords = 0
        page_figures = 0

        # Count figures similarly to LTImage/LTFigure
        for element in elements:
            if element.is_figure or element.is_image:
                countfigures = countfigures + 1
                page_figures = page_figures + 1

        # If no type-1 blocks, still try image xrefs once per page for count
        if not any(e.is_image for e in elements):
            n_extra = count_images_on_page(page)
            countfigures = countfigures + n_extra
            page_figures = page_figures + n_extra

        result.counttext.append([])
        result.notcounttext.append([])

        for element in elements:
            if element.is_figure or element.is_image:
                # No text path for pure images (OCR is separate stage)
                if not element.text:
                    continue

            headerfooter = is_header_footer(element.bbox, page_height)
            words_raw = element.text

            if not words_raw:
                continue

            # check if the page must be considered
            if headerfooter and countpage:
                if matches_special_keyword(words_raw):
                    countpage = False
                    count_specialpages = count_specialpages + 1

            words = tokenize(words_raw)

            # count only pages with valid content
            if countpage and not headerfooter:
                words, countwords, non_words, countnonwords, count_mathwords = (
                    categorize_words(
                        words,
                        countwords,
                        countnonwords,
                        count_mathwords,
                        mathmodewords_path=mathmodewords_path,
                    )
                )
                page_mathwords = page_mathwords + count_mathwords

                if len(words) > 0:
                    result.counttext[j - 1].append(words)

                if len(non_words) > 0:
                    result.notcounttext[j - 1].append(non_words)
            else:
                result.notcounttext[j - 1].append(words)

        result.page_stats.append(
            PageStats(
                page=j,
                words=countwords - page_words_before,
                non_words=countnonwords - page_nonwords_before,
                math_words=page_mathwords,
                figures=page_figures,
                counted=countpage,
            )
        )

    doc.close()

    result.countwords = countwords
    result.countnonwords = countnonwords
    result.countfigures = countfigures
    result.count_mathwords = count_mathwords
    result.number_of_pages = j
    result.count_specialpages = count_specialpages
    return result
