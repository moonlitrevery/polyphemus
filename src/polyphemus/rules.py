"""Token filtering rules — faithful port of PyAeroCounter.return_categorized_words."""

from __future__ import annotations

from copy import deepcopy
import io
import string
import unicodedata
from typing import Optional


# Exact keyword list from PyAeroCounter.py line 191 (includes ﬁ ligature).
SPECIAL_PAGE_KEYWORDS = [
    "Lista de Símbolos",
    "LISTA DE SIMBOLOS",
    "Sumário",
    "Lista de Inputs",
    "Lista de Outputs",
    "Bibliografia",
    "Referências Bibliográﬁcas",
    "Referências",
    "References",
    "Symbol List",
    "Summary",
    "Symbols and Acronyms",
    "Inputs",
    "Outputs",
    "List of Inputs",
    "List of Outputs",
    "Bibliography",
]

# Header/footer geometry thresholds (PDF points / 28.35 ≈ cm), pdfminer origin.
HEADER_TOP_CM = 27.0
FOOTER_BOTTOM_CM = 1.75
PT_TO_CM = 28.35

# Extra punctuation accepted by the non-alpha filter (original quirk).
EXTRA_PUNCT = "´¸˜-ˆ"


def categorize_words(
    words: list[str],
    countwords: int,
    countnonwords: int,
    count_mathwords: int,
    mathmodewords_path: Optional[str] = None,
) -> tuple[list[str], int, list[str], int, int]:
    """Select valid words for the final count and separate non-word tokens.

    Preserves original behaviour including:
    - math-mode Word glyphs (U0001d) counted as non-words, with optional
      separate math-word tally written to mathmodewords_path;
    - dots-only tokens removed without incrementing countnonwords;
    - count_mathwords reset to 0 at the start of each call (original quirk).
    """
    # Original resets count_mathwords every call; preserve that.
    count_mathwords = 0
    i = 0
    non_words: list[str] = []
    while i < len(words):
        words_unicode = words[i].encode("raw_unicode_escape")

        # remove mathematical strings (Microsoft Word)
        if "U0001d" in str(words_unicode):
            it_is_word = 0
            temp = deepcopy(str(words_unicode))
            temp = temp.replace("b'", "")
            temp = temp.split("\\")

            while "" in temp:
                temp.remove("")

            for g in range(len(words[i])):
                if (
                    unicodedata.category(words[i][g]) in "LuLl"
                    and len(temp) == len(words[i])
                    and len(temp[g]) > 7
                    and temp[g][7] in "0123456789"
                ):
                    it_is_word = 1
                elif unicodedata.category(words[i][g]) in "Mn":
                    it_is_word = 1
                else:
                    it_is_word = 0
                    break

            if it_is_word:
                count_mathwords = count_mathwords + 1
                if mathmodewords_path:
                    with io.open(mathmodewords_path, "a", encoding="utf8") as wfile:
                        wfile.write("{} ".format(words[i]))
                        wfile.write("\n")

            non_words.append(words[i])
            words.remove(words[i])
            countnonwords = countnonwords + 1
        # remove greek char
        elif "\\u03" in str(words_unicode):
            non_words.append(words[i])
            words.remove(words[i])
            countnonwords = countnonwords + 1
        # remove numeric strings
        elif words[i].isnumeric() or any(punct in words[i] for punct in string.digits):
            non_words.append(words[i])
            words.remove(words[i])
            countnonwords = countnonwords + 1
        elif not words[i].isalpha() and not any(
            char in string.punctuation + EXTRA_PUNCT for char in words[i]
        ):
            non_words.append(words[i])
            words.remove(words[i])
            countnonwords = countnonwords + 1
        elif len(words[i]) == 1 and any(
            punct in words[i] for punct in string.punctuation
        ):
            non_words.append(words[i])
            words.remove(words[i])
            countnonwords = countnonwords + 1
        elif words[i] == len(words[i]) * ".":
            # Original quirk: remove without incrementing countnonwords.
            non_words.append(words[i])
            words.remove(words[i])
        else:
            i = i + 1
            countwords = countwords + 1

    return words, countwords, non_words, countnonwords, count_mathwords


def tokenize(text: str) -> list[str]:
    """Split text on spaces after normalizing newlines (original pipeline)."""
    words = text.replace("\n", " ").split(" ")
    while "" in words:
        words.remove("")
    return words


def is_header_footer(bbox: tuple[float, float, float, float], page_height: float) -> bool:
    """Return True if element is in header/footer zone.

    pdfminer uses bottom-left origin. PyMuPDF uses top-left origin, so callers
    must pass bbox already converted to pdfminer coordinates:
      y0_pdfminer = page_height - y1_pymupdf
      y1_pdfminer = page_height - y0_pymupdf
    where bbox = (x0, y0_pdfminer, x1, y1_pdfminer).
    """
    # position[3]/28.35 >= 27.0 or position[1]/28.35 <= 1.75
    return bbox[3] / PT_TO_CM >= HEADER_TOP_CM or bbox[1] / PT_TO_CM <= FOOTER_BOTTOM_CM


def matches_special_keyword(text: str) -> bool:
    """Check if header/footer text matches a special-page keyword (case-insensitive)."""
    lowered = text.replace("\n", "").lower()
    for keyword in SPECIAL_PAGE_KEYWORDS:
        if keyword.lower() in lowered:
            return True
    return False
