import { createHash } from 'node:crypto'
import forge from 'node-forge'
import { zipSync } from 'fflate'
import { PASS_IMAGES } from '@/lib/wallet-pass-images'

/* The check-in QR as an Apple Wallet card (owner, 2026-11-17: Apple only).
   One card per swimmer, with the same code the 報到 sheet shows
   (app/(public)/dashboard/CheckinQr.tsx: MSA:<base64 of the swimmer id>),
   so the desk scans it the same way. No address on it (owner).

   A .pkpass is a zip of pass.json, the pictures, manifest.json (the SHA-1
   of each file) and signature: a detached PKCS #7 signature of the
   manifest, made with the school's Pass Type ID certificate and its key,
   with Apple's WWDR G4 certificate in the chain.

   The certificate and key come from the owner (Apple Developer › Pass Type
   IDs › pass.com.mantasharkaquatics.checkin), set in Vercel only, as base64
   of the PEM files: PASS_CERT_PEM_BASE64 and PASS_KEY_PEM_BASE64. Without
   them there is no card (walletReady() false, the button stays hidden). */

export const PASS_TYPE_ID = 'pass.com.mantasharkaquatics.checkin'
export const TEAM_ID = '86478NTHW4'

/** Apple Worldwide Developer Relations G4, the public intermediate that
 *  issues Pass Type ID certificates (valid to 2030-12-10; SHA-256
 *  EA:47:57:88:55:38:DD:8C:B5:9F:F4:55:6F:67:60:87:D8:3C:85:E7:09:02:C1:22:E4:2C:08:08:B5:BC:E1:4C). */
