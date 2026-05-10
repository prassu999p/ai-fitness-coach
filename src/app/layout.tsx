import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Gym Trainer',
  description: 'Your personal AI-powered fitness coach',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
