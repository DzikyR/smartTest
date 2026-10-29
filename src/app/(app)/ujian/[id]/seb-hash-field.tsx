"use client"

import { useEffect, useState } from "react"

/**
 * Input tersembunyi berisi hash Config Key dari JavaScript API Safe Exam Browser.
 * Cadangan bila SEB tidak menyertakan header pada permintaan Server Action
 * (mis. WebView iOS). Di browser biasa nilainya kosong.
 */
export function SebHashField() {
  const [hash, setHash] = useState("")
  useEffect(() => {
    try {
      const seb = (window as unknown as { SafeExamBrowser?: { security?: { configKey?: string } } }).SafeExamBrowser
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHash(seb?.security?.configKey ?? "")
    } catch {}
  }, [])
  return <input type="hidden" name="sebHash" value={hash} />
}
