// Link-preview images: what a pasted link shows in Messages, LINE, WhatsApp
// and the like. Without them the card was the page title and the framework's
// default triangle icon. The files are in public/og/.
export const SITE_OG_IMAGE = { url: '/og/default.png', width: 1200, height: 630, alt: 'Manta Shark Aquatics' }

// The referral card says "朋友邀請您 · 兩家各得 40 點". The 40 is baked into
// the picture: if REFERRAL_POINTS in lib/points.ts changes, redraw it.
export const REFERRAL_OG_IMAGE = { url: '/og/referral.png', width: 1200, height: 630, alt: 'Manta Shark Aquatics' }
