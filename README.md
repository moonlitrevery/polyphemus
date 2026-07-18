# Polyphemus

Word counter for **SAE Brasil AeroDesign** technical reports.

Faithful modern port of [PyAeroCounter](https://github.com/comissao-aerodesign/PyAeroCounter): same counting rules, Python 3.12+, **PyMuPDF** instead of pdfminer3, and **PyMuPDF image extraction** instead of MiKTeX `pdftohtml`. OCR still uses **Tesseract** (free).

## Counting rules (unchanged)

- Skip cover page (page 1)
- Exclude header/footer zones (geometry thresholds in cm)
- Mark special pages via bilingual keywords (TOC, symbol lists, bibliography, ...)
- Filter numbers, Greek letters, punctuation-only tokens, Word math-mode glyphs
- Optionally OCR figures and count words inside images separately

## Install (local)

Requires [uv](https://docs.astral.sh/uv/):

```bash
uv sync
# system dependency for OCR:
#   Windows: install Tesseract and add to PATH
#   Debian/Ubuntu: apt install tesseract-ocr tesseract-ocr-por
```

## CLI

Same flags as PyAeroCounter:

```bash
uv run polyphemus -i report.pdf -o logfile.txt -w wordsfile.txt -n nonwordsfile.txt -d PDFFILE -e 1
```

| Flag | Default | Meaning |
|------|---------|---------|
| `-i` | `pdffile.pdf` | Input PDF |
| `-o` | `logfile.txt` | Summary log |
| `-w` | `wordsfile.txt` | Counted words |
| `-n` | `nonwordsfile.txt` | Excluded tokens |
| `-d` | `PDFFILE` | Images output folder |
| `-e` | `1` | OCR images (`0` to skip) |
| `-f` | `file_strings_from_images.txt` | OCR text dump |
| `-g` | `mathmodewords.txt` | Math-mode word dump |

Log format matches the original:

```
Words:         2065
Non-Words:     11
Figures Files: 20
Words in Figures: ...
Non-Words in Figures: ...
Total Num. of Pages: 13
Num. of Special Pages: 7
Words in Math Mode (Microsoft Word): 0
```

## Fidelity tests

```bash
uv run pytest -v
```

Hard assertions vs. the original golden fixture (`tests/fixtures/`):

- Words = **2065**
- Non-Words = **11**
- Pages = **13**
- Special pages = **7**
- Figure files = **20**
- `wordsfile.txt` token sequence identical to the original

OCR figure-word counts can vary with Tesseract version (same as the original tool).

## API

```bash
uv run uvicorn api.main:app --reload --port 7860
```

### `POST /count`

Multipart form:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `file` | file | required | PDF upload |
| `ocr` | bool | `true` | Run OCR on figures |
| `include_lists` | bool | `false` | Include token lists |

JSON response:

```json
{
  "words": 2065,
  "non_words": 11,
  "figures": 20,
  "words_in_figures": 173,
  "non_words_in_figures": 86,
  "pages": 13,
  "special_pages": 7,
  "math_words": 0
}
```

Also: `GET /health`, interactive docs at `/docs`.

CORS is open to `*.vercel.app` and configurable via `CORS_ORIGINS`.

## Deploy (free)

### Backend — Hugging Face Spaces (Docker)

1. Create a Space → **Docker**
2. Push this repo (or connect GitHub)
3. Space builds the `Dockerfile` (Python 3.12 + Tesseract + uv)
4. API listens on port **7860**

No paid OCR API — Tesseract runs inside the container.

### Frontend — Vercel

Point your Figma/Next.js app at the Spaces URL:

```
POST https://<user>-<space>.hf.space/count
```

## Project layout

```
polyphemus/
├── src/polyphemus/
│   ├── rules.py       # token filters (1:1 with PyAeroCounter)
│   ├── extract.py     # PyMuPDF text + layout
│   ├── images.py      # PyMuPDF image extract
│   ├── ocr.py         # pytesseract
│   ├── pipeline.py    # orchestration
│   └── cli.py         # CLI
├── api/main.py        # FastAPI
├── tests/             # fidelity suite + golden fixtures
├── Dockerfile         # HF Spaces (uv-based build)
├── pyproject.toml     # uv build backend + dependency groups
└── uv.lock            # reproducible dependency lockfile
```

## Credits

Original PyAeroCounter by Geovana Neves / [Comissão Técnica Aerodesign](http://www.aeroct.com.br).
