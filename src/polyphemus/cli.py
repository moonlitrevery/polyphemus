"""CLI entry point — same flags as PyAeroCounter."""

from __future__ import annotations

import getopt
import sys

from polyphemus.pipeline import PipelineConfig, run_pipeline


def usage() -> int:
    print(
        "usage: [-o logfile] [-w wordsfile] [-n nonwordsfile] "
        " [-d output_dir]  [-i input.pdf] [-e extract_words_from_images] "
        "[-f file_strings_from_images] [-g mathmodewords] ..."
    )
    return 100


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    try:
        opts, _args = getopt.getopt(argv, "o:w:n:d:i:e:f:g:")
    except getopt.GetoptError as err:
        print(err)
        usage()
        return 2

    config = PipelineConfig()

    for k, v in opts:
        if k == "-o":
            config.logfile = v
        elif k == "-w":
            config.wordsfile = v
        elif k == "-n":
            config.nonwordsfile = v
        elif k == "-d":
            config.images_folder = v
        elif k == "-i":
            config.pdffile = v
        elif k == "-e":
            # Original stores extract as string from getopt; truthy unless "0"
            config.extract = str(v) not in ("0", "false", "False", "")
        elif k == "-f":
            config.strings_figures = v
        elif k == "-g":
            config.mathmodewords = v

    result = run_pipeline(config)
    print(f"Words:         {result.words}")
    print(f"Non-Words:     {result.non_words}")
    print(f"Figures Files: {result.figures}")
    print(f"Words in Figures: {result.words_in_figures}")
    print(f"Non-Words in Figures: {result.non_words_in_figures}")
    print(f"Total Num. of Pages: {result.pages}")
    print(f"Num. of Special Pages: {result.special_pages}")
    print(f"Words in Math Mode (Microsoft Word): {result.math_words}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
