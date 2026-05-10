import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Elite Athlete — AI Gym Trainer',
  description: 'Your personal AI-powered gym trainer',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-on-surface font-body antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen">
        <main className="max-w-md mx-auto min-h-screen relative">
          {children}
        </main>
      </body>
    </html>
  )
}
