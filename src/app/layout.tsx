import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PHProvider } from './providers'

export const metadata: Metadata = {
  title: 'Elite Athlete — AI Gym Trainer',
  description: 'Your personal AI-powered gym trainer',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="bg-background text-on-surface font-body antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen">
        <PHProvider>
          <main className="max-w-md mx-auto min-h-screen relative">
            {children}
          </main>
        </PHProvider>
      </body>
    </html>
  )
}
