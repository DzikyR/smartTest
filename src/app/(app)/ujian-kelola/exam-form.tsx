"use client"

import { useState } from "react"
import { Clock, ShieldCheck, Users } from "lucide-react"
import type { ExamKind } from "@/generated/prisma/enums"
import { isHighStakes, WORK_TYPE_LABEL } from "@/lib/labels"
import { toDateTimeInput } from "@/lib/format"
import { ActionForm, FormField, type FormAction } from "@/components/forms/action-form"
import { Checkbox } from "@/components/forms/checkbox"
import { NativeSelect } from "@/components/forms/native-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type ExamDefaults = {
  subjectId: string
  title: string
  kind: ExamKind
  categoryId: string | null
  workType: "QUIZ" | "QUESTION" | "ASSIGNMENT"
  dueAt: Date | null
  timed: boolean
  instructions: string | null
  durationMinutes: number
  startAt: Date | null
  endAt: Date | null
  maxAttempts: number
  questionsPerPage: number
  passingScore: number | null
  token: string | null
  shuffleQuestions: boolean
  shuffleOptions: boolean
  showScore: boolean
  openToAll: boolean
  requireFullscreen: boolean
  blockCopyPaste: boolean
  lockDevice: boolean
  maxLeaves: number | null
  allowedIps: string | null
  requireSeb: boolean
  sebConfigKeys: string | null
  rules: string | null
  groupIds: string[]
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof Clock; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-tint-violet text-tint-violet-fg">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function ExamForm({
  action,
  subjects,
  groups,
  categories,
  defaults,
  submitLabel,
  preselectGroupId,
}: {
  action: FormAction
  subjects: { id: string; label: string }[]
  groups: { id: string; name: string; members: number }[]
  /** Kategori aktif (+ kategori ujian ini walau sudah dinonaktifkan) */
  categories: { id: string; name: string; kind: ExamKind }[]
  defaults?: ExamDefaults
  submitLabel: string
  /** Ujian baru dari halaman kelas: kelas itu sudah tercentang. */
  preselectGroupId?: string
}) {
  const editing = !!defaults
  const initialCategory = categories.find((c) => c.id === defaults?.categoryId) ?? (defaults ? undefined : categories.find((c) => c.kind === "KUIS"))
  const [categoryId, setCategoryId] = useState(initialCategory?.id ?? "")
  const kind: ExamKind = categories.find((c) => c.id === categoryId)?.kind ?? defaults?.kind ?? "KUIS"
  const [workType, setWorkType] = useState(defaults?.workType === "QUESTION" ? "QUESTION" : "QUIZ")
  const [untimed, setUntimed] = useState(defaults ? !defaults.timed : false)
  const [openToAll, setOpenToAll] = useState(defaults?.openToAll ?? false)
  // Tingkat pengamanan bawaan: kuis/latihan = tingkat 1, UTS/UAS = tingkat 2 (Safe Exam Browser).
  const level = isHighStakes(kind) ? 2 : 1

  return (
    <ActionForm action={action} submitLabel={submitLabel} className="gap-5" footerClassName="sticky bottom-0 -mx-1 rounded-2xl bg-background/90 p-3 backdrop-blur">
      <Section icon={Clock} title="Informasi & waktu" hint="Admin/dosen menentukan berapa lama soal boleh dikerjakan.">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField name="subjectId" label="Mata uji">
            <NativeSelect id="subjectId" name="subjectId" defaultValue={defaults?.subjectId ?? subjects[0]?.id}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField name="categoryId" label="Kategori" hint="Dikelola Admin di menu Kategori Ujian.">
            <NativeSelect id="categoryId" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <input type="hidden" name="kind" value={kind} />
        <FormField name="workType" label="Jenis pekerjaan">
          <NativeSelect
            id="workType"
            name="workType"
            value={workType}
            onChange={(e) => {
              setWorkType(e.target.value)
              if (!editing) setUntimed(e.target.value === "QUESTION")
            }}
          >
            <option value="QUIZ">{WORK_TYPE_LABEL.QUIZ} — kumpulan soal (pilihan ganda, isian, esai)</option>
            <option value="QUESTION">{WORK_TYPE_LABEL.QUESTION} — satu soal singkat untuk kelas</option>
          </NativeSelect>
        </FormField>
        <FormField name="title" label="Judul ujian">
          <Input id="title" name="title" defaultValue={defaults?.title} maxLength={200} required placeholder="mis. UTS Algoritma & Pemrograman" />
        </FormField>
        <FormField name="instructions" label="Petunjuk pengerjaan (opsional)">
          <Textarea id="instructions" name="instructions" defaultValue={defaults?.instructions ?? ""} rows={3} maxLength={10_000} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FormField name="durationMinutes" label="Durasi pengerjaan (menit)" hint={untimed ? "Tidak dipakai — tanpa batas durasi." : "Dihitung sejak peserta menekan Mulai."}>
            <Input id="durationMinutes" name="durationMinutes" type="number" inputMode="numeric" min={1} max={600} defaultValue={defaults?.durationMinutes ?? 60} required readOnly={untimed} className={untimed ? "opacity-50" : undefined} />
          </FormField>
          <FormField name="dueAt" label="Tenggat (WIB)" hint="Opsional. Setelahnya tetap bisa dikumpulkan s.d. waktu tutup, ditandai terlambat.">
            <Input id="dueAt" name="dueAt" type="datetime-local" defaultValue={toDateTimeInput(defaults?.dueAt)} />
          </FormField>
          <FormField name="startAt" label="Dibuka (WIB)" hint="Kosong = langsung">
            <Input id="startAt" name="startAt" type="datetime-local" defaultValue={toDateTimeInput(defaults?.startAt)} />
          </FormField>
          <FormField name="endAt" label="Ditutup (WIB)" hint="Kosong = tanpa batas">
            <Input id="endAt" name="endAt" type="datetime-local" defaultValue={toDateTimeInput(defaults?.endAt)} />
          </FormField>
          <FormField name="maxAttempts" label="Kesempatan mengerjakan">
            <Input id="maxAttempts" name="maxAttempts" type="number" inputMode="numeric" min={1} max={10} defaultValue={defaults?.maxAttempts ?? 1} />
          </FormField>
          <FormField name="questionsPerPage" label="Soal per halaman" hint="Tampilan lembar ujian peserta.">
            <NativeSelect id="questionsPerPage" name="questionsPerPage" defaultValue={String(defaults?.questionsPerPage ?? 1)}>
              {[1, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 soal per layar" : `${n} soal per halaman`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField name="passingScore" label="Nilai lulus (opsional)" hint="0–100">
            <Input id="passingScore" name="passingScore" type="number" inputMode="decimal" min={0} max={100} step="any" defaultValue={defaults?.passingScore ?? ""} />
          </FormField>
          <FormField name="token" label="Token ujian (opsional)" hint="Diumumkan pengawas saat mulai.">
            <Input id="token" name="token" defaultValue={defaults?.token ?? ""} maxLength={12} autoComplete="off" className="font-mono uppercase" />
          </FormField>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="untimed" checked={untimed} onChange={(e) => setUntimed(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
            <span>
              Tanpa batas durasi
              <span className="block text-xs text-muted-foreground">Peserta boleh mengerjakan kapan saja sampai waktu tutup (cocok untuk Pertanyaan/latihan).</span>
            </span>
          </label>
          <Checkbox name="shuffleQuestions" label="Acak urutan soal" defaultChecked={defaults?.shuffleQuestions ?? true} />
          <Checkbox name="shuffleOptions" label="Acak urutan pilihan" defaultChecked={defaults?.shuffleOptions ?? true} />
          <Checkbox name="hideScore" label="Sembunyikan nilai dari peserta" hint="Tampilkan nanti setelah esai dikoreksi." defaultChecked={defaults ? !defaults.showScore : isHighStakes(kind)} />
        </div>
      </Section>

      <Section icon={Users} title="Peserta" hint="Siapa yang dapat melihat & mengerjakan ujian ini.">
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="openToAll" checked={openToAll} onChange={(e) => setOpenToAll(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            Terbuka untuk semua peserta aktif
            <span className="block text-xs text-muted-foreground">Cocok untuk tes umum. Bila tidak dicentang, pilih kelompok di bawah.</span>
          </span>
        </label>
        {!openToAll &&
          (groups.length === 0 ? (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Belum ada kelompok peserta — admin dapat membuatnya di menu Kelompok Peserta.</p>
          ) : (
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" name="groupId" value={g.id} defaultChecked={defaults ? defaults.groupIds.includes(g.id) : g.id === preselectGroupId} className="size-4 accent-primary" />
                  <span className="flex-1 truncate">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{g.members}</span>
                </label>
              ))}
            </div>
          ))}
      </Section>

      <Section
        icon={ShieldCheck}
        title="Pengamanan ujian"
        hint={level === 2 ? "Bawaan UTS/UAS: tingkat 2 — wajib Safe Exam Browser + pengamanan tingkat 1." : "Bawaan kuis/latihan: tingkat 1 — deteksi & sanksi di browser biasa."}
      >
        {/* key: saat membuat baru, preset berganti mengikuti jenis ujian */}
        <div key={editing ? "edit" : `preset-${level}`} className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Checkbox name="requireFullscreen" label="Wajib layar penuh (laptop/PC)" defaultChecked={defaults?.requireFullscreen ?? true} />
            <Checkbox name="blockCopyPaste" label="Blokir salin, tempel & klik kanan" defaultChecked={defaults?.blockCopyPaste ?? true} />
            <Checkbox name="lockDevice" label="Kunci ke satu perangkat" hint="Pengawas dapat mereset bila peserta berganti perangkat." defaultChecked={defaults?.lockDevice ?? true} />
            <Checkbox
              name="requireSeb"
              label="Wajib Safe Exam Browser (tingkat 2)"
              hint="Mengunci laptop/PC/iPad selama ujian. Android tidak didukung."
              defaultChecked={defaults?.requireSeb ?? level === 2}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField name="maxLeaves" label="Batas pelanggaran (keluar halaman)" hint="Tercapai → dikumpulkan otomatis. Kosong = hanya dicatat.">
              <Input id="maxLeaves" name="maxLeaves" type="number" inputMode="numeric" min={1} max={50} defaultValue={defaults ? (defaults.maxLeaves ?? "") : 3} />
            </FormField>
            <FormField name="allowedIps" label="Batasi jaringan (opsional)" hint="IP/CIDR dipisah koma, mis. 103.10.20.0/24">
              <Input id="allowedIps" name="allowedIps" defaultValue={defaults?.allowedIps ?? ""} maxLength={2000} className="font-mono" />
            </FormField>
          </div>
          <FormField name="sebConfigKeys" label="Config Key SEB khusus ujian ini (opsional)" hint="Kosong = memakai SEB_CONFIG_KEYS dari server. Satu per baris.">
            <Textarea id="sebConfigKeys" name="sebConfigKeys" defaultValue={defaults?.sebConfigKeys ?? ""} rows={2} className="font-mono text-xs" spellCheck={false} />
          </FormField>
        </div>
        <FormField name="rules" label="Tata tertib tambahan (opsional)" hint="Satu aturan per baris, maks. 20 — tampil bersama aturan otomatis.">
          <Textarea id="rules" name="rules" defaultValue={defaults?.rules ?? ""} rows={3} maxLength={5000} placeholder={"Dilarang bekerja sama.\nKamera Zoom wajib menyala."} />
        </FormField>
      </Section>
    </ActionForm>
  )
}
