/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto'
import { getT, toLocale, dateTag, type Locale } from './i18n/all'
import { sendEmail } from './email'
import { LEVEL_COLORS } from './levels'

/* Level-up certificates (owner, 2026-10-22, tier 2).

   A certificate is a level_upgrades row that moved a swimmer UP from a level
   they already had (from_level set, to_level higher): the first level from the
   Swim Assessment is a placement, not an achievement, and a correction
   downwards is not one either. Emailed to the family when the promotion is
   approved (setStudentLevel). Not on the family dashboard (owner,
   2026-10-26): the desk prints it from Admin > Certificates and hands it
   to the swimmer, then marks it given.

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

/** Every certificate, newest first, for the desk (owner, 2026-10-26: the
    paper certificate is printed at the desk and handed to the swimmer;
    certificate_given_at says it has been). given is null until then. A
    promotion is a level_upgrades row that moved a swimmer up. */
export async function allCertificates(svc: any): Promise<{ rows: AdminCertificate[]; needsSql: boolean }> {
  let needsSql = false
  const first = await svc.from('level_upgrades')
    .select('id, student_id, from_level, to_level, upgraded_at, certificate_given_at')
    .not('from_level', 'is', null).order('upgraded_at', { ascending: false }).limit(1000)
  let data = first.data
  if (first.error) {
    // docs/migration-certificate-given.sql not run yet: everything reads as not handed over.
    needsSql = true
    ;({ data } = await svc.from('level_upgrades').select('id, student_id, from_level, to_level, upgraded_at')
      .not('from_level', 'is', null).order('upgraded_at', { ascending: false }).limit(1000))
  }
  const ups = (data || []).filter(isPromotion)
  const sids = [...new Set(ups.map((u: any) => u.student_id))]
  const { data: kids } = sids.length
    ? await svc.from('students').select('id, full_name, parent_id').in('id', sids) : { data: [] }
  const pids = [...new Set((kids || []).map((k: any) => k.parent_id).filter(Boolean))]
  const { data: fams } = pids.length
    ? await svc.from('parents').select('id, first_name, last_name').in('id', pids) : { data: [] }
  const kid = new Map((kids || []).map((k: any) => [k.id, k]))
  const fam = new Map((fams || []).map((f: any) => [f.id, f]))
  return {
    needsSql,
    rows: ups.map((u: any) => {
      const k: any = kid.get(u.student_id)
      const f: any = k ? fam.get(k.parent_id) : null
      return {
        id: u.id, studentName: k?.full_name || '', familyName: f ? `${f.first_name || ''} ${f.last_name || ''}`.trim() : '',
        fromLevel: Number(u.from_level), toLevel: Number(u.to_level),
        date: new Date(u.upgraded_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
        given: u.certificate_given_at || null,
      }
    }),
  }
}
export type AdminCertificate = { id: string; studentName: string; familyName: string; fromLevel: number; toLevel: number; date: string; given: string | null }

/** Emails the family their swimmer's certificate. Best effort, never throws. */
export async function sendCertificate(svc: any, upgradeId: string): Promise<void> {
  try {
    const c = await readCertificate(svc, upgradeId)
    if (!c) return
    const { data: p } = await svc.from('parents').select('first_name, email, preferred_language').eq('id', c.parentId).maybeSingle()
    if (!p?.email) return
    await sendEmail({
      type: 'level_certificate', to: p.email, parentName: p.first_name || '', lang: p.preferred_language || undefined,
      studentName: c.studentName, level: c.fromLevel, nextLevel: c.toLevel, linkUrl: `https://www.mantasharkaquatics.net/api/certificates/${c.id}`,
    })
  } catch (e) {
    console.error('certificate email failed for', upgradeId, e instanceof Error ? e.message : '')
  }
}

const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const PRINT_JS = "document.getElementById('print').addEventListener('click',function(){window.print()})"
export const PRINT_JS_HASH = createHash('sha256').update(PRINT_JS).digest('base64')

/** The certificate page (owner, 2026-10-26: design C, "playful"). It
    celebrates the level the swimmer PASSED (fromLevel): a move from 2 to 3
    reads "passed Level 2", in Level 2's colour, with its three stages as
    three stars. Letter landscape; the same page prints at the desk and opens
    from the family's email. No web fonts: the CSP allows none. */
export function certificateHtml(c: Certificate, lang: string | null | undefined): string {
  const L: Locale = toLocale(lang || 'en')
  const t = getT(L)
  const date = new Date(c.date + 'T12:00:00Z').toLocaleDateString(dateTag(L), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const n = c.fromLevel
  const color = LEVEL_COLORS[String(n)] || '#f0c419'
  const levelText = `${t('levels.levelN', { n })} · ${t(`level.${n}.name`)}`
  // Long names step down so they stay on one or two lines.
  const len = [...c.studentName].length
  const nameSize = len > 28 ? 4 : len > 18 ? 5.2 : 6.6
  const petals = Array.from({ length: 12 }, (_, i) =>
    `<circle cx="${(50 + 38 * Math.cos(i * Math.PI / 6)).toFixed(1)}" cy="${(50 + 38 * Math.sin(i * Math.PI / 6)).toFixed(1)}" r="13"/>`).join('')
  const star = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="#f0c419" stroke="#d99a00" stroke-width="1"/></svg>`
  const bubbles = [[2, 10, 5], [3.4, 4, 40], [1.6, 6, 70], [2.6, 94, 12], [1.4, 96, 46], [3, 93, 66], [1.8, 30, 3], [2.2, 62, 2.5], [1.2, 80, 4]]
    .map(([w, l, tp]) => `<i class="bub" style="width:${w}cqw;height:${w}cqw;left:${l}%;top:${tp}%"></i>`).join('')
  return `<!DOCTYPE html>
<html lang="${L}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('cert.pageTitle', { name: c.studentName, n }))}</title>
<style>
  @page { size: letter landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #e9eef6; font-family: -apple-system, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', Arial, sans-serif; color: #12254a; padding: 16px; }
  .toolbar { max-width: 1000px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
  .toolbar button { font: 700 14px -apple-system, 'Segoe UI', Arial, sans-serif; color: #fff; background: #12254a; border: 0; border-radius: 10px; padding: 12px 20px; min-height: 44px; cursor: pointer; }
  .toolbar button:focus-visible { outline: 3px solid #f0c419; outline-offset: 2px; }
  .cert { max-width: 1000px; aspect-ratio: 11 / 8.5; margin: 0 auto; position: relative; overflow: hidden; container-type: inline-size;
    background: linear-gradient(180deg, #bfe3fb 0%, #7cc4f0 55%, #3d93d4 100%); box-shadow: 0 6px 30px rgba(18,37,74,.14); }
  .bub { position: absolute; border-radius: 50%; border: .25cqw solid rgba(255,255,255,.75); background: rgba(255,255,255,.2); }
  .wave { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 22%; }
  .card { position: absolute; inset: 8% 9% 8%; background: #fff; border-radius: 3cqw; box-shadow: 0 1.5cqw 4cqw rgba(18,37,74,.22); text-align: center;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3cqw 5cqw 7cqw; }
  .ribbon { position: absolute; left: 50%; top: -2.6cqw; transform: translateX(-50%); background: #f0c419; color: #3a2600; font-weight: 900; font-size: 2.3cqw;
    padding: 1cqw 4.5cqw; border-radius: 1cqw; box-shadow: 0 .6cqw 0 #b8860b; white-space: nowrap; letter-spacing: .1em; }
  .brand { position: absolute; left: 0; right: 0; top: 4.2cqw; font-weight: 900; letter-spacing: .32em; font-size: 1.25cqw; color: #2050a0; }
  .rosette { width: 13cqw; height: 13cqw; margin-top: 2cqw; }
  .big { font-weight: 900; font-size: 2.6cqw; margin-top: 1.2cqw; color: #2050a0; letter-spacing: .2em; }
  .name { font-family: Georgia, 'Times New Roman', 'Songti TC', 'Noto Serif TC', serif; font-weight: 700; font-size: ${nameSize}cqw; line-height: 1.08; margin-top: .4cqw; overflow-wrap: anywhere; }
  .lvl { font-size: 2.5cqw; font-weight: 900; margin-top: 1.2cqw; }
  .lvl b { color: #e08a00; }
  .stars { display: flex; gap: 1cqw; margin-top: 1.2cqw; }
  .stars svg { width: 2.8cqw; height: 2.8cqw; }
  .foot { position: absolute; left: 5cqw; right: 5cqw; bottom: 2.8cqw; display: flex; justify-content: space-between; align-items: flex-end; font-size: 1.25cqw; color: #56647d; font-weight: 700; }
  .foot div { border-top: .15cqw solid #c9d6ea; padding-top: .6cqw; min-width: 16cqw; text-align: left; }
  .foot div b { display: block; font-size: 1.9cqw; color: #12254a; margin-top: .2cqw; }
  .foot div + div { margin-right: 16cqw; }
  .masc { position: absolute; right: 3.5cqw; bottom: 5.5cqw; width: 15cqw; transform: rotate(-8deg); filter: drop-shadow(0 .8cqw 1cqw rgba(18,37,74,.25)); }
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
    ${bubbles}
    <svg class="wave" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 C 150 0 300 80 450 40 S 750 0 900 40 S 1000 60 1000 60 V100 H0Z" fill="#2b7fc4"/></svg>
    <div class="card">
      <div class="ribbon">${esc(t('cert.title'))}</div>
      <div class="brand">MANTA SHARK AQUATICS</div>
      <svg class="rosette" viewBox="0 0 100 100" role="img" aria-label="${esc(levelText)}"><g fill="${color}">${petals}<circle cx="50" cy="50" r="38"/></g><circle cx="50" cy="50" r="31" fill="#fff8dc"/><circle cx="50" cy="50" r="26" fill="${color}"/><text x="50" y="44" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="8" fill="#fff" letter-spacing="1">${esc(t('cert.badge'))}</text><text x="50" y="70" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="28" fill="#fff" stroke="rgba(0,0,0,.18)" stroke-width="1">${n}</text></svg>
      <div class="big">${esc(t('cert.congrats'))}</div>
      <div class="name">${esc(c.studentName)}</div>
      <div class="lvl">${t('cert.body', { level: `<b>${esc(levelText)}</b>` })}</div>
      <div class="stars">${star}${star}${star}</div>
      <div class="foot">
        <div>${esc(t('cert.date'))}<b>${esc(date)}</b></div>
        <div>${esc(c.coach ? t('cert.coach') : t('cert.school'))}<b>${esc(c.coach || 'Manta Shark Aquatics')}</b></div>
      </div>
    </div>
    <img class="masc" src="/mascot.png" alt="" aria-hidden="true">
  </main>
  <script>${PRINT_JS}</script>
</body>
</html>`
}
