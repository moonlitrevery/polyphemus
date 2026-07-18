import { useState, useRef, useEffect, useCallback } from "react"
import {
  countPdf,
  toAnalysisResult,
  downloadText,
  downloadDataUrl,
  type AnalysisResult,
  type PageResult,
} from "./api"

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = "upload" | "config" | "processing" | "dashboard" | "log" | "faq" | "export"

interface Config {
  extractImages: boolean
  countNonWords: boolean
  mathMode: boolean
  separateSections: boolean
}

// ─── Demo data (used only by the "Demo" button, no backend required) ─────────

const DEMO_RESULT: AnalysisResult = {
  totalWords: 2065,
  totalNonWords: 11,
  totalMathWords: 0,
  totalFigures: 20,
  fileName: "relatorio_exemplo.pdf",
  pages: [
    { page: 1, words: 0, nonWords: 0, mathWords: 0, figures: 1 },
    { page: 2, words: 180, nonWords: 1, mathWords: 0, figures: 2 },
    { page: 3, words: 210, nonWords: 0, mathWords: 0, figures: 1 },
    { page: 4, words: 175, nonWords: 2, mathWords: 0, figures: 3 },
    { page: 5, words: 190, nonWords: 1, mathWords: 0, figures: 2 },
    { page: 6, words: 205, nonWords: 0, mathWords: 0, figures: 1 },
    { page: 7, words: 160, nonWords: 2, mathWords: 0, figures: 2 },
    { page: 8, words: 185, nonWords: 1, mathWords: 0, figures: 3 },
    { page: 9, words: 170, nonWords: 1, mathWords: 0, figures: 1 },
    { page: 10, words: 195, nonWords: 1, mathWords: 0, figures: 2 },
    { page: 11, words: 150, nonWords: 1, mathWords: 0, figures: 1 },
    { page: 12, words: 145, nonWords: 1, mathWords: 0, figures: 1 },
    { page: 13, words: 100, nonWords: 0, mathWords: 0, figures: 0 },
  ],
  figures: [],
  logLines: [
    "Polyphemus awakens. Eye opening...",
    "PDF analisado: relatorio_exemplo.pdf (13 páginas)",
    "Words:         2065",
    "Non-Words:     11",
    "Figures Files: 20",
    "Total Num. of Pages: 13",
    "Num. of Special Pages: 7",
    "Words in Math Mode (Microsoft Word): 0",
    "Polyphemus viu tudo. O olho fecha.",
  ],
}

const PROCESSING_STEPS = [
  { label: "Abrindo o olho", sub: "Inicializando Polyphemus", duration: 600 },
  { label: "Enviando o PDF", sub: "upload para o servidor de análise", duration: 900 },
  { label: "Extraindo texto bruto", sub: "PyMuPDF em execução", duration: 1400 },
  { label: "Rodando OCR nas imagens", sub: "Tesseract — varredura de figuras", duration: 2000 },
  { label: "Contando palavras", sub: "tokenização e filtragem", duration: 1500 },
  { label: "Compilando resultados", sub: "gerando arquivos de saída", duration: 1200 },
]

// ─── FAQ content ──────────────────────────────────────────────────────────────

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "O que o Polyphemus conta, exatamente?",
    a: "Ele conta as palavras válidas do corpo do texto de um relatório técnico AeroDesign, seguindo as regras oficiais do PyAeroCounter: tokens compostos apenas por letras entram na contagem; números, letras gregas, pontuação isolada e símbolos matemáticos do Word são separados como \"non-words\". O resultado é o mesmo que a ferramenta oficial da Comissão Técnica produziria.",
  },
  {
    q: "Por que o número é diferente da contagem do Word / Google Docs?",
    a: "Porque as regras são diferentes de propósito. O Word conta tudo: números, siglas com dígitos, células de tabela, cabeçalhos, rodapés e a capa. O Polyphemus segue o regulamento: exclui a página 1 (capa), ignora cabeçalhos e rodapés, desconsidera páginas especiais (sumário, listas, referências) e filtra tokens que não são palavras. É normal o valor ser menor que o do Word.",
  },
  {
    q: "Quais páginas ficam de fora da contagem?",
    a: "A página 1 (capa) sempre fica de fora. Além dela, páginas cujo cabeçalho ou rodapé contém palavras-chave como \"Sumário\", \"Lista de Símbolos\", \"Referências\", \"Bibliografia\" (e as versões em inglês) são marcadas como páginas especiais e não são contadas. O número de páginas especiais aparece no log.",
  },
  {
    q: "O que são \"non-words\"?",
    a: "Tokens encontrados no texto que não contam como palavra: números (ou qualquer token contendo dígito), letras gregas, pontuação isolada, símbolos e strings em modo matemático do Microsoft Word. Eles são listados no arquivo nonwordsfile.txt para você conferir o que foi excluído.",
  },
  {
    q: "O que são \"math-words\"?",
    a: "Quando o relatório é escrito no Microsoft Word, as equações usam glifos matemáticos especiais (Unicode U+1D400+). O Polyphemus detecta esses tokens, não os conta como palavras e registra os que parecem palavras dentro de equações no arquivo mathmodewords.txt — útil para verificar se texto normal foi digitado dentro do editor de equações por engano.",
  },
  {
    q: "Como funciona a contagem de palavras nas figuras (OCR)?",
    a: "As imagens do PDF são extraídas e passadas pelo Tesseract OCR (com português e inglês). As palavras encontradas dentro das figuras são contadas separadamente — \"Words in Figures\" no log — e não somam na contagem principal. Serve para detectar texto \"escondido\" em imagens. Você pode desligar o OCR na tela de configuração para uma análise mais rápida.",
  },
  {
    q: "Por que a primeira análise demora tanto (ou dá erro de conexão)?",
    a: "O backend roda em um servidor gratuito que hiberna após 15 minutos sem uso. A primeira requisição depois de um período parado precisa \"acordar\" o servidor, o que leva cerca de um minuto. Se aparecer erro de conexão, aguarde alguns segundos e clique em analisar novamente — na segunda tentativa costuma funcionar de imediato.",
  },
  {
    q: "Meu PDF fica salvo em algum servidor?",
    a: "Não. O arquivo é processado em uma pasta temporária que é apagada assim que a análise termina. Nada é armazenado — nem o PDF, nem as contagens, nem as figuras extraídas. Cada análise é independente e efêmera.",
  },
  {
    q: "Existe limite de tamanho ou de páginas?",
    a: "Não há limite fixo, mas o servidor gratuito tem memória modesta. Relatórios AeroDesign típicos (até algumas dezenas de páginas) processam sem problema. PDFs muito grandes ou com muitas imagens em alta resolução podem demorar mais, principalmente com OCR ligado.",
  },
  {
    q: "O resultado é idêntico ao PyAeroCounter oficial?",
    a: "Sim. O Polyphemus é um porte fiel do PyAeroCounter, validado por testes automatizados que comparam a saída com a ferramenta original: mesma contagem de palavras, non-words, páginas, páginas especiais e a mesma sequência de tokens nos arquivos de saída.",
  },
  {
    q: "O que cada arquivo exportado contém?",
    a: "wordsfile.txt — todas as palavras que entraram na contagem, na ordem do documento; nonwordsfile.txt — os tokens excluídos; mathmodewords.txt — palavras detectadas em modo matemático do Word; logfile.txt — o resumo com todos os totais; e as figuras extraídas em PNG. São os mesmos arquivos que a ferramenta oficial gera.",
  },
  {
    q: "A análise falhou com \"Verifique o Documento PDF\". O que houve?",
    a: "O PDF provavelmente não tem camada de texto — é o caso de documentos escaneados ou exportados como imagem. O contador lê o texto embutido no PDF; se ele não existe, não há o que contar. Gere o PDF diretamente do Word/LaTeX (sem \"imprimir para PDF\" via imagem) e tente de novo.",
  },
]

