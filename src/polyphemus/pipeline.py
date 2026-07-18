"""End-to-end counting pipeline — orchestrates extract + images + OCR."""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Optional

from polyphemus.extract import PageStats, extract_text
from polyphemus.images import extract_images
from polyphemus.ocr import SENTINEL, ocr_images


@dataclass
class CountResult:
    words: int = 0
    non_words: int = 0
    figures: int = 0
    words_in_figures: int = 0
    non_words_in_figures: int = 0
    pages: int = 0
    special_pages: int = 0
    math_words: int = 0
    counted_words: list[list[list[str]]] = field(default_factory=list)
    non_counted_tokens: list[list[list[str]]] = field(default_factory=list)
    page_stats: list[PageStats] = field(default_factory=list)

    def to_dict(self, include_lists: bool = False) -> dict:
        d = {
            "words": self.words,
            "non_words": self.non_words,
            "figures": self.figures,
            "words_in_figures": self.words_in_figures,
            "non_words_in_figures": self.non_words_in_figures,
            "pages": self.pages,
            "special_pages": self.special_pages,
            "math_words": self.math_words,
            "page_stats": [p.to_dict() for p in self.page_stats],
        }
        if include_lists:
            d["counted_words"] = self.counted_words
            d["non_counted_tokens"] = self.non_counted_tokens
        return d


@dataclass
class PipelineConfig:
    pdffile: str = "pdffile.pdf"
    logfile: str = "logfile.txt"
    wordsfile: str = "wordsfile.txt"
    nonwordsfile: str = "nonwordsfile.txt"
    images_folder: str = "PDFFILE"
    extract: bool = True
    strings_figures: str = "file_strings_from_images.txt"
    mathmodewords: str = "mathmodewords.txt"
    write_outputs: bool = True


def run_pipeline(config: PipelineConfig) -> CountResult:
    """Run full PyAeroCounter-equivalent pipeline."""
    text = extract_text(config.pdffile, mathmodewords_path=config.mathmodewords)

    countwords_text = text.countwords
    countnonwords_text = text.countnonwords
    countfigures_pdfminer = text.countfigures
    number_of_pages = text.number_of_pages
    count_specialpages = text.count_specialpages
    count_mathwords = text.count_mathwords
    counttext = text.counttext
    notcounttext = text.notcounttext

    # Stage B — extract images (PyMuPDF replaces pdftohtml)
    countwords_fig = 0
    countnonwords_fig = 0
    countfigures = 0

    if config.images_folder:
        extract_images(config.pdffile, config.images_folder)

    # Stage C — OCR
    if config.extract:
        countwords_fig, countnonwords_fig, countfigures = ocr_images(
            config.images_folder,
            strings_figures=config.strings_figures,
            countfigures_fallback=countfigures_pdfminer,
        )
        # If OCR failed with sentinel and figures=0, keep extracted file count
        if countwords_fig == SENTINEL and countfigures == 0:
            from polyphemus.images import list_image_files

            countfigures = len(list_image_files(config.images_folder))
    else:
        from polyphemus.images import list_image_files

        countfigures = len(list_image_files(config.images_folder))

    # Stage D — write outputs (original format)
    if config.write_outputs:
        _write_wordsfile(config.wordsfile, counttext, countwords_text)
        # Original mutates countwords_text to 9999 inside wordsfile write
        if countwords_text == 0:
            countwords_text = SENTINEL

        _write_nonwordsfile(config.nonwordsfile, notcounttext)
        _write_logfile(
            config.logfile,
            countwords_text=countwords_text,
            countnonwords_text=countnonwords_text,
            countfigures=countfigures,
            countwords_fig=countwords_fig,
            countnonwords_fig=countnonwords_fig,
            number_of_pages=number_of_pages,
            count_specialpages=count_specialpages,
            count_mathwords=count_mathwords,
        )
    else:
        if countwords_text == 0:
            countwords_text = SENTINEL

    return CountResult(
        words=countwords_text,
        non_words=countnonwords_text,
        figures=countfigures,
        words_in_figures=countwords_fig,
        non_words_in_figures=countnonwords_fig,
        pages=number_of_pages,
        special_pages=count_specialpages,
        math_words=count_mathwords,
        counted_words=counttext,
        non_counted_tokens=notcounttext,
        page_stats=text.page_stats,
    )


def _write_wordsfile(
    wordsfile: str, counttext: list, countwords_text: int
) -> None:
    if not wordsfile:
        return
    with io.open(wordsfile, "w", encoding="utf8") as wfile:
        if countwords_text == 0:
            wfile.write(
                "Nao foi possivel extrair e contar palavras do relatorio. "
                "\n Verifique o Documento PDF!!! \n\n"
            )
            wfile.write(
                "It was not possible to extract and count words from report. "
                "\n Check the PDF document!!! \n\n"
            )

        for i in range(len(counttext)):
            for j in range(len(counttext[i])):
                for k in range(len(counttext[i][j])):
                    wfile.write("{} ".format(counttext[i][j][k]))
                wfile.write("\n")


def _write_nonwordsfile(nonwordsfile: str, notcounttext: list) -> None:
    if not nonwordsfile:
        return
    with io.open(nonwordsfile, "w", encoding="utf8") as wfile:
        for i in range(len(notcounttext)):
            for j in range(len(notcounttext[i])):
                for k in range(len(notcounttext[i][j])):
                    wfile.write("{} ".format(notcounttext[i][j][k]))
                wfile.write("\n")


def _write_logfile(
    logfile: str,
    *,
    countwords_text: int,
    countnonwords_text: int,
    countfigures: int,
    countwords_fig: int,
    countnonwords_fig: int,
    number_of_pages: int,
    count_specialpages: int,
    count_mathwords: int,
) -> None:
    with io.open(logfile, "w") as wfile:
        wfile.write("Words:         {} \n".format(countwords_text))
        wfile.write("Non-Words:     {} \n".format(countnonwords_text))
        wfile.write("Figures Files: {} \n".format(countfigures))
        wfile.write("Words in Figures: {} \n".format(countwords_fig))
        wfile.write("Non-Words in Figures: {} \n".format(countnonwords_fig))
        wfile.write("Total Num. of Pages: {} \n".format(number_of_pages))
        wfile.write("Num. of Special Pages: {} \n".format(count_specialpages))
        wfile.write(
            "Words in Math Mode (Microsoft Word): {} \n".format(count_mathwords)
        )
