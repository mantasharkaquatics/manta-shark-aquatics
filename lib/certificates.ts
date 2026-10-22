/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto'
import { getT, toLocale, dateTag, type Locale } from './i18n/all'
import { sendEmail } from './email'

/* Level-up certificates (owner, 2026-10-22, tier 2).

   A certificate is a level_upgrades row that moved a swimmer UP from a level
   they already had (from_level set, to_level higher): the first level from the
   Swim Assessment is a placement, not an achievement, and a correction
   downwards is not one either. Emailed to the family when the promotion is
   approved (setStudentLevel), and on the dashboard for good.

   The page is /api/certificates/<id>: in the family's language, printable on
   one landscape page, with a Print / Save as PDF button. */

export type Certificate = { id: string; studentId: string; studentName: string; fromLevel: number; toLevel: number; date: string; coach: string | null }

export const isPromotion = (r: { from_level: number | null; to_level: number | null }) =>
  r.from_level != null && r.to_level != null && Number(r.to_level) > Number(r.from_level)

/** One certificate, or null when the row is not a promotion. */
export async function readCertificate(svc: any, id: string): Promise<(Certificate & { parentId: string }) | null> {
  const { data: u } = await svc.from('level_upgrades').select('id, student_id, from_level, to_level, upgraded_at').eq('id', id).maybeSingle()
  if (!u || !isPromotion(u)) return null
  const [{ data: st }, { data: rec }] = await Promise.all([
    svc.from('students').select('full_name, parent_id').eq('id', u.student_id).maybeSingle(),
    // The coach who recommended the move, when there was one.
    svc.from('level_recommendations').select('coach_id, reviewed_at').eq('student_id', u.student_id)
      .eq('status', 'approved').eq('final_level', u.to_level).order('reviewed_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!st) return null
  let coach: string | null = null
  if (rec?.coach_id) {
    const { data: c } = await svc.from('coaches').select('first_name, last_name').eq('id', rec.coach_id).maybeSingle()
    if (c) coach = `${c.first_name || ''} ${c.last_name || ''}`.trim() || null
  }
  return {
    id: u.id, studentId: u.student_id, studentName: st.full_name, parentId: st.parent_id,
    fromLevel: Number(u.from_level), toLevel: Number(u.to_level),
    date: new Date(u.upgraded_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }), coach,
  }
}

/** Every certificate of a family's swimmers, newest first. */
export async function familyCertificates(svc: any, parentId: string): Promise<{ id: string; studentId: string; toLevel: number; date: string }[]> {
  const { data: kids } = await svc.from('students').select('id').eq('parent_id', parentId)
  const ids = (kids || []).map((k: any) => k.id)
  if (!ids.length) return []
  const { data: rows } = await svc.from('level_upgrades').select('id, student_id, from_level, to_level, upgraded_at').in('student_id', ids).order('upgraded_at', { ascending: false })
  return (rows || []).filter(isPromotion).map((r: any) => ({
    id: r.id, studentId: r.student_id, toLevel: Number(r.to_level),
    date: new Date(r.upgraded_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
  }))
}

/** Emails the family their swimmer's certificate. Best effort, never throws. */
export async function sendCertificate(svc: any, upgradeId: string): Promise<void> {
  try {
    const c = await readCertificate(svc, upgradeId)
    if (!c) return
    const { data: p } = await svc.from('parents').select('first_name, email, preferred_language').eq('id', c.parentId).maybeSingle()
    if (!p?.email) return
    await sendEmail({
      type: 'level_certificate', to: p.email, parentName: p.first_name || '', lang: p.preferred_language || undefined,
      studentName: c.studentName, level: c.toLevel, linkUrl: `https://www.mantasharkaquatics.net/api/certificates/${c.id}`,
    })
  } catch (e) {
    console.error('certificate email failed for', upgradeId, e instanceof Error ? e.message : '')
  }
}

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const PRINT_JS = "document.getElementById('print').addEventListener('click',function(){window.print()})"
export const PRINT_JS_HASH = createHash('sha256').update(PRINT_JS).digest('base64')

/** The certificate page. */
export function certificateHtml(c: Certificate, lang: string | null | undefined): string {
  const L: Locale = toLocale(lang || 'en')
  const t = getT(L)
  const date = new Date(c.date + 'T12:00:00Z').toLocaleDateString(dateTag(L), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const levelName = t(`level.${c.toLevel}.name`)
  return `<!DOCTYPE html>
<html lang="${L}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('cert.pageTitle', { name: c.studentName, n: c.toLevel }))}</title>
<style>
  @page { size: letter landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e9eef6; font-family: Georgia, 'Times New Roman', 'Songti TC', 'Noto Serif TC', serif; color: #12254a; padding: 16px; }
  .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
  .toolbar button { font: 700 14px -apple-system, 'Segoe UI', Arial, sans-serif; color: #fff; background: #12254a; border: 0; border-radius: 10px; padding: 12px 20px; min-height: 44px; cursor: pointer; }
  .toolbar button:focus-visible { outline: 3px solid #c9a84c; outline-offset: 2px; }
  .cert { max-width: 1000px; aspect-ratio: 11 / 8.5; margin: 0 auto; background: #fffdf7; position: relative; padding: 5.5%; box-shadow: 0 6px 30px rgba(18,37,74,.12); }
  .frame { position: absolute; inset: 2.6%; border: 3px solid #12254a; }
  .frame::after { content: ''; position: absolute; inset: 8px; border: 1px solid #c9a84c; }
  .inner { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }
  .logo { width: 13%; min-width: 64px; height: auto; }
  .eyebrow { font: 700 clamp(10px, 1.4vw, 14px) -apple-system, 'Segoe UI', Arial, sans-serif; letter-spacing: .32em; text-transform: uppercase; color: #a8822e; }
  h1 { font-size: clamp(26px, 5vw, 52px); font-weight: 400; letter-spacing: .02em; margin-top: .2em; }
  .lead { font-size: clamp(13px, 1.7vw, 18px); color: #56647d; font-style: italic; }
  .name { font-size: clamp(30px, 6vw, 64px); line-height: 1.1; border-bottom: 1px solid #c9a84c; padding: 0 .6em .12em; overflow-wrap: anywhere; }
  .level { font-size: clamp(15px, 2.3vw, 24px); }
  .level b { color: #a8822e; font-weight: 700; }
  .foot { width: 100%; padding: 0 6%; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: clamp(10px, 1.3vw, 14px); color: #56647d; }
  .sig { min-width: 32%; text-align: center; }
  .sig div:first-child { font-family: Georgia, serif; font-size: clamp(13px, 1.8vw, 18px); color: #12254a; border-bottom: 1px solid #9aa6ba; padding-bottom: 4px; margin-bottom: 4px; min-height: 1.5em; }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .cert { max-width: none; width: 11in; height: 8.5in; aspect-ratio: auto; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar"><button type="button" id="print">${esc(t('cert.print'))}</button></div>
  <main class="cert">
    <div class="frame" aria-hidden="true"></div>
    <div class="inner">
      <img class="logo" src="/logo.png" alt="Manta Shark Aquatics" width="120" height="120">
      <div>
        <div class="eyebrow">Manta Shark Aquatics</div>
        <h1>${esc(t('cert.title'))}</h1>
      </div>
      <p class="lead">${esc(t('cert.presented'))}</p>
      <div class="name">${esc(c.studentName)}</div>
      <p class="level">${t('cert.body', { n: `<b>${c.toLevel}</b>`, name: `<b>${esc(levelName)}</b>` })}</p>
      <div class="foot">
        <div class="sig"><div>${esc(date)}</div>${esc(t('cert.date'))}</div>
        <div class="sig"><div>${esc(c.coach || 'Manta Shark Aquatics')}</div>${esc(c.coach ? t('cert.coach') : t('cert.school'))}</div>
      </div>
    </div>
  </main>
  <script>${PRINT_JS}</script>
</body>
</html>`
}
