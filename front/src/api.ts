// ─── Polyphemus backend client ───────────────────────────────────────────────
//
// The backend is the FastAPI service in /api (deployed on Hugging Face Spaces).
// Set VITE_API_URL at build time (Vercel env var) to point at the Space, e.g.
//   VITE_API_URL=https://<user>-<space>.hf.space

export interface PageResult {
  page: number
  words: number
  nonWords: number
  mathWords: number
  figures: number
}

export interface AnalysisFiles {
  words: string
  nonwords: string
  math: string
  log: string
  stringsFromImages: string
}

export interface AnalysisResult {
  totalWords: number
  totalNonWords: number
  totalMathWords: number
  totalFigures: number
  pages: PageResult[]
  figures: string[]
  logLines: string[]
  fileName?: string
  wordsInFigures?: number
  nonWordsInFigures?: number
  specialPages?: number
  files?: AnalysisFiles
}

// Raw response shape from POST /count
interface CountResponse {
  words: number
  non_words: number
  figures: number
  words_in_figures: number
  non_words_in_figures: number
  pages: number
  special_pages: number
  math_words: number
  page_stats: {
    page: number
    words: number
    non_words: number
    math_words: number
    figures: number
    counted: boolean
  }[]
  log?: string[]
  figure_images?: { name: string; data_url: string }[]
  files?: {
    wordsfile: string
    nonwordsfile: string
    mathmodewords: string
    strings_from_images: string
    logfile: string
  }
}

export const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:7860"
).replace(/\/+$/, "")

export async function countPdf(
  file: File,
  opts: { ocr: boolean },
): Promise<CountResponse> {
  const form = new FormData()
  form.append("file", file)
  form.append("ocr", String(opts.ocr))
  form.append("include_figures", "true")
  form.append("include_files", "true")

  let res: Response
  try {
    res = await fetch(`${API_URL}/count`, { method: "POST", body: form })
  } catch {
    throw new Error(
      `Não foi possível conectar ao backend em ${API_URL}. ` +
        "Verifique se o serviço está no ar e se VITE_API_URL está configurada.",
    )
  }

  if (!res.ok) {
    let detail = `Erro HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // non-JSON error body; keep generic message
    }
    throw new Error(detail)
  }

  return res.json() as Promise<CountResponse>
}

export function toAnalysisResult(r: CountResponse, fileName: string): AnalysisResult {
  const logLines =
    r.log && r.log.length > 0
      ? r.log
      : (r.files?.logfile ?? "").split("\n").filter((l) => l.trim().length > 0)

  return {
    totalWords: r.words,
    totalNonWords: r.non_words,
    totalMathWords: r.math_words,
    totalFigures: r.figures,
    wordsInFigures: r.words_in_figures,
    nonWordsInFigures: r.non_words_in_figures,
    specialPages: r.special_pages,
    fileName,
    pages: (r.page_stats ?? []).map((p) => ({
      page: p.page,
      words: p.words,
      nonWords: p.non_words,
      mathWords: p.math_words,
      figures: p.figures,
    })),
    figures: (r.figure_images ?? []).map((f) => f.data_url),
    logLines: [
      `Polyphemus awakens. Eye opening...`,
      `PDF analisado: ${fileName} (${r.pages} páginas)`,
      ...logLines,
      `Polyphemus viu tudo. O olho fecha.`,
    ],
    files: r.files
      ? {
          words: r.files.wordsfile,
          nonwords: r.files.nonwordsfile,
          math: r.files.mathmodewords,
          log: r.files.logfile,
          stringsFromImages: r.files.strings_from_images,
        }
      : undefined,
  }
}

// ─── Client-side download helpers (export screen) ────────────────────────────

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename)
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
