import "server-only"
import QRCode from "qrcode"

/**
 * QR code tautan undangan sebagai data URL SVG (CSP img-src mengizinkan data:).
 * Dirender di server — klien cukup <img>, tanpa HTML mentah.
 */
export async function qrDataUrl(text: string) {
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}
