"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Flag,
  LayoutGrid,
  Loader2,
  Maximize,
  Minus,
  Plus,
  ScrollText,
  ShieldAlert,
} from "lucide-react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"
import type { QuizAnswers } from "@/lib/exam/grading"
import type { ExamRule } from "@/lib/exam/rules"
import { cn } from "@/lib/utils"
import { ExamRulesList } from "@/components/exam/exam-rules"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Question = {
  id: string
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY"
  prompt: string
  options: { id: string; text: string }[] | null
  points: number
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string }

export type ExamSecurity = { requireFullscreen: boolean; blockCopyPaste: boolean; maxLeaves: number | null }

const TF_OPTIONS = [
  { id: "true", text: "Benar" },
  { id: "false", text: "Salah" },
]
const FONT_SIZES = ["text-sm", "text-base", "text-lg", "text-xl"] as const
const AUTOSAVE_DEBOUNCE_MS = 2000
const AUTOSAVE_INTERVAL_MS = 30_000
/** Dua pelanggaran berdekatan (mis. Alt+Tab yang juga keluar layar penuh) dihitung sekali. */
const VIOLATION_DEBOUNCE_MS = 1500
const TYPE_NAME: Record<Question["type"], string> = { MULTIPLE_CHOICE: "Pilihan ganda", TRUE_FALSE: "Benar/Salah", SHORT_ANSWER: "Isian singkat", ESSAY: "Esai" }

const storageKey = (id: string) => `smarttest:exam:${id}`
const timeOf = (d: Date) => d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

