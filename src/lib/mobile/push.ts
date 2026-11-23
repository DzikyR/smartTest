import "server-only"
import { readFileSync } from "node:fs"
import { db } from "@/lib/db"

/**
 * Notifikasi aplikasi mobile lewat Firebase Cloud Messaging (FCM) Topics.
 *
 * Satu topik per kelas (`<prefix>_class_<groupId>`): memposting materi/tugas ke kelas
 * = SATU permintaan ke FCM, berapa pun jumlah siswanya. Langganan topik dilakukan
 * SERVER (bukan aplikasi), sehingga siswa tidak bisa ikut topik kelas lain.
 *
 * Aktif bila FCM_CREDENTIALS berisi path berkas service account JSON (Firebase Console →
 * Project settings → Service accounts). Kosong = semua fungsi di sini tidak melakukan apa-apa.
 */

const PREFIX = (process.env.FCM_TOPIC_PREFIX || "smarttest").replace(/[^A-Za-z0-9_-]/g, "")

export const pushEnabled = () => !!process.env.FCM_CREDENTIALS

export const classTopic = (groupId: string) => `${PREFIX}_class_${groupId}`

type Messaging = import("firebase-admin/messaging").Messaging
const store = globalThis as unknown as { __fcm?: Promise<Messaging> }

/** Klien FCM dimuat saat pertama dibutuhkan (firebase-admin tidak ikut dimuat bila FCM tidak dipakai). */
function messaging(): Promise<Messaging> {
  store.__fcm ??= (async () => {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app")
    const { getMessaging } = await import("firebase-admin/messaging")
    const app = getApps().find((a) => a.name === "smarttest") ?? initializeApp({ credential: cert(JSON.parse(readFileSync(process.env.FCM_CREDENTIALS!, "utf8"))) }, "smarttest")
    return getMessaging(app)
  })()
  store.__fcm.catch(() => (store.__fcm = undefined))
  return store.__fcm
}

/** Topik yang seharusnya diikuti pengguna: kelas tempat ia anggota aktif (siswa atau co-teacher) dan kelas miliknya. */
export async function expectedTopics(userId: string) {
  const groups = await db.group.findMany({
    where: { archivedAt: null, OR: [{ ownerId: userId }, { members: { some: { userId, status: "ACTIVE" } } }] },
    select: { id: true },
  })
  return groups.map((g) => classTopic(g.id)).sort()
}

/**
 * Daftarkan token FCM perangkat & samakan langganan topiknya dengan keanggotaan kelas terkini.
 * Dipanggil aplikasi saat dibuka, saat token berganti, dan setelah bergabung ke kelas.
 */
export async function syncDevicePush(opts: { userId: string; deviceId: string; platform: string; appVersion: string | null; fcmToken: string }) {
  const wanted = await expectedTopics(opts.userId)
  // Token yang sama pernah dipakai akun lain di perangkat ini (ganti akun): lepaskan dari akun lama.
  const other = await db.mobileDevice.findUnique({ where: { fcmToken: opts.fcmToken }, select: { id: true, userId: true, deviceId: true, topics: true } })
  if (other && (other.userId !== opts.userId || other.deviceId !== opts.deviceId)) {
    await unsubscribeAll(opts.fcmToken, other.topics)
    await db.mobileDevice.update({ where: { id: other.id }, data: { fcmToken: null, topics: [] } })
  }
  const row = await db.mobileDevice.findUnique({ where: { userId_deviceId: { userId: opts.userId, deviceId: opts.deviceId } }, select: { fcmToken: true, topics: true } })
  // Token lama perangkat ini (diganti FCM) berhenti menerima notifikasi.
  if (row?.fcmToken && row.fcmToken !== opts.fcmToken) await unsubscribeAll(row.fcmToken, row.topics)
  const current = row?.fcmToken === opts.fcmToken ? row.topics : []

  let topics: string[] = []
  if (pushEnabled()) {
    const fcm = await messaging()
    const add = wanted.filter((t) => !current.includes(t))
    const remove = current.filter((t) => !wanted.includes(t))
    await Promise.all([...add.map((t) => fcm.subscribeToTopic(opts.fcmToken, t)), ...remove.map((t) => fcm.unsubscribeFromTopic(opts.fcmToken, t))])
    topics = wanted
  }
  await db.mobileDevice.upsert({
    where: { userId_deviceId: { userId: opts.userId, deviceId: opts.deviceId } },
    create: { userId: opts.userId, deviceId: opts.deviceId, platform: opts.platform, appVersion: opts.appVersion, fcmToken: opts.fcmToken, topics },
    update: { platform: opts.platform, appVersion: opts.appVersion, fcmToken: opts.fcmToken, topics },
  })
  return { enabled: pushEnabled(), topics }
}

