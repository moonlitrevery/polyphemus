"""OCR stage via pytesseract — faithful port of PyAeroCounter ocr_core + loop."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

from polyphemus.images import list_image_files
from polyphemus.rules import categorize_words, tokenize

SENTINEL = 9999


def ocr_core(filename_extract: str) -> str:
    """Core OCR processing of a single image (original ocr_core)."""
    try:
        from PIL import Image
    except ImportError:
        import Image  # type: ignore
    import pytesseract

    text = pytesseract.image_to_string(Image.open(filename_extract))
    return text


def ocr_images(
    images_folder: str,
    strings_figures: Optional[str] = None,
    countfigures_fallback: int = 0,
) -> tuple[int, int, int]:
    """OCR all images in folder; return (countwords, countnonwords, countfigures).

    Preserves original sentinels:
    - >1000 images → skip OCR, counts = 9999, figures = fallback
    - any exception → counts = 9999
    """
    countwords = 0
    countnonwords = 0
    count_mathwords_temp = 0

    try:
        if strings_figures:
            with io.open(strings_figures, "w", encoding="utf8") as wfile:
                wfile.write("\n")

        images = list_image_files(images_folder)
        # Original walks once then break — same as listing top-level files
        countfigures = len(images)

        if countfigures > 1000:
            countfigures = countfigures_fallback
            if strings_figures:
                with io.open(strings_figures, "a", encoding="utf8") as wfile:
                    wfile.write("#------------------------------------\n")
                    wfile.write(
                        "# Numero de imagens extraidas excede 1000 e o texto "
                        "nao sera pos-processado. \n Verifique o documento PDF!!! \n\n"
                    )
                    wfile.write(
                        "# Number of images exceeds 1000 and the text will not "
                        "be post-processed. \n Check the PDF document!!! \n\n"
                    )
            return SENTINEL, SENTINEL, countfigures

        folder = Path(images_folder)
        for j in range(len(images)):
            words_raw = ocr_core(str(folder / images[j]))
            words = tokenize(words_raw)

            words, countwords, non_words, countnonwords, count_mathwords_temp = (
                categorize_words(
                    words,
                    countwords,
                    countnonwords,
                    count_mathwords_temp,
                    mathmodewords_path=None,
                )
            )

            if strings_figures:
                with io.open(strings_figures, "a", encoding="utf8") as wfile:
                    wfile.write("#------------------------------------\n")
                    wfile.write("# Arquivo: \n")
                    wfile.write("{} ".format(images[j]))
                    wfile.write("\n")
                    for k in range(len(words)):
                        wfile.write("{} ".format(words[k]))
                        wfile.write("\n")

        return countwords, countnonwords, countfigures
    except Exception:
        return SENTINEL, SENTINEL, 0