function loadLocal(id: string): { answers: QuizAnswers; flagged: string[] } | null {
  try {
    const raw = localStorage.getItem(storageKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Hash Config Key dari JavaScript API Safe Exam Browser (bila berjalan di SEB). */
function sebJsHash(): string | undefined {
  try {
    const seb = (window as unknown as { SafeExamBrowser?: { security?: { configKey?: string } } }).SafeExamBrowser
    return seb?.security?.configKey || undefined
  } catch {
    return undefined
  }
}

/** Layar penuh tidak tersedia di iPhone dan tidak perlu di SEB (sudah mode kios). */
const fullscreenSupported = () => document.fullscreenEnabled && !/\bSEB\/\d/i.test(navigator.userAgent)

/**
 * Lembar ujian berbasis komputer (CBT): satu atau beberapa soal per halaman,
 * panel nomor soal (terjawab / ragu-ragu / kosong), tombol ragu-ragu, ukuran
 * huruf, penghitung waktu, simpan otomatis ke server & perangkat, serta
 * pengamanan (layar penuh, blokir salin, batas pelanggaran).
 */
export function ExamRunner({
  attemptId,
  title,
  kindLabel,
  participant,
  questions,
  perPage,
  initialAnswers,
  initialFlagged,
  initialLeaveCount,
  initialDeadline,
  timed,
  saveAction,
  submitAction,
  security,
  rules,
}: {
  attemptId: string
  title: string
  kindLabel: string
  participant: { name: string; username: string | null }
  questions: Question[]
  perPage: number
  initialAnswers: QuizAnswers
  initialFlagged: string[]
  initialLeaveCount: number
  initialDeadline: number
  /** false = tanpa batas durasi (penghitung disembunyikan kecuali jadwal tutup < 1 jam) */
  timed: boolean
  saveAction: (answers: QuizAnswers, flagged: string[], leaveCount: number, sebHash?: string) => Promise<ActionResult<{ savedAt: string; terminated?: boolean; deadline?: number }>>
  submitAction: (answers: QuizAnswers, flagged: string[], sebHash?: string) => Promise<ActionResult<{ score: number | null }>>
  security: ExamSecurity
  rules: ExamRule[]
}) {
  const router = useRouter()
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers)
  const [flagged, setFlagged] = useState<string[]>(initialFlagged)
  const [page, setPage] = useState(0)
  const [fontSize, setFontSize] = useState(1)
  const [deadline, setDeadline] = useState(initialDeadline)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [save, setSave] = useState<SaveState>({ kind: "idle" })
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [violations, setViolations] = useState(initialLeaveCount)
  const [fullscreenNeeded, setFullscreenNeeded] = useState(false)
  const [pending, startTransition] = useTransition()

  const submitted = useRef(false)
  const dirty = useRef(false)
  const leaves = useRef(initialLeaveCount)
  const lastViolation = useRef(0)
  const latest = useRef({ answers: initialAnswers, flagged: initialFlagged })
  useEffect(() => {
    latest.current = { answers, flagged }
  }, [answers, flagged])

  const size = Math.max(1, perPage)
  const pages = Math.max(1, Math.ceil(questions.length / size))

  // Gabungkan cadangan di perangkat (lebih baru bila server belum sempat menyimpan).
  useEffect(() => {
    const local = loadLocal(attemptId)
    if (!local) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers((prev) => ({ ...prev, ...local.answers }))
    setFlagged((prev) => [...new Set([...prev, ...(local.flagged ?? [])])])
    dirty.current = true
  }, [attemptId])

  const persistLocal = (next: { answers: QuizAnswers; flagged: string[] }) => {
    try {
      localStorage.setItem(storageKey(attemptId), JSON.stringify(next))
    } catch {}
  }

  const saveNow = useCallback(async () => {
    if (submitted.current || !dirty.current) return
    dirty.current = false
    setSave({ kind: "saving" })
    const result = await saveAction(latest.current.answers, latest.current.flagged, leaves.current, sebJsHash())
    if (result.ok && result.data?.terminated) {
      submitted.current = true
      try {
        localStorage.removeItem(storageKey(attemptId))
      } catch {}
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      toast.error(result.message ?? "Ujian dikumpulkan otomatis.")
      router.refresh()
    } else if (result.ok) {
      setSave({ kind: "saved", at: new Date(result.data?.savedAt ?? Date.now()) })
      // Pengawas dapat menambah waktu selama ujian berjalan.
      if (result.data?.deadline) setDeadline(result.data.deadline)
    } else {
      dirty.current = true
      setSave({ kind: "error", message: result.error })
    }
  }, [saveAction, router, attemptId])

  const recordViolation = useCallback(() => {
    if (submitted.current) return
    const now = Date.now()
    if (now - lastViolation.current < VIOLATION_DEBOUNCE_MS) return
    lastViolation.current = now
    leaves.current += 1
    setViolations(leaves.current)
    dirty.current = true
    void saveNow()
  }, [saveNow])

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(() => {
    dirty.current = true
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(saveNow, AUTOSAVE_DEBOUNCE_MS)
  }, [saveNow])

  useEffect(() => {
    // Simpan berkala juga menyegarkan batas waktu (tambahan waktu dari pengawas).
    const timer = setInterval(() => {
      dirty.current = true
      void saveNow()
    }, AUTOSAVE_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [saveNow])

  // Catat saat peserta meninggalkan halaman ujian.
  useEffect(() => {
    // Muat ulang/tutup halaman (mis. koneksi putus-nyambung) juga memicu "hidden" — bukan pelanggaran.
    // Browser memicu pagehide sebelum visibilitychange saat halaman dibongkar.
    let unloading = false
    const onPageHide = () => {
      unloading = true
    }
    const onPageShow = () => {
      unloading = false // kembali dari back-forward cache
    }
    const onVisibility = () => {
      if (submitted.current || unloading) return
      if (document.visibilityState === "hidden") recordViolation()
      else {
        const limit = security.maxLeaves ? ` Batas: ${security.maxLeaves}× — setelah itu ujian dikumpulkan otomatis.` : ""
        toast.warning(`Anda meninggalkan halaman ujian (${leaves.current}×). Aktivitas ini tercatat dan dapat dilihat pengawas.${limit}`)
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!submitted.current) e.preventDefault()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [recordViolation, security.maxLeaves])

  // Wajib layar penuh: keluar = pelanggaran, soal ditutup sampai kembali.
  useEffect(() => {
    if (!security.requireFullscreen || !fullscreenSupported()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullscreenNeeded(!document.fullscreenElement)
    const onChange = () => {
      const inside = !!document.fullscreenElement
      setFullscreenNeeded(!inside && !submitted.current)
      if (!inside) recordViolation()
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [security.requireFullscreen, recordViolation])

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => toast.error("Browser menolak layar penuh. Coba tekan F11."))
  }

  // Blokir salin/tempel/klik kanan/seret.
  useEffect(() => {
    if (!security.blockCopyPaste) return
    let warned = 0
    const block = (e: Event) => {
      e.preventDefault()
      if (Date.now() - warned > 3000) {
        warned = Date.now()
        toast.warning("Salin, tempel, dan klik kanan dinonaktifkan selama ujian.")
      }
    }
    const events = ["copy", "cut", "paste", "contextmenu", "drop", "dragstart"] as const
    for (const ev of events) document.addEventListener(ev, block)
    return () => {
      for (const ev of events) document.removeEventListener(ev, block)
    }
  }, [security.blockCopyPaste])

  const setAnswer = (id: string, value: string) => {
    const next = { ...latest.current.answers, [id]: value }
    latest.current = { ...latest.current, answers: next }
    setAnswers(next)
    persistLocal({ answers: next, flagged: latest.current.flagged })
    scheduleSave()
  }

  const toggleFlag = (id: string) => {
    const next = latest.current.flagged.includes(id) ? latest.current.flagged.filter((f) => f !== id) : [...latest.current.flagged, id]
    latest.current = { ...latest.current, flagged: next }
    setFlagged(next)
    persistLocal({ answers: latest.current.answers, flagged: next })
    scheduleSave()
  }

  const submit = useCallback(
    (auto = false) => {
      if (submitted.current) return
      submitted.current = true
      if (debounce.current) clearTimeout(debounce.current)
      startTransition(async () => {
        const result = await submitAction(latest.current.answers, latest.current.flagged, sebJsHash())
        if (!result.ok) {
          submitted.current = false
          setError(result.error)
          toast.error(result.error)
          return
        }
        try {
          localStorage.removeItem(storageKey(attemptId))
        } catch {}
        setConfirming(false)
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
        toast.success(auto ? `Waktu habis — jawaban dikumpulkan otomatis. ${result.message ?? ""}` : (result.message ?? "Ujian terkumpul."))
        router.refresh()
      })
    },
    [router, attemptId, submitAction]
  )

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) submit(true)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadline, submit])

  const goPage = useCallback(
    (p: number) => {
      setPage(Math.max(0, Math.min(pages - 1, p)))
      setPanelOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [pages]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("input, textarea, select, [contenteditable]") || e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === "ArrowRight") goPage(page + 1)
      if (e.key === "ArrowLeft") goPage(page - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [page, goPage])

  if (questions.length === 0) return <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Ujian ini belum memiliki soal.</p>

  const isAnswered = (q: Question) => (answers[q.id] ?? "").trim() !== ""
  const answeredCount = questions.filter(isAnswered).length
  const flaggedCount = questions.filter((q) => flagged.includes(q.id)).length
  const emptyCount = questions.length - answeredCount
  const current = Math.min(page, pages - 1)
  const from = current * size
  const shown = questions.slice(from, from + size)
  const isLast = current === pages - 1
  const lowTime = remaining !== null && remaining < 5 * 60

  const panel = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-1.5" role="list" aria-label="Nomor soal">
        {questions.map((item, i) => {
          const isFlagged = flagged.includes(item.id)
          const answered = isAnswered(item)
          const here = i >= from && i < from + size
          return (
            <button
              key={item.id}
              type="button"
              role="listitem"
              onClick={() => {
                goPage(Math.floor(i / size))
                if (size > 1) setTimeout(() => document.getElementById(`q-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
              }}
              aria-current={here ? "step" : undefined}
              aria-label={`Soal ${i + 1}${answered ? ", terjawab" : ", kosong"}${isFlagged ? ", ragu-ragu" : ""}`}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                isFlagged ? "border-amber-500 bg-amber-400 text-amber-950" : answered ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                here && "ring-2 ring-foreground ring-offset-2 ring-offset-card"
              )}
            >
              {i + 1}
              {isFlagged && answered && <span className="absolute right-0.5 bottom-0.5 size-1.5 rounded-full bg-primary" aria-hidden />}
            </button>
          )
        })}
      </div>
      <ul className="grid gap-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-primary" aria-hidden /> Terjawab ({answeredCount})
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-amber-400" aria-hidden /> Ragu-ragu ({flaggedCount})
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm border bg-background" aria-hidden /> Belum dijawab ({emptyCount})
        </li>
      </ul>
      <Button onClick={() => setConfirming(true)} disabled={pending} className="w-full rounded-xl">
        <CheckCircle2 aria-hidden /> Selesai &amp; kumpulkan
      </Button>
    </div>
  )

  return (
    <div className={cn("flex flex-col gap-4", security.blockCopyPaste && "select-none")}>
      {fullscreenNeeded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-md" role="alertdialog" aria-modal aria-labelledby="fs-title">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-tint-violet text-tint-violet-fg">
              <Maximize className="size-8" aria-hidden />
            </span>
            <h2 id="fs-title" className="text-lg font-semibold">
              Ujian wajib dalam layar penuh
            </h2>
            <p className="text-sm text-muted-foreground">
              Soal disembunyikan sampai Anda kembali ke layar penuh. Setiap kali keluar tercatat sebagai pelanggaran
              {security.maxLeaves ? ` (${violations}/${security.maxLeaves}; batas tercapai = dikumpulkan otomatis)` : ""}.
            </p>
            <Button onClick={enterFullscreen} size="lg" className="rounded-xl">
              <Maximize aria-hidden /> Masuk layar penuh
            </Button>
          </div>
        </div>
      )}

      {/* ----- Bilah atas ----- */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-card/95 px-4 py-2.5 shadow-sm ring-1 ring-border/60 backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {kindLabel} · {title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {participant.name}
            {participant.username && <span className="font-mono"> · {participant.username}</span>}
          </p>
        </div>
        {violations > 0 && (
          <span className="flex items-center gap-1 rounded-lg bg-tint-rose px-2 py-1 text-xs font-semibold text-tint-rose-fg" title="Berapa kali meninggalkan halaman/layar penuh ujian">
            <ShieldAlert className="size-3.5" aria-hidden />
            {violations}
            {security.maxLeaves ? `/${security.maxLeaves}` : "×"}
          </span>
        )}
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex" aria-live="polite">
          {save.kind === "saving" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Menyimpan…
            </>
          ) : save.kind === "saved" ? (
            <>
              <Cloud className="size-3.5" aria-hidden /> Tersimpan {timeOf(save.at)}
            </>
          ) : save.kind === "error" ? (
            <span className="flex items-center gap-1 text-destructive" title={save.message}>
              <CloudOff className="size-3.5" aria-hidden /> Belum tersimpan ke server
            </span>
          ) : null}
        </span>
        {rules.length > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={() => setRulesOpen(true)} aria-label="Tata tertib" title="Tata tertib">
            <ScrollText />
          </Button>
        )}
        <div className="flex items-center rounded-lg border" role="group" aria-label="Ukuran huruf">
          <Button variant="ghost" size="icon-sm" onClick={() => setFontSize((f) => Math.max(0, f - 1))} disabled={fontSize === 0} aria-label="Perkecil huruf">
            <Minus />
          </Button>
          <span className="px-1 text-xs font-medium" aria-hidden>
            A
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setFontSize((f) => Math.min(FONT_SIZES.length - 1, f + 1))} disabled={fontSize === FONT_SIZES.length - 1} aria-label="Perbesar huruf">
            <Plus />
          </Button>
        </div>
        {/* Tanpa batas durasi: penghitung hanya muncul bila jadwal tutup tinggal < 1 jam */}
        {remaining !== null && Number.isFinite(remaining) && (timed || remaining < 3600) && (
          <span
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums", lowTime ? "bg-destructive text-white" : "bg-primary text-primary-foreground")}
            role="timer"
            aria-live={lowTime ? "assertive" : "off"}
            aria-label="Sisa waktu"
          >
            <Clock className="size-4" aria-hidden />
            {remaining >= 3600 && `${Math.floor(remaining / 3600)}:`}
            {String(Math.floor((remaining % 3600) / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
          </span>
        )}
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          <LayoutGrid aria-hidden /> {answeredCount}/{questions.length}
        </Button>
      </div>

      {panelOpen && <div className="rounded-2xl bg-card p-4 ring-1 ring-border/60 lg:hidden">{panel}</div>}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          {shown.map((q, k) => {
            const i = from + k
            const choices = q.type === "TRUE_FALSE" ? TF_OPTIONS : q.type === "MULTIPLE_CHOICE" ? (q.options ?? []) : null
            const isFlagged = flagged.includes(q.id)
            return (
              <section key={q.id} id={`q-${q.id}`} className="flex scroll-mt-32 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/60" aria-labelledby={`h-${q.id}`}>
                <header className="flex items-center justify-between gap-2 border-b bg-muted/40 px-5 py-3">
                  <h2 id={`h-${q.id}`} className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground tabular-nums">{i + 1}</span>
                    <span className="text-muted-foreground">dari {questions.length}</span>
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {TYPE_NAME[q.type]} · {q.points} poin
                  </span>
                </header>
                <div className={cn("flex flex-col gap-4 p-5", FONT_SIZES[fontSize])}>
                  <p className="leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
                  {choices && (
                    <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={`h-${q.id}`}>
                      {choices.map((o, j) => {
                        const checked = answers[q.id] === o.id
                        return (
                          <label key={o.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50", checked && "border-primary bg-secondary")}>
                            <input type="radio" name={`q_${q.id}`} value={o.id} checked={checked} onChange={() => setAnswer(q.id, o.id)} className="sr-only" />
                            <span
                              className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", checked ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
                              aria-hidden
                            >
                              {String.fromCharCode(65 + j)}
                            </span>
                            <span className="pt-0.5">{o.text}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {q.type === "SHORT_ANSWER" && <Input value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} maxLength={500} aria-label={`Jawaban soal ${i + 1}`} className="max-w-md" />}
                  {q.type === "ESSAY" && (
                    <div className="flex flex-col gap-1">
                      <Textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} className="select-text" rows={size > 1 ? 6 : 10} maxLength={5000} aria-label={`Jawaban soal ${i + 1}`} />
                      <p className="text-right text-xs text-muted-foreground tabular-nums">{(answers[q.id] ?? "").length}/5000</p>
                    </div>
                  )}
                  <label className={cn("flex w-fit cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium select-none", isFlagged ? "border-amber-500 bg-amber-400 text-amber-950" : "hover:bg-muted")}>
                    <input type="checkbox" checked={isFlagged} onChange={() => toggleFlag(q.id)} className="size-4 accent-amber-600" />
                    <Flag className="size-4" aria-hidden /> Ragu-ragu
                  </label>
                </div>
              </section>
            )
          })}

          <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-3 ring-1 ring-border/60">
            <Button variant="outline" className="rounded-xl" onClick={() => goPage(current - 1)} disabled={current === 0} aria-label="Halaman sebelumnya">
              <ChevronLeft aria-hidden /> <span className="hidden sm:inline">Sebelumnya</span>
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {size > 1 ? `Halaman ${current + 1} dari ${pages}` : `Soal ${current + 1} dari ${pages}`}
            </span>
            {isLast ? (
              <Button className="rounded-xl" onClick={() => setConfirming(true)} disabled={pending}>
                Selesai <CheckCircle2 aria-hidden />
              </Button>
            ) : (
              <Button className="rounded-xl" onClick={() => goPage(current + 1)} aria-label="Halaman berikutnya">
                <span className="hidden sm:inline">Berikutnya</span> <ChevronRight aria-hidden />
              </Button>
            )}
          </div>
        </div>

        <aside className="sticky top-36 hidden rounded-2xl bg-card p-4 ring-1 ring-border/60 lg:block" aria-label="Navigasi soal">
          <p className="mb-3 text-sm font-semibold">Nomor soal</p>
          {panel}
        </aside>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tata tertib {kindLabel.toLowerCase()}</DialogTitle>
            <DialogDescription>Waktu tetap berjalan selama Anda membaca.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60svh] overflow-y-auto">
            <ExamRulesList rules={rules} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kumpulkan ujian sekarang?</DialogTitle>
            <DialogDescription>Setelah dikumpulkan, jawaban tidak dapat diubah lagi.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Terjawab", answeredCount, "text-primary"],
              ["Ragu-ragu", flaggedCount, "text-amber-600"],
              ["Kosong", emptyCount, emptyCount ? "text-destructive" : ""],
            ].map(([label, value, className]) => (
              <div key={label as string} className="rounded-xl border p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={cn("text-xl font-bold tabular-nums", className as string)}>{value}</dd>
              </div>
            ))}
          </dl>
          {(emptyCount > 0 || flaggedCount > 0) && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              Masih ada soal yang kosong atau ditandai ragu-ragu. Periksa kembali lewat panel nomor soal bila waktu masih cukup.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Periksa lagi
            </Button>
            <Button onClick={() => submit()} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Ya, kumpulkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