const WWDR_G4 = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
BQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsT
HUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBS
b290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UE
Aww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNh
dGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMu
MQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAf
eKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjo
v9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41t
QSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB
5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVl
PNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64D
YyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8G
A1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0
BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJv
b3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290
LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQD
AgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbD
eeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWv
p50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPef
x4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJ
EtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQ
A1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgp
pU8RBWk6z/Kf
-----END CERTIFICATE-----`

const pem = (name: string) => {
  const v = (process.env[name] || '').trim()
  if (!v) return ''
  // Pasted either as base64 of the file or as the file itself.
  return v.includes('-----BEGIN') ? v : Buffer.from(v, 'base64').toString('utf8')
}

/** Are the school's certificate and key set? */
export const walletReady = () => !!pem('PASS_CERT_PEM_BASE64') && !!pem('PASS_KEY_PEM_BASE64')

/** Whether the certificate and key set in Vercel make a card iOS will
 *  take -- told without showing either: for the ?ready=1 answer. */
export function walletCheck(): { ready: boolean; problem?: string; expires?: string } {
  if (!walletReady()) return { ready: false, problem: 'not set' }
  try {
    const cert = forge.pki.certificateFromPem(pem('PASS_CERT_PEM_BASE64'))
    const key = forge.pki.privateKeyFromPem(pem('PASS_KEY_PEM_BASE64')) as forge.pki.rsa.PrivateKey
    const pub = cert.publicKey as forge.pki.rsa.PublicKey
    if (pub.n.compareTo(key.n) !== 0) return { ready: false, problem: 'key does not match certificate' }
    const uid = cert.subject.getField({ type: '0.9.2342.19200300.100.1.1' })?.value
    if (uid !== PASS_TYPE_ID) return { ready: false, problem: 'certificate is for ' + String(uid || 'something else') }
    let byApple = false
    try { byApple = forge.pki.certificateFromPem(WWDR_G4).verify(cert) } catch { /* another issuer: forge throws */ }
    if (!byApple) return { ready: false, problem: 'not issued by Apple WWDR G4' }
    const expires = cert.validity.notAfter.toISOString().slice(0, 10)
    if (cert.validity.notAfter.getTime() < Date.now()) return { ready: false, problem: 'certificate expired', expires }
    return { ready: true, expires }
  } catch (e) {
    return { ready: false, problem: 'unreadable: ' + (e instanceof Error ? e.message : String(e)).slice(0, 80) }
  }
}

/** The code on the card: what the 報到 sheet's QR says. */
export const checkinCode = (studentId: string) => 'MSA:' + Buffer.from(studentId, 'utf8').toString('base64')

export type PassText = { card: string; student: string; school: string; how: string; help: string; description: string }

function signManifest(manifest: Buffer): Buffer {
  const cert = forge.pki.certificateFromPem(pem('PASS_CERT_PEM_BASE64'))
  const key = forge.pki.privateKeyFromPem(pem('PASS_KEY_PEM_BASE64'))
  const wwdr = forge.pki.certificateFromPem(WWDR_G4)
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifest.toString('binary'))
  p7.addCertificate(cert)
  p7.addCertificate(wwdr)
  p7.addSigner({
    key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  })
  p7.sign({ detached: true })
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
}

/** The picture sizes the phone sends (lib/wallet-art.ts). */
export const ART = { w: 716, h: 896 }, THUMB = 180

/** A PNG of exactly this size, small enough, or null. Read from the file's
 *  own header: the phone sends it, so nothing else about it is trusted. */
export function checkedPng(b64: unknown, w: number, h: number): Buffer | null {
  if (typeof b64 !== 'string' || b64.length > 3_000_000) return null
  const buf = Buffer.from(b64, 'base64')
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length < 33 || sig.some((v, i) => buf[i] !== v) || buf.toString('latin1', 12, 16) !== 'IHDR') return null
  return buf.readUInt32BE(16) === w && buf.readUInt32BE(20) === h ? buf : null
}

/** The .pkpass for one swimmer (owner, 2026-11-17, 樣式 4「我的游泳小人」).
    iOS 27 and later show the poster card: the swimmer the family dressed,
    standing in its pool, across the whole card, with the name in bold and
    the QR alone on Wallet's frosted strip (no footer). Always in English
    (owner, 2026-11-17), whatever language the family reads. Older iPhones show the plain card
    (generic): the same sky colour, the name and a square of the swimmer.
    Both come from one pass.json (posterGeneric beside generic). The
    pictures come from the phone (art, thumb); without them, the swimmer in
    a swim cap the school drew (PASS_IMAGES artwork-default). */
export function buildCheckinPass(student: { id: string; full_name: string }, text: PassText,
  pics?: { art: Buffer; thumb: Buffer } | null): Buffer {
  const code = checkinCode(student.id)
  const name = student.full_name
  const header = [{ key: 'card', label: 'MANTA SHARK', value: text.card }]
  const back = [{ key: 'how', label: text.how, value: text.help }]
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    // v2: the poster card. A new number, so the first (navy) card is not
    // mistaken for it; the family removes that one themselves.
    serialNumber: 'checkin-v2-' + student.id,
    organizationName: 'Manta Shark Aquatics',
    description: text.description,
    logoText: 'Manta Shark',
    backgroundColor: 'rgb(217, 238, 252)',
    foregroundColor: 'rgb(18, 37, 74)',
    labelColor: 'rgb(32, 80, 160)',
    sharingProhibited: true,
    barcodes: [{ format: 'PKBarcodeFormatQR', message: code, messageEncoding: 'iso-8859-1', altText: name }],
    barcode: { format: 'PKBarcodeFormatQR', message: code, messageEncoding: 'iso-8859-1', altText: name },
    posterGeneric: {
      headerFields: header,
      // No label: Wallet writes the name as the card's bold title.
      primaryFields: [{ key: 'student', value: name }],
      // No footer (owner, 2026-11-17): the QR alone on the strip.
      backFields: back,
    },
    generic: {
      headerFields: header,
      primaryFields: [{ key: 'student', label: text.student, value: name }],
      secondaryFields: [{ key: 'school', label: text.school, value: 'Manta Shark Aquatics' }],
      backFields: back,
    },
  }
  const img = (k: string) => Buffer.from(PASS_IMAGES[k], 'base64')
  const art = pics?.art ?? img('artwork-default')
  const thumb = pics?.thumb ?? img('thumbnail-default')
  const files: Record<string, Buffer> = {
    'pass.json': Buffer.from(JSON.stringify(pass), 'utf8'),
    'icon.png': img('icon.png'), 'icon@2x.png': img('icon@2x.png'), 'icon@3x.png': img('icon@3x.png'),
    'logo.png': img('logo.png'), 'logo@2x.png': img('logo@2x.png'), 'logo@3x.png': img('logo@3x.png'),
    'primaryLogo.png': img('logo.png'), 'primaryLogo@2x.png': img('logo@2x.png'), 'primaryLogo@3x.png': img('logo@3x.png'),
    // The picture is 2x (716 x 896 for 358 x 448 points); Wallet scales it.
    'artwork.png': art, 'artwork@2x.png': art,
    'thumbnail.png': thumb, 'thumbnail@2x.png': thumb,
  }
  const manifest: Record<string, string> = {}
  for (const [n, buf] of Object.entries(files)) manifest[n] = createHash('sha1').update(buf).digest('hex')
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8')
  files['manifest.json'] = manifestBuf
  files['signature'] = signManifest(manifestBuf)
  const zip: Record<string, Uint8Array> = {}
  for (const [n, buf] of Object.entries(files)) zip[n] = new Uint8Array(buf)
  return Buffer.from(zipSync(zip, { level: 6 }))
}
