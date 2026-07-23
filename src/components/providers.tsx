'use client'

import { AuthProvider } from '@/lib/auth'
import { I18nProvider } from '@/lib/i18n'
import { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </I18nProvider>
  )
}
