// Uji jaringan kampus tepercaya & batas per IP (satu kampus/lab di balik NAT = satu IP publik).
// Prasyarat sama dengan e2e.test.cjs (server :3123 BARU — rate limit di memori — dengan DB uji).
// IP klien disimulasikan lewat X-Forwarded-For (server uji tidak di belakang proxy).
// Data uji: pengguna 'e2enet*', kelas 'E2E NET*'; dibersihkan di akhir.
const ROOT = require("node:path").resolve(__dirname, "..")
const fs = require("node:fs")
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env`, quiet: true })
const { encodeReply } = require(`${ROOT}/node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js`)
const { Client } = require(`${ROOT}/node_modules/pg`)
const bcrypt = require(`${ROOT}/node_modules/bcryptjs`)
const manifest = require(`${ROOT}/.next/server/server-reference-manifest.json`).node
const BASE = process.env.TEST_BASE ?? "http://localhost:3123"
const API = `${BASE}/api/v1/mobile`

const pw = Object.fromEntries(fs.readFileSync(`${ROOT}/.akun-demo.txt`, "utf8").split("\n").slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/).slice(1)))
let pass = 0, fail = 0
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x && !ok ? "  — " + String(x).slice(0, 400) : ""}`) }
class Jar { c = new Map(); add(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(";"); const i = kv.indexOf("="); this.c.set(kv.slice(0, i), kv.slice(i + 1)) } } get header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ") } }
const xff = (ip) => (ip ? { "x-forwarded-for": ip } : {})
async function login(identifier, password = pw[identifier], ip) {
  const jar = new Jar(); const r1 = await fetch(`${BASE}/api/auth/csrf`, { headers: xff(ip) }); jar.add(r1); const { csrfToken } = await r1.json()
  jar.add(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { cookie: jar.header, "content-type": "application/x-www-form-urlencoded", ...xff(ip) }, body: new URLSearchParams({ csrfToken, identifier, password }) }))
  return jar
}
const id = (n, f) => { const e = Object.entries(manifest).find(([, v]) => v.exportedName === n && v.filename.includes(f)); if (!e) throw new Error(`action ${n} ${f}?`); return e[0] }
const form = (o) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [].concat(v)) fd.append(k, String(x)); return fd }
const PREV = { ok: false, error: "" }
async function act(jar, page, file, name, args, ip) {
  const body = await encodeReply(args)
  const res = await fetch(BASE + page, { method: "POST", redirect: "manual", headers: { cookie: jar?.header ?? "", origin: BASE, "next-action": id(name, file), ...xff(ip), ...(typeof body === "string" ? { "content-type": "text/plain;charset=UTF-8" } : {}) }, body })
  jar?.add(res)
  let result; for (const l of (await res.text()).split("\n")) { const m = l.match(/^[0-9a-f]+:(.*)$/); if (m) try { const v = JSON.parse(m[1]); if (v && typeof v.ok === "boolean") result = v } catch {} }
  return result
}
const join = async (jar, code, ip) => {
  const r = await fetch(`${BASE}/api/v1/join`, { method: "POST", headers: { cookie: jar.header, "content-type": "application/json", ...xff(ip) }, body: JSON.stringify({ code }) })
  return { ...(await r.json()), http: r.status }
}
const mlogin = async (identifier, password, ip) =>
  (await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-device-id": `e2enet-${crypto.randomUUID()}`, "x-platform": "android", ...xff(ip) }, body: JSON.stringify({ identifier, password }) })).status
const F = "admin/fitur/actions", R = "auth/public-actions"
const BAD = "ZZZ-ZZZZ" // format sah, tidak ada

;(async () => {
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect()
  const one = async (q, p = []) => (await pg.query(q, p)).rows[0]
  const PW = "NetUji-2026!x"
  const hash = bcrypt.hashSync(PW, 10)
  const N = 24
  const names = Array.from({ length: N }, (_, i) => `e2enet${String(i + 1).padStart(2, "0")}`)
  try {
    await pg.query(`delete from users where username like 'e2enet%'`)
    for (const u of names) await pg.query(`insert into users (id, email, username, name, "passwordHash", role, "updatedAt") values ($1, $2, $1, $3, $4, 'PESERTA', now())`, [u, `${u}@e2e.test`, `E2E ${u}`, hash])
    const sa = await login("superadmin"), admin = await login("admin"), rina = await login("dosen.rina")

    // ---------- Pengaturan Super Admin ----------
    const save = (jar, o) => act(jar, "/admin/fitur", F, "saveTrustedNetworks", [PREV, form(o)])
    let r = await save(admin, { networks: "198.51.100.0/24", multiplier: "2" })
    check("Admin (bukan Super Admin) menyimpan jaringan tepercaya → ditolak", r?.ok !== true && !(await one(`select 1 from site_settings where key='network'`)), JSON.stringify(r))
    r = await save(sa, { networks: "198.51.100.0/24\nbukan-ip\n10.0.0.1/40", multiplier: "2" })
    check("Entri bukan IP/CIDR → ditolak per field, entri salah disebutkan", r?.ok === false && /bukan-ip/.test(r.fieldErrors?.networks) && /10\.0\.0\.1\/40/.test(r.fieldErrors?.networks), JSON.stringify(r))
    r = await save(sa, { networks: "10.0.0.0/8", multiplier: "2" })
    const rMul = await save(sa, { networks: "198.51.100.0/24", multiplier: "1" })
    check("Jaringan terlalu luas (/8) & pengali di luar 2–100 → ditolak", r?.ok === false && !!r.fieldErrors?.networks && rMul?.ok === false && !!rMul.fieldErrors?.multiplier, JSON.stringify([r, rMul]))
    r = await save(sa, { networks: "198.51.100.7/24  # lab A\n2001:db8:77::/48\n198.51.100.0/24", multiplier: "2" })
    const saved = await one(`select value from site_settings where key='network'`)
    const audited = await one(`select 1 from audit_logs where action='TRUSTED_NETWORKS_CHANGED' order by "createdAt" desc limit 1`)
    check("Super Admin menyimpan: dibakukan & tanpa duplikat, tercatat di log audit", r?.ok && JSON.stringify(saved?.value) === JSON.stringify({ networks: ["198.51.100.0/24", "2001:db8:77::/48"], multiplier: 2 }) && !!audited, JSON.stringify([r, saved]))
    const page = await (await fetch(`${BASE}/admin/fitur`, { headers: { cookie: sa.header, ...xff("198.51.100.20") } })).text()
    check("Halaman Kontrol Fitur: kartu Jaringan kampus tepercaya, IP Super Admin terbaca & ditandai tepercaya", page.includes("Jaringan kampus tepercaya") && page.includes("198.51.100.20") && page.includes("Tepercaya") && page.includes("198.51.100.0/24"))

    // ---------- Login gagal per IP ----------
    const fails = async (ip, n) => { const s = new Set(); for (let i = 0; i < n; i++) s.add(await mlogin(`e2enet-tak-ada-${i}`, "tebakan123", ip)); return s }
    let codes = await fails("203.0.113.120", 100)
    let ok = await mlogin(names[0], PW, "203.0.113.120")
    check("IP biasa: 100 login gagal → IP diblokir (login benar pun 429)", codes.has(401) && !codes.has(429) && ok === 429, JSON.stringify([[...codes], ok]))
    codes = await fails("198.51.100.30", 150)
    ok = await mlogin(names[0], PW, "198.51.100.30")
    check("Jaringan tepercaya (×2): 150 login gagal belum memblokir; login benar tetap masuk", !codes.has(429) && ok === 200, JSON.stringify([[...codes], ok]))
    codes = await fails("198.51.100.30", 51)
    check("Jaringan tepercaya tetap punya batas: lewat 200 gagal → 429", codes.has(429), JSON.stringify([...codes]))

    // ---------- Gabung kelas: hanya kode SALAH yang dihitung per IP ----------
    await act(rina, "/kelas", "kelas/actions", "createClass", [PREV, form({ name: "E2E NET Kelas Lab", subjectId: "", term: "", joinPolicy: "AUTO" })])
    const cls = await one(`select g.id, c.code from groups g join access_codes c on c."groupId"=g.id and c.status='ACTIVE' where g.name='E2E NET Kelas Lab'`)
    const LAB = "203.0.113.130", TRUSTED = "198.51.100.40"
    const jars = []
    for (let i = 0; i < N; i++) jars.push(await login(names[i], PW, i < 12 ? LAB : TRUSTED))
    const joined = []
    for (let i = 0; i < 12; i++) joined.push((await join(jars[i], cls.code, LAB)).http)
    check("12 peserta dari satu IP bergabung (berhasil tidak dihitung)", joined.every((s) => s === 200) && Number((await one(`select count(*) n from group_members where "groupId"=$1`, [cls.id])).n) === 12, JSON.stringify(joined))
    const bad = []
    for (let k = 0; k < 8; k++) for (let i = 0; i < 12; i++) bad.push((await join(jars[i], BAD, LAB)).http)
    for (let i = 0; i < 4; i++) bad.push((await join(jars[i], BAD, LAB)).http)
    const blocked = await join(jars[4], BAD, LAB)
    const blockedValid = await join(jars[5], cls.code, LAB)
    const other = await join(jars[6], cls.code, "203.0.113.131")
    check("IP biasa: 100 kode salah → diterima sebagai INVALID; berikutnya (juga kode benar) → 429; IP lain tidak ikut terblokir", bad.length === 100 && bad.every((s) => s === 404) && blocked.http === 429 && blockedValid.http === 429 && other.http === 200, JSON.stringify([bad.filter((s) => s !== 404), blocked, blockedValid, other]))
    const tJoined = [], tBad = []
    for (let i = 12; i < N; i++) tJoined.push((await join(jars[i], cls.code, TRUSTED)).http)
    for (let k = 0; k < 9; k++) for (let i = 12; i < N; i++) tBad.push((await join(jars[i], BAD, TRUSTED)).http)
    check("Jaringan tepercaya (×2): 12 bergabung + 108 kode salah → tidak ada 429", tJoined.every((s) => s === 200) && tBad.length === 108 && tBad.every((s) => s === 404), JSON.stringify([tJoined, tBad.filter((s) => s !== 404)]))
    const acct = await join(jars[12], BAD, TRUSTED)
    check("Batas per akun tetap berlaku di jaringan tepercaya (10/menit)", acct.http === 429, JSON.stringify(acct))

    // ---------- Lupa password & IPv6 per /64 ----------
    const reset = async (ip, n) => { const out = []; for (let i = 0; i < n; i++) out.push((await act(null, "/lupa-password", R, "requestPasswordReset", [PREV, form({ email: `e2enet-reset-${ip}-${i}@contoh.test` })], ip))?.ok); return out }
    let rs = await reset("203.0.113.140", 6)
    check("IP biasa: permintaan reset ke-6 dalam 15 menit → ditolak", rs.slice(0, 5).every(Boolean) && rs[5] === false, JSON.stringify(rs))
    rs = await reset("198.51.100.50", 8)
    check("Jaringan tepercaya: 8 permintaan reset → semua diterima", rs.every(Boolean), JSON.stringify(rs))
    const v6 = []
    for (let i = 0; i < 6; i++) v6.push((await act(null, "/lupa-password", R, "requestPasswordReset", [PREV, form({ email: `e2enet-v6-${i}@contoh.test` })], `2001:db8:5:6::${(i + 1).toString(16)}`))?.ok)
    check("IPv6: alamat berbeda di /64 yang sama dihitung satu → ke-6 ditolak", v6.slice(0, 5).every(Boolean) && v6[5] === false, JSON.stringify(v6))
    const v6t = []
    for (let i = 0; i < 7; i++) v6t.push((await act(null, "/lupa-password", R, "requestPasswordReset", [PREV, form({ email: `e2enet-v6t-${i}@contoh.test` })], `2001:db8:77:${i}::1`))?.ok)
    check("IPv6 di jaringan tepercaya (/48) → semua diterima", v6t.every(Boolean), JSON.stringify(v6t))

    // ---------- Kosongkan ----------
    r = await save(sa, { networks: "", multiplier: "20" })
    const emptyRs = await reset("198.51.100.60", 6)
    check("Daftar dikosongkan → seketika kembali ke batas bawaan", r?.ok && emptyRs[5] === false, JSON.stringify([r, emptyRs]))
  } finally {
    await pg.query(`delete from site_settings where key='network'`)
    await pg.query(`delete from groups where name like 'E2E NET%'`)
    await pg.query(`delete from users where username like 'e2enet%'`)
    await pg.end()
  }
  console.log(`\n${pass} lulus, ${fail} gagal`)
  if (fail) process.exit(1)
})()
