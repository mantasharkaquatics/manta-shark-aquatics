import AuthBar from '@/components/brand/AuthBar'

// Sign-in and sign-up (both steps): the site's floating bar with just the name,
// so there is always a visible way back to the home page.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthBar />
      {children}
    </>
  )
}
