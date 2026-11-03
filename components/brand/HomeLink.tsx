'use client'
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { appLook } from '@/lib/native-app'

const noSubscribe = () => () => {}

/* The name and logo on the sign-in pages go to the website's home page --
   in a browser. Inside the app they are not links (owner, 2026-11-03: the
   website is not part of the app, and its home page left customers stuck);
   the sign-in page is where the app starts. */
export default function HomeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const app = useSyncExternalStore(noSubscribe, appLook, () => false)
  if (app) return <span className={className}>{children}</span>
  return <Link href={href} className={className}>{children}</Link>
}
