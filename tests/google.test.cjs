// Uji integrasi Google OAuth 2.0 TANPA akun Google sungguhan: tombol, CSP, dan
// pengalihan ke halaman izin Google dengan parameter OAuth/OIDC yang benar.
// Prasyarat (build & start dengan kredensial tiruan — CSP dibaca saat build):
//   AUTH_GOOGLE_ID=e2e-dummy.apps.googleusercontent.com AUTH_GOOGLE_SECRET=x npm run build
//   AUTH_GOOGLE_ID=e2e-dummy.apps.googleusercontent.com AUTH_GOOGLE_SECRET=x npm start -- -p 3123
// Langkah terakhir (login di Google lalu kembali ke callback) butuh kredensial asli — uji manual.
const ROOT = require("node:path").resolve(__dirname, "..")
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env`, quiet: true })
const { encodeReply } = require(`${ROOT}/node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js`)
const manifest = require(`${ROOT}/.next/server/server-reference-manifest.json`).node
const BASE = process.env.TEST_BASE ?? "http://localhost:3123"
const CLIENT_ID = "e2e-dummy.apps.googleusercontent.com"

let pass = 0, fail = 0
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x && !ok ? "  — " + String(x).slice(0, 400) : ""}`) }
const actionId = (name, file) => Object.entries(manifest).find(([, v]) => v.exportedName === name && v.filename.includes(file))?.[0]

;(async () => {
  const login = await fetch(`${BASE}/login`)
  const html = await login.text()
  check("Halaman Masuk: tombol \"Masuk dengan Google\"", html.includes("Masuk dengan Google"))
  check("CSP form-action mengizinkan accounts.google.com", /form-action 'self' https:\/\/accounts\.google\.com/.test(login.headers.get("content-security-policy") ?? ""), login.headers.get("content-security-policy"))
  check("Halaman Daftar: tombol \"Daftar dengan Google\"", (await (await fetch(`${BASE}/daftar`)).text()).includes("Daftar dengan Google"))

  // Tekan tombol: Server Action googleSignIn → Auth.js membangun URL otorisasi Google.
  const fd = new FormData()
  fd.append("callbackUrl", "/kelas")
  const res = await fetch(`${BASE}/login`, { method: "POST", redirect: "manual", headers: { origin: BASE, "next-action": actionId("googleSignIn", "auth/public-actions") }, body: await encodeReply([fd]) })
  const target = res.headers.get("x-action-redirect") ?? res.headers.get("location") ?? ""
  const url = target.startsWith("http") ? new URL(target.split(";")[0]) : null
  check("Tombol Google → diarahkan ke halaman izin Google", url?.origin === "https://accounts.google.com", `${res.status} ${target}`)
  const q = url?.searchParams
  const appOrigin = new URL(process.env.AUTH_URL || "http://localhost:3000").origin
  check("Parameter OAuth: client_id, response_type=code, scope openid email profile", q?.get("client_id") === CLIENT_ID && q?.get("response_type") === "code" && ["openid", "email", "profile"].every((s) => q?.get("scope")?.split(" ").includes(s)), target)
  check("redirect_uri = {AUTH_URL}/api/auth/callback/google (daftarkan persis ini di Google Cloud)", q?.get("redirect_uri") === `${appOrigin}/api/auth/callback/google`, q?.get("redirect_uri"))
  check("Perlindungan CSRF/replay: PKCE (S256) atau state disertakan", q?.get("code_challenge_method") === "S256" || !!q?.get("state"), target)
  check("Cookie sementara OAuth diset (pkce/state, httpOnly)", res.headers.getSetCookie().some((c) => /authjs\.(pkce|state)/.test(c) && /httponly/i.test(c)), res.headers.getSetCookie().join(" | "))

  console.log(`\n${pass} lulus, ${fail} gagal`)
  if (fail) process.exit(1)
})()
