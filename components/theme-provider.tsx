'use client'

import * as React from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: string
  storageKey?: string
}

export function ThemeProvider({ children, defaultTheme = 'dark' }: ThemeProviderProps) {
  // For now, we'll just use dark theme since the app is designed for it
  React.useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return <>{children}</>
}
