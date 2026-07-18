"""Extract images from PDF via PyMuPDF (replaces pdftohtml / MiKTeX)."""

from __future__ import annotations

from pathlib import Path


def extract_images(pdffile: str, images_folder: str) -> list[str]:
    """Extract embedded images from PDF into images_folder.

    Returns sorted list of image file paths (png/jpg) written.
    Uses PyMuPDF instead of MiKTeX pdftohtml; naming is
    ``{stem}-{page}_{idx}.{ext}`` for stable local ordering.
    """
    import fitz

    out = Path(images_folder)
    out.mkdir(parents=True, exist_ok=True)

    # Clear previous extracts in folder to avoid stale OCR
    for old in out.iterdir():
        if old.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif"}:
            old.unlink(missing_ok=True)

    stem = Path(pdffile).stem
    written: list[str] = []
    doc = fitz.open(pdffile)

    # Track xref so each unique image is extracted once (pdftohtml also
    # extracts per-page instances; we extract each page occurrence to
    # match figure-file counts more closely).
    for page_index, page in enumerate(doc, start=1):
        images = page.get_images(full=True)
        for img_index, img in enumerate(images, start=1):
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue

            if pix.n - pix.alpha > 3:
                # CMYK or other → convert to RGB
                pix = fitz.Pixmap(fitz.csRGB, pix)

            # Prefer png for lossless; use jpg for RGB without alpha when large
            if pix.alpha:
                # Drop alpha for OCR friendliness
                pix = fitz.Pixmap(pix, 0)  # remove alpha

            ext = "png"
            filename = f"{stem}-{page_index}_{img_index}.{ext}"
            path = out / filename
            pix.save(str(path))
            written.append(str(path))
            pix = None

    doc.close()
    written.sort()
    return written


def list_image_files(images_folder: str) -> list[str]:
    """List .png/.jpg files in images_folder (same filter as original)."""
    folder = Path(images_folder)
    if not folder.is_dir():
        return []
    images = [
        p.name
        for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in {".png", ".jpg"}
    ]
    images.sort()
    return images
