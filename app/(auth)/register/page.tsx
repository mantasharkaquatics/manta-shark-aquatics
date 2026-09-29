import type { Metadata } from 'next'
import RegisterClient from './RegisterClient'
import { REFERRAL_OG_IMAGE } from '@/lib/og'
import { REFERRAL_POINTS } from '@/lib/points'

// The page itself is a client component; this wrapper exists so a shared
// referral link (/register?ref=CODE) can carry its own link preview.
//
// Owner's call, 2026-09-29: the preview says a friend invited you, WITHOUT the
// inviting family's name, and pairs the English school name in the picture
// with a Chinese invitation.
// One line in a Messages bubble; the school's name is already in the picture.
const REF_TITLE = '朋友邀請您一起來學游泳'
const REF_DESCRIPTION = `用朋友的連結註冊，上完第一堂課後兩家各得 ${REFERRAL_POINTS} 點。`

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
): Promise<Metadata> {
  const { ref } = await searchParams
  if (!ref) return {}
  // openGraph merges shallowly: this object replaces the site's, so it has
  // to name everything, not only what differs.
  return {
    title: REF_TITLE,
    description: REF_DESCRIPTION,
    openGraph: {
      type: 'website', siteName: 'Manta Shark Aquatics',
      title: REF_TITLE, description: REF_DESCRIPTION, images: [REFERRAL_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title: REF_TITLE, description: REF_DESCRIPTION, images: [REFERRAL_OG_IMAGE.url] },
  }
}

export default function RegisterPage() {
  return <RegisterClient />
}