// ─── Eye Component ────────────────────────────────────────────────────────────

function PolyphemusEye({
  size = 120,
  scanning = false,
  active = false,
  className = "",
}: {
  size?: number
  scanning?: boolean
  active?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ filter: active ? "drop-shadow(0 0 16px rgba(212,160,23,0.8))" : "drop-shadow(0 0 8px rgba(212,160,23,0.4))" }}
    >
      <defs>
        <radialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1A0A00" />
          <stop offset="35%" stopColor="#6B2E00" />
          <stop offset="65%" stopColor="#D4A017" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8B6010" />
        </radialGradient>
        <radialGradient id="scleraGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1C1810" />
          <stop offset="100%" stopColor="#0A0A0F" />
        </radialGradient>
        <radialGradient id="pupilGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#2A1500" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <clipPath id="eyeClip">
          <ellipse cx="50" cy="50" rx="46" ry="28" />
        </clipPath>
      </defs>

      {/* Outer eye shape — eyelids */}
      <ellipse cx="50" cy="50" rx="48" ry="30" fill="none" stroke="#D4A017" strokeWidth="0.5" strokeOpacity="0.4" />

      {/* Sclera */}
      <ellipse cx="50" cy="50" rx="46" ry="28" fill="url(#scleraGrad)" />

      {/* Iris */}
      <g clipPath="url(#eyeClip)">
        <circle
          cx="50" cy="50" r="20"
          fill="url(#irisGrad)"
          className={active ? "animate-iris-pulse" : ""}
        />
        {/* Iris texture lines */}
        {[0, 30, 60, 90, 120, 150].map((angle) => (
          <line
            key={angle}
            x1={50 + 8 * Math.cos((angle * Math.PI) / 180)}
            y1={50 + 8 * Math.sin((angle * Math.PI) / 180)}
            x2={50 + 19 * Math.cos((angle * Math.PI) / 180)}
            y2={50 + 19 * Math.sin((angle * Math.PI) / 180)}
            stroke="#D4A017"
            strokeWidth="0.4"
            strokeOpacity="0.5"
          />
        ))}
        {/* Pupil */}
        <circle cx="50" cy="50" r="8" fill="url(#pupilGrad)" />
        {/* Pupil glint */}
        <circle cx="46" cy="46" r="2.5" fill="white" fillOpacity="0.15" />

        {/* Scan line */}
        {scanning && (
          <rect
            x="4" y="42" width="92" height="2"
            fill="#D4A017"
            fillOpacity="0.7"
            style={{
              animation: "scanline 1.2s linear infinite",
              position: "relative",
            }}
          />
        )}
      </g>

      {/* Eyelid curves */}
      <path
        d="M 4 50 Q 50 22 96 50"
        fill="none"
        stroke="#D4A017"
        strokeWidth="1"
        strokeOpacity="0.6"
      />
      <path
        d="M 4 50 Q 50 78 96 50"
        fill="none"
        stroke="#D4A017"
        strokeWidth="1"
        strokeOpacity="0.6"
      />

      {/* Corner details */}
      <circle cx="4" cy="50" r="1.5" fill="#D4A017" fillOpacity="0.7" />
      <circle cx="96" cy="50" r="1.5" fill="#D4A017" fillOpacity="0.7" />
    </svg>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ screen, onNav }: { screen: Screen; onNav: (s: Screen) => void }) {
  const items: { id: Screen; label: string }[] = [
    { id: "upload", label: "Upload" },
    { id: "config", label: "Configurar" },
    { id: "processing", label: "Varredura" },
    { id: "dashboard", label: "Resultados" },
    { id: "log", label: "Log" },
    { id: "export", label: "Exportar" },
    { id: "faq", label: "FAQ" },
  ]

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(10,10,15,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(212,160,23,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        height: 60,
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <PolyphemusEye size={32} active />
        <span
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 18,
            fontWeight: 700,
            color: "#D4A017",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Polyphemus
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2 }}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.1em",
              padding: "6px 14px",
              color: screen === item.id ? "#D4A017" : "#7A7264",
              borderBottom: screen === item.id ? "2px solid #D4A017" : "2px solid transparent",
              transition: "color 0.2s, border-color 0.2s",
              textTransform: "uppercase",
            }}
            onMouseEnter={(e) => {
              if (screen !== item.id) (e.currentTarget as HTMLButtonElement).style.color = "#E8DFC8"
            }}
            onMouseLeave={(e) => {
              if (screen !== item.id) (e.currentTarget as HTMLButtonElement).style.color = "#7A7264"
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Status */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#7A7264", letterSpacing: "0.08em" }}>
        <span style={{ color: "#2E7D32", marginRight: 6 }}>●</span>
        v1.1
      </div>
    </nav>
  )
}

// ─── Upload Screen ────────────────────────────────────────────────────────────