async function unsubscribeAll(token: string, topics: string[]) {
  if (!pushEnabled() || topics.length === 0) return
  const fcm = await messaging()
  await Promise.allSettled(topics.map((t) => fcm.unsubscribeFromTopic(token, t)))
}

/** Logout: perangkat ini berhenti menerima notifikasi akun tersebut. */
export async function forgetDevicePush(userId: string, deviceId: string) {
  const row = await db.mobileDevice.findUnique({ where: { userId_deviceId: { userId, deviceId } }, select: { id: true, fcmToken: true, topics: true } })
  if (!row) return
  if (row.fcmToken) await unsubscribeAll(row.fcmToken, row.topics)
  await db.mobileDevice.update({ where: { id: row.id }, data: { fcmToken: null, topics: [] } })
}

export type ClassNotice = { kind: "MATERI" | "TUGAS" | "TUGAS_KUIS" | "PERTANYAAN"; groupId: string; className: string; title: string; materialId: string; examId?: string | null }

const KIND_LABEL: Record<ClassNotice["kind"], string> = { MATERI: "Materi baru", TUGAS: "Tugas baru", TUGAS_KUIS: "Kuis baru", PERTANYAAN: "Pertanyaan baru" }

/**
 * Kirim satu notifikasi ke seluruh anggota kelas. Tidak pernah melempar error:
 * kegagalan FCM tidak boleh menggagalkan posting pengajar (hanya dicatat di log server).
 */
export async function notifyClass(notice: ClassNotice) {
  if (!pushEnabled()) return
  try {
    const fcm = await messaging()
    await fcm.send({
      topic: classTopic(notice.groupId),
      notification: { title: `${KIND_LABEL[notice.kind]} · ${notice.className}`.slice(0, 120), body: notice.title.slice(0, 200) },
      // Data FCM wajib string. Aplikasi membuka layar sesuai `type` + id.
      data: { type: notice.kind, groupId: notice.groupId, materialId: notice.materialId, ...(notice.examId ? { examId: notice.examId } : {}) },
      android: { priority: "high", collapseKey: `post_${notice.materialId}`, notification: { channelId: "kelas", tag: `post_${notice.materialId}` } },
      apns: { payload: { aps: { sound: "default", threadId: classTopic(notice.groupId) } } },
    })
  } catch (e) {
    console.error("[fcm] gagal mengirim notifikasi kelas", notice.groupId, e)
  }
}

/**
 * Kabarkan postingan yang baru terbit ke kelasnya masing-masing. Postingan yang belum
 * terlihat mahasiswa (draf, atau menautkan ujian yang belum terbit) dilewati.
 */
export async function notifyPublishedPosts(materialIds: string[]) {
  if (!pushEnabled() || materialIds.length === 0) return
  const rows = await db.material.findMany({
    where: { id: { in: materialIds }, status: "PUBLISHED" },
    select: { id: true, kind: true, title: true, groupId: true, examId: true, group: { select: { name: true, archivedAt: true } }, exam: { select: { publishedAt: true } } },
  })
  for (const m of rows) {
    if (m.group.archivedAt || (m.examId && !m.exam?.publishedAt)) continue
    await notifyClass({ kind: m.kind, groupId: m.groupId, className: m.group.name, title: m.title, materialId: m.id, examId: m.examId })
  }
}
