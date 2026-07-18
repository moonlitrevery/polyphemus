"""Fidelity tests against PyAeroCounter golden outputs."""

from __future__ import annotations

from pathlib import Path

import pytest

from polyphemus.pipeline import PipelineConfig, run_pipeline
from polyphemus.rules import categorize_words, tokenize

FIXTURES = Path(__file__).parent / "fixtures"
PDF = FIXTURES / "pdffile.pdf"

# Golden values from PyAeroCounter test/logfile.txt
GOLDEN_WORDS = 2065
GOLDEN_NON_WORDS = 11
GOLDEN_PAGES = 13
GOLDEN_SPECIAL_PAGES = 7
GOLDEN_FIGURES = 20


@pytest.fixture
def out_dir(tmp_path: Path) -> Path:
    return tmp_path


def test_text_counts_match_golden(out_dir: Path) -> None:
    """Hard fidelity criterion: text counting must match the original."""
    cfg = PipelineConfig(
        pdffile=str(PDF),
        logfile=str(out_dir / "logfile.txt"),
        wordsfile=str(out_dir / "wordsfile.txt"),
        nonwordsfile=str(out_dir / "nonwordsfile.txt"),
        images_folder=str(out_dir / "PDFFILE"),
        extract=False,
        strings_figures=str(out_dir / "file_strings_from_images.txt"),
        mathmodewords=str(out_dir / "mathmodewords.txt"),
    )
    result = run_pipeline(cfg)

    assert result.words == GOLDEN_WORDS
    assert result.non_words == GOLDEN_NON_WORDS
    assert result.pages == GOLDEN_PAGES
    assert result.special_pages == GOLDEN_SPECIAL_PAGES
    assert result.math_words == 0


def test_figure_file_count(out_dir: Path) -> None:
    """PyMuPDF image extraction should find the same number of figure files."""
    cfg = PipelineConfig(
        pdffile=str(PDF),
        logfile=str(out_dir / "logfile.txt"),
        wordsfile=str(out_dir / "wordsfile.txt"),
        nonwordsfile=str(out_dir / "nonwordsfile.txt"),
        images_folder=str(out_dir / "PDFFILE"),
        extract=False,
        strings_figures=str(out_dir / "file_strings_from_images.txt"),
        mathmodewords=str(out_dir / "mathmodewords.txt"),
    )
    result = run_pipeline(cfg)
    assert result.figures == GOLDEN_FIGURES


def test_logfile_format(out_dir: Path) -> None:
    cfg = PipelineConfig(
        pdffile=str(PDF),
        logfile=str(out_dir / "logfile.txt"),
        wordsfile=str(out_dir / "wordsfile.txt"),
        nonwordsfile=str(out_dir / "nonwordsfile.txt"),
        images_folder=str(out_dir / "PDFFILE"),
        extract=False,
        strings_figures=str(out_dir / "file_strings_from_images.txt"),
        mathmodewords=str(out_dir / "mathmodewords.txt"),
    )
    run_pipeline(cfg)
    text = (out_dir / "logfile.txt").read_text(encoding="utf8")
    assert "Words:         2065" in text
    assert "Non-Words:     11" in text
    assert "Total Num. of Pages: 13" in text
    assert "Num. of Special Pages: 7" in text
    assert "Words in Math Mode (Microsoft Word): 0" in text


def test_wordsfile_token_multiset_matches_golden(out_dir: Path) -> None:
    """Counted body tokens should match the golden wordsfile multiset."""
    cfg = PipelineConfig(
        pdffile=str(PDF),
        logfile=str(out_dir / "logfile.txt"),
        wordsfile=str(out_dir / "wordsfile.txt"),
        nonwordsfile=str(out_dir / "nonwordsfile.txt"),
        images_folder=str(out_dir / "PDFFILE"),
        extract=False,
        strings_figures=str(out_dir / "file_strings_from_images.txt"),
        mathmodewords=str(out_dir / "mathmodewords.txt"),
    )
    run_pipeline(cfg)
    golden = (FIXTURES / "wordsfile.txt").read_text(encoding="utf8").split()
    ours = (out_dir / "wordsfile.txt").read_text(encoding="utf8").split()
    assert ours == golden


def test_categorize_numeric_and_greek() -> None:
    words = ["hello", "123", "Î±Î²Î³", "world", "...", ","]
    # Greek: Î± is U+03B1 â†’ raw_unicode_escape contains \u03
    kept, cw, non, cnw, cm = categorize_words(list(words), 0, 0, 0)
    assert "hello" in kept
    assert "world" in kept
    assert "123" in non
    assert cw == 2


def test_dots_only_no_nonword_increment() -> None:
    words = ["...."]
    kept, cw, non, cnw, cm = categorize_words(list(words), 0, 0, 0)
    assert kept == []
    assert non == ["...."]
    assert cnw == 0  # original quirk


def test_first_page_skipped(out_dir: Path) -> None:
    cfg = PipelineConfig(
        pdffile=str(PDF),
        logfile=str(out_dir / "logfile.txt"),
        wordsfile=str(out_dir / "wordsfile.txt"),
        nonwordsfile=str(out_dir / "nonwordsfile.txt"),
        images_folder=str(out_dir / "PDFFILE"),
        extract=False,
        strings_figures=str(out_dir / "file_strings_from_images.txt"),
        mathmodewords=str(out_dir / "mathmodewords.txt"),
    )
    result = run_pipeline(cfg)
    # Page index 0 (cover) must have no counted words
    assert result.counted_words[0] == []


def test_tokenize() -> None:
    assert tokenize("a b\nc  d") == ["a", "b", "c", "d"]