function UploadScreen({ onNext }: { onNext: (file: File | null) => void }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === "application/pdf") setFile(dropped)
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  return (
    <div
      className="blueprint-grid"
      style={{
        minHeight: "100vh",
        paddingTop: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background eye watermark */}
      <div style={{ position: "absolute", opacity: 0.04, pointerEvents: "none", zIndex: 0 }}>
        <PolyphemusEye size={480} />
      </div>

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 680, padding: "0 24px" }}>
        {/* Heading */}
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.3em",
              color: "#D4A017",
              textTransform: "uppercase",
              opacity: 0.8,
            }}
          >
            Motor de Análise Documental
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: "clamp(36px, 6vw, 72px)",
            fontWeight: 900,
            color: "#E8DFC8",
            margin: "0 0 8px",
            lineHeight: 1.05,
            letterSpacing: "0.04em",
          }}
        >
          POLYPHEMUS
        </h1>
        <p
          style={{
            fontFamily: "'Crimson Pro', Georgia, serif",
            fontSize: 18,
            color: "#7A7264",
            marginBottom: 48,
            fontStyle: "italic",
          }}
        >
          "Um olho que vê e devora cada detalhe do documento."
        </p>

        {/* Eye + Drop Zone */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
          <PolyphemusEye
            size={file ? 160 : 120}
            active={dragging || !!file}
            scanning={dragging}
            className={file ? "animate-iris-pulse" : ""}
          />

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              width: "100%",
              maxWidth: 520,
              border: `2px dashed ${dragging ? "#D4A017" : file ? "rgba(212,160,23,0.6)" : "rgba(212,160,23,0.25)"}`,
              borderRadius: 8,
              padding: "40px 32px",
              cursor: "pointer",
              background: dragging
                ? "rgba(212,160,23,0.06)"
                : file
                ? "rgba(212,160,23,0.04)"
                : "rgba(15,15,28,0.6)",
              transition: "all 0.3s ease",
              position: "relative",
              overflow: "hidden",
              boxShadow: dragging
                ? "0 0 40px rgba(212,160,23,0.2), inset 0 0 40px rgba(212,160,23,0.05)"
                : "none",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={handleFile}
            />

            {file ? (
              <div style={{ animation: "fadeInUp 0.4s ease-out" }}>
                <div
                  style={{
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 13,
                    color: "#D4A017",
                    letterSpacing: "0.15em",
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  Arquivo Selecionado
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 15,
                    color: "#E8DFC8",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {file.name}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#7A7264",
                  }}
                >
                  {(file.size / 1_048_576).toFixed(2)} MB · PDF Document
                </div>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: dragging ? 20 : 16,
                    color: dragging ? "#D4A017" : "#7A7264",
                    marginBottom: 8,
                    transition: "all 0.3s",
                    letterSpacing: "0.08em",
                  }}
                >
                  {dragging ? "Solte o relatório aqui" : "Arraste seu PDF aqui"}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: "#4A4438",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                  }}
                >
                  ou clique para selecionar · .PDF
                </div>
              </div>
            )}
          </div>

          {/* Demo / Real file buttons */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => onNext(file)}
              style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 13,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                fontWeight: 700,
                padding: "14px 40px",
                background: "linear-gradient(135deg, #D4A017, #8B6010)",
                color: "#0A0A0F",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                transition: "all 0.25s",
                boxShadow: "0 0 24px rgba(212,160,23,0.35)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(212,160,23,0.6)"
                ;(e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(212,160,23,0.35)"
                ;(e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"
              }}
            >
              {file ? "Iniciar Análise" : "Demo com Relatório de Exemplo"}
            </button>

            {file && (
              <button
                onClick={() => setFile(null)}
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "14px 24px",
                  background: "transparent",
                  color: "#7A7264",
                  border: "1px solid rgba(122,114,100,0.3)",
                  borderRadius: 4,
                  cursor: "pointer",
                  transition: "color 0.2s, border-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "#E8DFC8"
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(232,223,200,0.4)"
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "#7A7264"
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(122,114,100,0.3)"
                }}
              >
                Remover
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Config Screen ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  sub,
  accent = "#D4A017",
}: {
  checked: boolean
  onChange: () => void
  label: string
  sub?: string
  accent?: string
}) {
  return (
    <div
      onClick={onChange}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        background: checked ? "rgba(212,160,23,0.05)" : "rgba(15,15,28,0.6)",
        border: `1px solid ${checked ? "rgba(212,160,23,0.3)" : "rgba(122,114,100,0.15)"}`,
        borderRadius: 6,
        cursor: "pointer",
        transition: "all 0.25s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(212,160,23,0.08)"
        ;(e.currentTarget as HTMLDivElement).style.borderColor = "rgba(212,160,23,0.35)"
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = checked ? "rgba(212,160,23,0.05)" : "rgba(15,15,28,0.6)"
        ;(e.currentTarget as HTMLDivElement).style.borderColor = checked ? "rgba(212,160,23,0.3)" : "rgba(122,114,100,0.15)"
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 13,
            fontWeight: 600,
            color: checked ? "#E8DFC8" : "#7A7264",
            letterSpacing: "0.08em",
            marginBottom: sub ? 4 : 0,
            transition: "color 0.25s",
          }}
        >
          {label}
        </div>
        {sub && (
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "#4A4438",
              letterSpacing: "0.08em",
            }}
          >
            {sub}
          </div>
        )}
      </div>

      {/* Toggle pill */}
      <div
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: checked ? accent : "#1A1A2E",
          border: `1px solid ${checked ? accent : "rgba(122,114,100,0.3)"}`,
          position: "relative",
          transition: "all 0.25s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: checked ? "#0A0A0F" : "#4A4438",
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2,
            transition: "all 0.25s",
            boxShadow: checked ? `0 0 8px ${accent}80` : "none",
          }}
        />
      </div>
    </div>
  )
}

