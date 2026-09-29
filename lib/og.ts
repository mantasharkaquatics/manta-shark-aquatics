// Link-preview images: what a pasted link shows in Messages, LINE, WhatsApp
// and the like. Without them the card was the page title and the framework's
// default triangle icon. The files are in public/og/.
//
// 1200x480, flatter than the usual 1.91:1, on purpose: Messages draws the
// picture across the whole bubble, and at 630 tall the card filled most of a
// phone screen. Most families share by text message (owner, 2026-09-29).
// LINE crops its thumbnail from the middle; accepted, not designed for.
// Bump ?v= when a picture changes: link previews cache images by URL.
export const SITE_OG_IMAGE = { url: '/og/default.png?v=2', width: 1200, height: 480, alt: 'Manta Shark Aquatics' }

// The referral card says "朋友邀請您 · 兩家各得 40 點". The 40 is baked into
// the picture: if REFERRAL_POINTS in lib/points.ts changes, redraw it.
export const REFERRAL_OG_IMAGE = { url: '/og/referral.png?v=2', width: 1200, height: 480, alt: 'Manta Shark Aquatics' }
