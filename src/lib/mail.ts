import "server-only"
import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import nodemailer, { type Transporter } from "nodemailer"

export type Mail = { to: string; subject: string; text: string; html?: string }

let transporter: Transporter | null = null

/**
 * Kirim email lewat SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
 * MAIL_TRANSPORT=file menulis ke folder .mail-outbox (pengembangan & uji e2e).
 * Tanpa konfigurasi: email tidak terkirim dan hanya dicatat di log server.
 */
export async function sendMail(mail: Mail) {
  const from = process.env.SMTP_FROM || "SmartTest <no-reply@localhost>"

  if (process.env.MAIL_TRANSPORT === "file") {
    const dir = path.join(process.cwd(), ".mail-outbox")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${Date.now()}-${randomBytes(3).toString("hex")}.json`), JSON.stringify({ from, ...mail }, null, 2))
    return
  }
  if (!process.env.SMTP_HOST) {
    console.warn(`[mail] SMTP belum dikonfigurasi — email "${mail.subject}" ke ${mail.to} tidak terkirim.`)
    if (process.env.NODE_ENV !== "production") console.info(mail.text)
    return
  }

  const port = Number(process.env.SMTP_PORT || 587)
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  await transporter.sendMail({ from, ...mail })
}