function ConfigScreen({ config, onChange, onNext }: {
  config: Config
  onChange: (c: Config) => void
  onNext: () => void
}) {
  const update = (key: keyof Config) => onChange({ ...config, [key]: !config[key] })

  return (
    <div
      className="blueprint-grid"
      style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 60, display: "flex", justifyContent: "center" }}
    >
      <div style={{ width: "100%", maxWidth: 720, padding: "0 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.3em",
              color: "#D4A017",
              textTransform: "uppercase",
              marginBottom: 12,
              opacity: 0.8,
            }}
          >
            ── Painel de Controle ──
          </div>
          <h2
            style={{
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 36,
              fontWeight: 700,
              color: "#E8DFC8",
              margin: 0,
              letterSpacing: "0.06em",
            }}
          >
            Configurações de Varredura
          </h2>
          <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 17, color: "#7A7264", marginTop: 8 }}>
            Defina o escopo da análise antes de invocar o olho.
          </p>
        </div>

        {/* Sections */}
        <div style={{ display: "grid", gap: 32 }}>
          {/* Extração */}
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.25em",
                color: "#D4A017",
                textTransform: "uppercase",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "rgba(212,160,23,0.2)" }} />
              Extração de Conteúdo
              <span style={{ flex: 1, height: 1, background: "rgba(212,160,23,0.2)" }} />
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <Toggle
                checked={config.extractImages}
                onChange={() => update("extractImages")}
                label="OCR nas Figuras"
                sub="Extrai figuras do PDF e conta palavras dentro das imagens (Tesseract)"
              />
            </div>
          </section>

          {/* Status summary */}
          <div
            style={{
              padding: "16px 24px",
              background: "rgba(10,10,15,0.8)",
              border: "1px solid rgba(212,160,23,0.12)",
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "#4A4438",
              display: "grid",
              gap: "6px 24px",
            }}
          >
            <span>ocr: <span style={{ color: config.extractImages ? "#D4A017" : "#6B1A2E" }}>{config.extractImages ? "true" : "false"}</span></span>
            <span style={{ color: "#4A4438" }}>
              Regras de contagem PyAeroCounter: página 1 excluída, cabeçalho/rodapé ignorados,
              páginas especiais detectadas por palavras-chave, números/grego/pontuação filtrados.
            </span>
          </div>
        </div>

        {/* CTA */}
        <div style={{ marginTop: 40, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onNext}
            style={{
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
              padding: "16px 48px",
              background: "linear-gradient(135deg, #D4A017, #8B6010)",
              color: "#0A0A0F",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              boxShadow: "0 0 24px rgba(212,160,23,0.35)",
              transition: "all 0.25s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 40px rgba(212,160,23,0.6)"
              ;(e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px rgba(212,160,23,0.35)"
              ;(e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"
            }}
          >
            Invocar o Olho →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Processing Screen ────────────────────────────────────────────────────────

function ProcessingScreen({ file, config, onComplete, onBack }: {
  file: File | null
  config: Config
  onComplete: (result: AnalysisResult) => void
  onBack: () => void
}) {
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<AnalysisResult | null>(null)

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    let interval: ReturnType<typeof setInterval> | null = null

    // Step label animation (loops on the last steps while the request runs)
    let totalTime = 0
    PROCESSING_STEPS.forEach((s, i) => {
      const t = setTimeout(() => {
        if (!cancelled) setStep(i)
      }, totalTime)
      timers.push(t)
      totalTime += s.duration
    })

    // Asymptotic progress toward 90% until the response lands
    let elapsed = 0
    interval = setInterval(() => {
      elapsed += 100
      if (!cancelled) {
        setProgress((p) => Math.min(p + Math.max(0.2, (90 - p) * 0.012), 90))
      }
    }, 100)

    const finish = (result: AnalysisResult) => {
      if (cancelled) return
      resultRef.current = result
      if (interval) clearInterval(interval)
      setStep(PROCESSING_STEPS.length - 1)
      setProgress(100)
      setDone(true)
    }

    if (!file) {
      // Demo mode — no backend involved
      const t = setTimeout(() => finish(DEMO_RESULT), totalTime + 200)
      timers.push(t)
    } else {
      countPdf(file, { ocr: config.extractImages })
        .then((response) => finish(toAnalysisResult(response, file.name)))
        .catch((err: Error) => {
          if (cancelled) return
          if (interval) clearInterval(interval)
          setError(err.message)
        })
    }

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      if (interval) clearInterval(interval)
    }
  }, [file, config.extractImages])

  const currentStep = PROCESSING_STEPS[Math.min(step, PROCESSING_STEPS.length - 1)]

  return (
    <div
      className="blueprint-grid"
      style={{
        minHeight: "100vh",
        paddingTop: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient particles */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 2,
            height: 2,
            borderRadius: "50%",
            background: "#D4A017",
            left: `${10 + i * 12}%`,
            bottom: "10%",
            animation: `float-particle ${3 + i * 0.7}s ease-in-out ${i * 0.4}s infinite`,
            pointerEvents: "none",
          }}
        />
      ))}

      <div style={{ textAlign: "center", maxWidth: 560, padding: "0 24px", position: "relative", zIndex: 1 }}>
        {/* Orbital rings around eye */}
        <div style={{ position: "relative", display: "inline-block", marginBottom: 48 }}>
          {/* Outer orbital */}
          <div
            style={{
              position: "absolute",
              inset: -40,
              border: "1px solid rgba(212,160,23,0.15)",
              borderRadius: "50%",
            }}
            className={done || error ? "" : "animate-spin-slow"}
          >
            <div
              style={{
                position: "absolute",
                top: -3,
                left: "50%",
                transform: "translateX(-50%)",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#D4A017",
                boxShadow: "0 0 8px #D4A017",
              }}
            />
          </div>
          {/* Inner orbital */}
          <div
            style={{
              position: "absolute",
              inset: -24,
              border: "1px solid rgba(107,26,46,0.3)",
              borderRadius: "50%",
            }}
            className={done || error ? "" : "animate-counter-spin"}
          >
            <div
              style={{
                position: "absolute",
                bottom: -3,
                left: "50%",
                transform: "translateX(-50%)",
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "#6B1A2E",
                boxShadow: "0 0 6px #6B1A2E",
              }}
            />
          </div>

          <PolyphemusEye
            size={140}
            scanning={!done && !error}
            active
            className={done || error ? "" : "animate-amber-flicker"}
          />
        </div>

        <h2
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 28,
            fontWeight: 700,
            color: error ? "#6B1A2E" : "#E8DFC8",
            margin: "0 0 8px",
            letterSpacing: "0.08em",
          }}
        >
          {error ? "O Olho Encontrou um Problema" : done ? "Varredura Concluída" : "O Olho Varre o Documento"}
        </h2>

        {error ? (
          <div
            style={{
              margin: "24px 0",
              padding: "16px 20px",
              background: "rgba(107,26,46,0.15)",
              border: "1px solid rgba(107,26,46,0.5)",
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: "#E8DFC8",
              lineHeight: 1.6,
              textAlign: "left",
            }}
          >
            {error}
          </div>
        ) : (
          <>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: "#D4A017",
                marginBottom: 6,
                letterSpacing: "0.08em",
                minHeight: 20,
              }}
            >
              {done ? "Todos os dados extraídos com êxito" : currentStep?.label}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "#4A4438",
                marginBottom: 40,
                letterSpacing: "0.08em",
                minHeight: 16,
              }}
            >
              {done ? "" : currentStep?.sub}
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: "100%",
                height: 3,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 2,
                overflow: "hidden",
                marginBottom: 16,
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: done
                    ? "linear-gradient(90deg, #D4A017, #8B6010)"
                    : "linear-gradient(90deg, #6B1A2E, #D4A017)",
                  borderRadius: 2,
                  transition: "width 0.1s linear",
                  boxShadow: `0 0 8px ${done ? "#D4A017" : "#6B1A2E"}80`,
                }}
              />
            </div>

            {/* Step indicators */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 40 }}>
              {PROCESSING_STEPS.map((s, i) => (
                <div
                  key={i}
                  title={s.label}
                  style={{
                    width: i < step || done ? 24 : 8,
                    height: 4,
                    borderRadius: 2,
                    background:
                      done || i < step
                        ? "#D4A017"
                        : i === step
                        ? "rgba(212,160,23,0.5)"
                        : "rgba(255,255,255,0.08)",
                    transition: "all 0.4s ease",
                    boxShadow: (i <= step && !done) ? "0 0 6px rgba(212,160,23,0.5)" : "none",
                  }}
                />
              ))}
            </div>

            {/* Step list */}
            <div
              style={{
                textAlign: "left",
                borderTop: "1px solid rgba(212,160,23,0.1)",
                paddingTop: 24,
              }}
            >
              {PROCESSING_STEPS.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "6px 0",
                    opacity: done || i <= step ? 1 : 0.3,
                    transition: "opacity 0.3s",
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `1px solid ${done || i < step ? "#D4A017" : i === step ? "rgba(212,160,23,0.5)" : "rgba(122,114,100,0.3)"}`,
                      background: done || i < step ? "#D4A017" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 8,
                      color: "#0A0A0F",
                      fontWeight: 700,
                    }}
                  >
                    {done || i < step ? "✓" : ""}
                  </div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: done || i <= step ? (i === step && !done ? "#D4A017" : "#E8DFC8") : "#4A4438",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {error && (
          <button
            onClick={onBack}
            style={{
              marginTop: 16,
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
              padding: "16px 48px",
              background: "linear-gradient(135deg, #D4A017, #8B6010)",
              color: "#0A0A0F",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              boxShadow: "0 0 32px rgba(212,160,23,0.5)",
              animation: "fadeInUp 0.5s ease-out",
            }}
          >
            ← Voltar ao Upload
          </button>
        )}

        {done && !error && (
          <button
            onClick={() => resultRef.current && onComplete(resultRef.current)}
            style={{
              marginTop: 32,
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontWeight: 700,
              padding: "16px 48px",
              background: "linear-gradient(135deg, #D4A017, #8B6010)",
              color: "#0A0A0F",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              boxShadow: "0 0 32px rgba(212,160,23,0.5)",
              animation: "fadeInUp 0.5s ease-out",
            }}
          >
            Ver Resultados →
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = "#D4A017",
  icon,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
  icon?: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: "24px",
        background: "rgba(15,15,28,0.8)",
        border: `1px solid ${accent}25`,
        borderRadius: 6,
        position: "relative",
        overflow: "hidden",
        transition: "border-color 0.25s, box-shadow 0.25s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${accent}55`
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 24px ${accent}15`
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${accent}25`
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = "none"
      }}
    >
      {/* Corner accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: `linear-gradient(to bottom, ${accent}, transparent)`,
          borderRadius: "6px 0 0 6px",
        }}
      />
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "#4A4438",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {icon && <span style={{ opacity: 0.5 }}>{icon}</span>}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 36,
          fontWeight: 700,
          color: accent,
          lineHeight: 1,
          marginBottom: sub ? 6 : 0,
        }}
      >
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "'Crimson Pro', Georgia, serif",
            fontSize: 13,
            color: "#7A7264",
            fontStyle: "italic",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

function SvgBarChart({ pages }: { pages: PageResult[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; page: PageResult } | null>(null)
  const W = 100
  const H = 200
  const PAD = { top: 8, right: 4, bottom: 24, left: 32 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  if (pages.length === 0) {
    return (
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#4A4438", padding: 24 }}>
        Sem dados por página.
      </div>
    )
  }

  const maxVal = Math.max(...pages.map((p) => p.words + p.nonWords + p.mathWords), 1)
  const barW = (chartW / pages.length) * 0.7
  const gap = (chartW / pages.length) * 0.3
  const groups = [
    { key: "words" as const, color: "#D4A017" },
    { key: "nonWords" as const, color: "#6B1A2E" },
    { key: "mathWords" as const, color: "#4A1A6B" },
  ]
  const subW = barW / groups.length

  const tickStep = Math.max(Math.ceil(maxVal / 4 / 50) * 50, 10)
  const yTicks = Array.from({ length: 5 }, (_, i) => i * tickStep).filter((t) => t <= maxVal * 1.05)

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 220, overflow: "visible" }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y grid lines */}
        {yTicks.map((t) => {
          const y = PAD.top + chartH - (t / maxVal) * chartH
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="rgba(212,160,23,0.08)" strokeWidth={0.3} />
              <text x={PAD.left - 2} y={y + 1} textAnchor="end" fontSize={3} fill="#4A4438" fontFamily="'JetBrains Mono',monospace">{t}</text>
            </g>
          )
        })}

        {/* Bars */}
        {pages.map((page, i) => {
          const groupX = PAD.left + i * (chartW / pages.length) + gap / 2
          return (
            <g key={page.page}>
              {groups.map(({ key, color }, gi) => {
                const val = page[key]
                const bh = (val / maxVal) * chartH
                const bx = groupX + gi * subW
                const by = PAD.top + chartH - bh
                return (
                  <rect
                    key={key}
                    x={bx}
                    y={by}
                    width={subW - 0.3}
                    height={Math.max(bh, 0.5)}
                    fill={color}
                    fillOpacity={0.8}
                    rx={0.5}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => {
                      const svgEl = (e.currentTarget as SVGRectElement).closest("svg")!
                      const rect = svgEl.getBoundingClientRect()
                      setTooltip({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                        page,
                      })
                    }}
                  />
                )
              })}
              {/* X label */}
              <text
                x={groupX + barW / 2}
                y={PAD.top + chartH + 6}
                textAnchor="middle"
                fontSize={2.8}
                fill="#4A4438"
                fontFamily="'JetBrains Mono',monospace"
              >
                {page.page}
              </text>
            </g>
          )
        })}

        {/* Y axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="rgba(212,160,23,0.15)" strokeWidth={0.3} />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 8,
            top: tooltip.y - 60,
            background: "rgba(10,10,15,0.97)",
            border: "1px solid rgba(212,160,23,0.3)",
            borderRadius: 4,
            padding: "8px 12px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ color: "#D4A017", marginBottom: 4 }}>Página {tooltip.page.page}</div>
          <div style={{ color: "#D4A017" }}>Palavras: {tooltip.page.words}</div>
          <div style={{ color: "#6B1A2E" }}>Non-words: {tooltip.page.nonWords}</div>
          <div style={{ color: "#7B6B9B" }}>Math-words: {tooltip.page.mathWords}</div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        {[
          { color: "#D4A017", label: "Palavras" },
          { color: "#6B1A2E", label: "Non-words" },
          { color: "#4A1A6B", label: "Math-words" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#4A4438", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {l.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SVG Area Chart ───────────────────────────────────────────────────────────

function SvgAreaChart({ pages }: { pages: PageResult[] }) {
  const W = 100
  const H = 60
  const PAD = { top: 4, right: 4, bottom: 16, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const [tooltip, setTooltip] = useState<{ x: number; y: number; page: PageResult } | null>(null)

  if (pages.length === 0) {
    return (
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#4A4438", padding: 24 }}>
        Sem dados por página.
      </div>
    )
  }

  const maxVal = Math.max(...pages.map((p) => p.words), 1)
  const denom = Math.max(pages.length - 1, 1)

  const pts = pages.map((p, i) => ({
    x: PAD.left + (i / denom) * chartW,
    y: PAD.top + chartH - (p.words / maxVal) * chartH,
    page: p,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${PAD.top + chartH} L ${pts[0].x} ${PAD.top + chartH} Z`

  const tickStep = Math.max(Math.ceil(maxVal / 3 / 50) * 50, 10)
  const yTicks = Array.from({ length: 4 }, (_, i) => i * tickStep).filter((t) => t <= maxVal * 1.05)

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 160, overflow: "visible" }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A017" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#D4A017" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Y ticks */}
        {yTicks.map((t) => {
          const y = PAD.top + chartH - (t / maxVal) * chartH
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="rgba(212,160,23,0.07)" strokeWidth={0.3} />
              <text x={PAD.left - 2} y={y + 1} textAnchor="end" fontSize={2.8} fill="#4A4438" fontFamily="'JetBrains Mono',monospace">{t}</text>
            </g>
          )
        })}

        <path d={areaD} fill="url(#areaGrad)" />
        <path d={pathD} fill="none" stroke="#D4A017" strokeWidth={0.6} strokeLinejoin="round" />

        {/* Dots */}
        {pts.map((p) => (
          <circle
            key={p.page.page}
            cx={p.x}
            cy={p.y}
            r={0.9}
            fill="#D4A017"
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => {
              const svgEl = (e.currentTarget as SVGCircleElement).closest("svg")!
              const rect = svgEl.getBoundingClientRect()
              setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, page: p.page })
            }}
          />
        ))}

        {/* X labels */}
        {pts.filter((_, i) => i % 2 === 0).map((p) => (
          <text key={p.page.page} x={p.x} y={PAD.top + chartH + 5} textAnchor="middle" fontSize={2.6} fill="#4A4438" fontFamily="'JetBrains Mono',monospace">
            {p.page.page}
          </text>
        ))}

        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + chartH} stroke="rgba(212,160,23,0.15)" strokeWidth={0.3} />
      </svg>

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 8,
            top: Math.max(tooltip.y - 50, 0),
            background: "rgba(10,10,15,0.97)",
            border: "1px solid rgba(212,160,23,0.3)",
            borderRadius: 4,
            padding: "8px 12px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ color: "#D4A017", marginBottom: 2 }}>Página {tooltip.page.page}</div>
          <div style={{ color: "#E8DFC8" }}>Palavras: {tooltip.page.words}</div>
        </div>
      )}
    </div>
  )
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────

