'use client'

import { useT } from '@/lib/i18n/provider'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import AppInfoPage from '@/components/brand/AppInfoPage'
import PushSettings from '@/components/PushSettings'

/* 我的 › 通知設定 (owner, 2026-11-03): the push switches, which used to sit
   on 我的 itself, on a page of their own now that 我的 is one screen.
   They exist only inside the app (PushSettings draws nothing elsewhere). */
export default function NotificationsPage() {
  const t = useT()
  return (
    <AppInfoPage title={t('push.settings.title')}>
      <style>{ACCT_CSS + '.ai .ac-card > .ac-label:first-child { display: none; }'}</style>
      <PushSettings />
    </AppInfoPage>
  )
}
