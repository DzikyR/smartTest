import type { ExamRule } from "@/lib/exam/rules"
import { cn } from "@/lib/utils"

/** Daftar tata tertib: aturan otomatis (dari pengaturan) lalu aturan tambahan dosen. */
export function ExamRulesList({ rules, className }: { rules: ExamRule[]; className?: string }) {
  const custom = rules.filter((r) => r.source === "author")
  return (
    <div className={cn("flex flex-col gap-3 text-sm", className)}>
      <ol className="list-decimal space-y-1 pl-5">
        {rules
          .filter((r) => r.source === "system")
          .map((r, i) => (
            <li key={i}>{r.text}</li>
          ))}
      </ol>
      {custom.length > 0 && (
        <div className="rounded-lg border-l-2 border-primary bg-primary/5 p-3">
          <p className="mb-1 text-xs font-semibold text-primary">Ketentuan tambahan dari pengelola ujian</p>
          <ol className="list-decimal space-y-1 pl-5">
            {custom.map((r, i) => (
              <li key={i} className="whitespace-pre-wrap">
                {r.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