function DashboardScreen({ result, onLog, onExport }: {
  result: AnalysisResult
  onLog: () => void
  onExport: () => void
}) {
  const [selectedFigure, setSelectedFigure] = useState<string | null>(null)

  return (
    <div
      className="blueprint-grid"
      style={{ minHeight: "100vh", paddingTop: 80, paddingBottom: 60 }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.3em",
                color: "#D4A017",
                textTransform: "uppercase",
                marginBottom: 8,
                opacity: 0.8,
              }}
            >
              ── {result.fileName ?? "Relatório"} ──
            </div>
            <h2
              style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 32,
                fontWeight: 700,
                color: "#E8DFC8",
                margin: 0,
                letterSpacing: "0.06em",
              }}
            >
              Resultados da Análise
            </h2>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onLog}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "10px 20px",
                background: "transparent",
                color: "#7A7264",
                border: "1px solid rgba(122,114,100,0.3)",
                borderRadius: 4,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#E8DFC8"
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(232,223,200,0.4)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#7A7264"
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(122,114,100,0.3)"
              }}
            >
              Ver Log
            </button>
            <button
              onClick={onExport}
              style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 700,
                padding: "10px 24px",
                background: "linear-gradient(135deg, #D4A017, #8B6010)",
                color: "#0A0A0F",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                boxShadow: "0 0 16px rgba(212,160,23,0.3)",
                transition: "box-shadow 0.25s",
              }}
            >
              Exportar
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          <StatCard
            label="Palavras"
            value={result.totalWords}
            sub="tokens válidos do corpus"
            accent="#D4A017"
          />
          <StatCard
            label="Non-words"
            value={result.totalNonWords}
            sub="tokens inválidos filtrados"
            accent="#6B1A2E"
          />
          <StatCard
            label="Math-words"
            value={result.totalMathWords}
            sub="tokens em modo matemático"
            accent="#4A1A6B"
          />
          <StatCard
            label="Figuras"
            value={result.totalFigures}
            sub={
              result.wordsInFigures !== undefined && result.wordsInFigures >= 0
                ? `${result.wordsInFigures} palavras via OCR`
                : "imagens extraídas"
            }
            accent="#1A5C2E"
          />
        </div>

        {/* Chart */}
        <div
          style={{
            background: "rgba(15,15,28,0.8)",
            border: "1px solid rgba(212,160,23,0.12)",
            borderRadius: 6,
            padding: "24px",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "#D4A017",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            Distribuição por Página
          </div>
          <SvgBarChart pages={result.pages} />
        </div>

        {/* Trend area chart */}
        <div
          style={{
            background: "rgba(15,15,28,0.8)",
            border: "1px solid rgba(212,160,23,0.12)",
            borderRadius: 6,
            padding: "24px",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "#D4A017",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            Tendência de Densidade
          </div>
          <SvgAreaChart pages={result.pages} />
        </div>

        {/* Figures gallery */}
        <div
          style={{
            background: "rgba(15,15,28,0.8)",
            border: "1px solid rgba(212,160,23,0.12)",
            borderRadius: 6,
            padding: "24px",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "#D4A017",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Galeria de Figuras Extraídas
          </div>
          <div
            style={{
              fontFamily: "'Crimson Pro', Georgia, serif",
              fontSize: 14,
              color: "#4A4438",
              marginBottom: 20,
              fontStyle: "italic",
            }}
          >
            {result.figures.length > 0
              ? `${result.totalFigures} figuras · mostrando amostra de ${result.figures.length}`
              : `${result.totalFigures} figuras detectadas no documento`}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {result.figures.map((src, i) => (
              <div
                key={i}
                onClick={() => setSelectedFigure(src)}
                style={{
                  position: "relative",
                  borderRadius: 4,
                  overflow: "hidden",
                  cursor: "pointer",
                  border: "1px solid rgba(212,160,23,0.15)",
                  background: "#0F0F1C",
                  transition: "border-color 0.25s, transform 0.25s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(212,160,23,0.5)"
                  ;(e.currentTarget as HTMLDivElement).style.transform = "scale(1.02)"
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(212,160,23,0.15)"
                  ;(e.currentTarget as HTMLDivElement).style.transform = "scale(1)"
                }}
              >
                <img
                  src={src}
                  alt={`Figura ${i + 1} extraída do PDF`}
                  style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "linear-gradient(transparent, rgba(10,10,15,0.9))",
                    padding: "12px 8px 6px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9,
                    color: "#D4A017",
                    letterSpacing: "0.1em",
                  }}
                >
                  fig_{String(i + 1).padStart(3, "0")}.png
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {selectedFigure && (
        <div
          onClick={() => setSelectedFigure(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            backdropFilter: "blur(8px)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedFigure}
              alt="Figura em tamanho completo"
              style={{
                maxWidth: "85vw",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: 6,
                border: "1px solid rgba(212,160,23,0.3)",
                boxShadow: "0 0 60px rgba(212,160,23,0.2)",
              }}
            />
            <button
              onClick={() => setSelectedFigure(null)}
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "none",
                border: "1px solid rgba(212,160,23,0.3)",
                borderRadius: "50%",
                width: 36,
                height: 36,
                cursor: "pointer",
                color: "#D4A017",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Log Screen ───────────────────────────────────────────────────────────────

function LogScreen({ result }: { result: AnalysisResult }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState("")

  const filtered = filter
    ? result.logLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : result.logLines

  const colorize = (line: string) => {
    if (line.includes("AVISO") || line.includes("degradado")) return "#D4A017"
    if (line.includes("TOTAIS") || line.includes("──")) return "#6B1A2E"
    if (line.includes("Polyphemus")) return "#D4A017"
    if (line.includes("Words") || line.includes("Pages")) return "#8BC4A0"
    if (line.includes("OCR") || line.includes("Figures")) return "#7B9EC8"
    return "#7A7264"
  }

  return (
    <div
      className="blueprint-grid"
      style={{ minHeight: "100vh", paddingTop: 80, paddingBottom: 60 }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.3em",
                color: "#D4A017",
                textTransform: "uppercase",
                marginBottom: 8,
                opacity: 0.8,
              }}
            >
              ── stdout · logfile.txt ──
            </div>
            <h2
              style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 28,
                fontWeight: 700,
                color: "#E8DFC8",
                margin: 0,
                letterSpacing: "0.06em",
              }}
            >
              Log Técnico
            </h2>
          </div>
          <input
            type="text"
            placeholder="filtrar log..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              padding: "8px 16px",
              background: "rgba(15,15,28,0.8)",
              border: "1px solid rgba(212,160,23,0.2)",
              borderRadius: 4,
              color: "#E8DFC8",
              outline: "none",
              letterSpacing: "0.06em",
              width: 220,
            }}
          />
        </div>

        {/* Terminal */}
        <div
          style={{
            background: "#060608",
            border: "1px solid rgba(212,160,23,0.15)",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 0 40px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)",
          }}
        >
          {/* Terminal bar */}
          <div
            style={{
              padding: "10px 16px",
              background: "rgba(15,15,28,0.8)",
              borderBottom: "1px solid rgba(212,160,23,0.1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#6B1A2E" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#8B6010" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1A5C2E" }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "#4A4438",
                marginLeft: 8,
                letterSpacing: "0.1em",
              }}
            >
              polyphemus · bash · {filtered.length} linhas
            </span>
          </div>

          {/* Log lines */}
          <div
            style={{
              padding: "20px 20px",
              maxHeight: "60vh",
              overflowY: "auto",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              lineHeight: 1.8,
            }}
          >
            {filtered.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: "#2E4A2E", flexShrink: 0, fontSize: 11 }}>
                  [{String(i).padStart(3, "0")}]
                </span>
                <span style={{ color: colorize(line) }}>
                  {line}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
            {/* Cursor */}
            <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
              <span style={{ color: "#2E4A2E", fontSize: 11 }}>[ready]</span>
              <span style={{ color: "#D4A017" }}>
                $<span style={{ animation: "amber-flicker 1.2s ease-in-out infinite", display: "inline-block", marginLeft: 4 }}>▋</span>
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "#3A3428",
            letterSpacing: "0.1em",
            textAlign: "right",
          }}
        >
          {result.logLines.length} entradas
        </div>
      </div>
    </div>
  )
}

// ─── FAQ Screen ───────────────────────────────────────────────────────────────

function FaqScreen() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div
      className="blueprint-grid"
      style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 80 }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <PolyphemusEye size={72} active />
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.3em",
              color: "#D4A017",
              textTransform: "uppercase",
              marginBottom: 12,
              opacity: 0.8,
            }}
          >
            ── O Oráculo Responde ──
          </div>
          <h2
            style={{
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 36,
              fontWeight: 700,
              color: "#E8DFC8",
              margin: 0,
              letterSpacing: "0.06em",
            }}
          >
            Perguntas Frequentes
          </h2>
          <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 17, color: "#7A7264", marginTop: 8, fontStyle: "italic" }}>
            Tudo o que a rapaziada costuma perguntar antes de invocar o olho.
          </p>
        </div>

        {/* Accordion */}
        <div style={{ display: "grid", gap: 10 }}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i
            return (
              <div
                key={i}
                style={{
                  background: isOpen ? "rgba(212,160,23,0.05)" : "rgba(15,15,28,0.7)",
                  border: `1px solid ${isOpen ? "rgba(212,160,23,0.35)" : "rgba(122,114,100,0.15)"}`,
                  borderRadius: 6,
                  overflow: "hidden",
                  transition: "all 0.25s",
                }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "18px 22px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!isOpen) (e.currentTarget.parentElement as HTMLDivElement).style.borderColor = "rgba(212,160,23,0.3)"
                  }}
                  onMouseLeave={(e) => {
                    if (!isOpen) (e.currentTarget.parentElement as HTMLDivElement).style.borderColor = "rgba(122,114,100,0.15)"
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Cinzel', Georgia, serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: isOpen ? "#D4A017" : "#E8DFC8",
                      letterSpacing: "0.04em",
                      transition: "color 0.25s",
                    }}
                  >
                    {item.q}
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 16,
                      color: isOpen ? "#D4A017" : "#4A4438",
                      flexShrink: 0,
                      transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                      transition: "transform 0.25s, color 0.25s",
                    }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div
                    style={{
                      padding: "0 22px 20px",
                      fontFamily: "'Crimson Pro', Georgia, serif",
                      fontSize: 16,
                      lineHeight: 1.7,
                      color: "#B5AB94",
                      animation: "fadeInUp 0.25s ease-out",
                    }}
                  >
                    {item.a}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div
          style={{
            marginTop: 40,
            textAlign: "center",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "#3A3428",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Ainda com dúvida? Abra uma issue no repositório do projeto.
        </div>
      </div>
    </div>
  )
}

// ─── Export Panel ─────────────────────────────────────────────────────────────

function ExportPanel({ result, onClose }: { result: AnalysisResult; onClose: () => void }) {
  const [selected, setSelected] = useState({
    words: true,
    nonwords: true,
    math: true,
    images: true,
    log: false,
  })
  const [exporting, setExporting] = useState(false)
  const [done, setDone] = useState(false)

  const toggle = (k: keyof typeof selected) =>
    setSelected((s) => ({ ...s, [k]: !s[k] }))

  const files = result.files

  const handleExport = () => {
    setExporting(true)

    if (selected.words) {
      downloadText("wordsfile.txt", files?.words ?? "")
    }
    if (selected.nonwords) {
      downloadText("nonwordsfile.txt", files?.nonwords ?? "")
    }
    if (selected.math) {
      downloadText("mathmodewords.txt", files?.math ?? "")
    }
    if (selected.log) {
      downloadText("logfile.txt", files?.log ?? result.logLines.join("\n"))
    }
    if (selected.images) {
      result.figures.forEach((dataUrl, i) => {
        downloadDataUrl(dataUrl, `fig_${String(i + 1).padStart(3, "0")}.png`)
      })
    }

    setTimeout(() => {
      setExporting(false)
      setDone(true)
    }, 800)
  }

  const items = [
    {
      key: "words" as const,
      label: "Arquivo de Palavras",
      sub: `wordsfile.txt — ${result.totalWords.toLocaleString("pt-BR")} tokens`,
      accent: "#D4A017",
    },
    {
      key: "nonwords" as const,
      label: "Non-words",
      sub: `nonwordsfile.txt — ${result.totalNonWords.toLocaleString("pt-BR")} tokens`,
      accent: "#6B1A2E",
    },
    {
      key: "math" as const,
      label: "Math-words",
      sub: `mathmodewords.txt — ${result.totalMathWords.toLocaleString("pt-BR")} tokens`,
      accent: "#4A1A6B",
    },
    {
      key: "images" as const,
      label: "Imagens Extraídas",
      sub: `${result.figures.length} figuras PNG`,
      accent: "#1A5C2E",
    },
    {
      key: "log" as const,
      label: "Log Completo",
      sub: `logfile.txt — ${result.logLines.length} linhas`,
      accent: "#4A4438",
    },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        zIndex: 150,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100vw)",
          height: "100vh",
          background: "#0A0A0F",
          borderLeft: "1px solid rgba(212,160,23,0.2)",
          display: "flex",
          flexDirection: "column",
          animation: "fadeInUp 0.3s ease-out",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "32px 28px 24px",
            borderBottom: "1px solid rgba(212,160,23,0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.25em",
                color: "#D4A017",
                textTransform: "uppercase",
                marginBottom: 8,
                opacity: 0.8,
              }}
            >
              ── Saída de Dados ──
            </div>
            <h3
              style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 22,
                fontWeight: 700,
                color: "#E8DFC8",
                margin: 0,
                letterSpacing: "0.06em",
              }}
            >
              Exportar Resultados
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid rgba(212,160,23,0.2)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              cursor: "pointer",
              color: "#7A7264",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#E8DFC8"
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(232,223,200,0.4)"
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#7A7264"
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(212,160,23,0.2)"
            }}
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
          <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 15, color: "#7A7264", marginBottom: 20, fontStyle: "italic" }}>
            Selecione os arquivos que deseja exportar:
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {items.map(({ key, label, sub, accent }) => (
              <div
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 18px",
                  background: selected[key] ? `${accent}10` : "rgba(15,15,28,0.6)",
                  border: `1px solid ${selected[key] ? `${accent}40` : "rgba(122,114,100,0.12)"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    border: `1.5px solid ${selected[key] ? accent : "rgba(122,114,100,0.4)"}`,
                    background: selected[key] ? accent : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.2s",
                  }}
                >
                  {selected[key] && <span style={{ color: "#0A0A0F", fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: 12, color: selected[key] ? "#E8DFC8" : "#7A7264", letterSpacing: "0.06em", marginBottom: 2, transition: "color 0.2s" }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#4A4438" }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {!files && (
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#6B1A2E", marginTop: 16, lineHeight: 1.6 }}>
              Resultado em modo demo — os arquivos exportados conterão apenas os dados de exemplo.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 28px", borderTop: "1px solid rgba(212,160,23,0.1)" }}>
          {done ? (
            <div
              style={{
                textAlign: "center",
                padding: "16px",
                background: "rgba(26,92,46,0.2)",
                border: "1px solid rgba(26,92,46,0.4)",
                borderRadius: 6,
              }}
            >
              <div style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: 14, color: "#8BC4A0", letterSpacing: "0.1em" }}>
                Exportação concluída
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#4A4438", marginTop: 4 }}>
                downloads iniciados no navegador
              </div>
            </div>
          ) : (
            <button
              onClick={handleExport}
              disabled={exporting || !Object.values(selected).some(Boolean)}
              style={{
                width: "100%",
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 13,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                fontWeight: 700,
                padding: "16px",
                background: exporting
                  ? "rgba(212,160,23,0.3)"
                  : !Object.values(selected).some(Boolean)
                  ? "rgba(74,68,56,0.3)"
                  : "linear-gradient(135deg, #D4A017, #8B6010)",
                color: exporting || !Object.values(selected).some(Boolean) ? "#7A7264" : "#0A0A0F",
                border: "none",
                borderRadius: 4,
                cursor: exporting || !Object.values(selected).some(Boolean) ? "not-allowed" : "pointer",
                boxShadow: exporting ? "none" : "0 0 20px rgba(212,160,23,0.3)",
                transition: "all 0.25s",
              }}
            >
              {exporting ? "Gerando arquivos..." : "Exportar Selecionados"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("upload")
  const [config, setConfig] = useState<Config>({
    extractImages: true,
    countNonWords: true,
    mathMode: true,
    separateSections: false,
  })
  const [showExport, setShowExport] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const navigate = (s: Screen) => {
    if (s === "export") {
      if (result) setShowExport(true)
      return
    }
    // Screens that need a finished analysis
    if ((s === "dashboard" || s === "log") && !result) return
    // Processing needs a file (or demo) — restart from upload instead
    if (s === "processing" && !result) {
      setScreen("upload")
      return
    }
    setScreen(s)
  }

  const handleUploadNext = (f: File | null) => {
    setFile(f)
    setResult(null)
    setScreen("config")
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", color: "#E8DFC8" }}>
      <Nav screen={screen} onNav={navigate} />

      {screen === "upload" && (
        <UploadScreen onNext={handleUploadNext} />
      )}
      {screen === "config" && (
        <ConfigScreen
          config={config}
          onChange={setConfig}
          onNext={() => setScreen("processing")}
        />
      )}
      {screen === "processing" && (
        <ProcessingScreen
          file={file}
          config={config}
          onComplete={(r) => {
            setResult(r)
            setScreen("dashboard")
          }}
          onBack={() => setScreen("upload")}
        />
      )}
      {screen === "dashboard" && result && (
        <DashboardScreen
          result={result}
          onLog={() => setScreen("log")}
          onExport={() => setShowExport(true)}
        />
      )}
      {screen === "log" && result && (
        <LogScreen result={result} />
      )}
      {screen === "faq" && <FaqScreen />}

      {showExport && result && (
        <ExportPanel result={result} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}
