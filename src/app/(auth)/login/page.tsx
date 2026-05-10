'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex flex-col min-h-screen px-margin py-xl relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(195, 244, 0, 0.04) 0%, transparent 60%)' }} />

      <div className="flex-1 flex flex-col justify-center">
        {/* Brand */}
        <div className="mb-xl text-center">
          <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider mb-xs">
            Elite Athlete
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Your personal AI trainer
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-md">
          <div className="space-y-xs">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase block">
              Email
            </label>
            <input
              type="email"
              placeholder="athlete@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container-high text-on-surface placeholder-on-surface-variant/50 rounded-lg px-sm py-sm border-b-2 border-outline-variant focus:border-primary-container outline-none transition-colors font-body-md text-body-md"
            />
          </div>

          <div className="space-y-xs">
            <label className="font-label-caps text-label-caps text-on-surface-variant uppercase block">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container-high text-on-surface placeholder-on-surface-variant/50 rounded-lg px-sm py-sm border-b-2 border-outline-variant focus:border-primary-container outline-none transition-colors font-body-md text-body-md"
            />
          </div>

          {error && (
            <p className="text-error text-sm font-body-md">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container font-label-caps text-label-caps py-sm rounded-xl uppercase tracking-wider glow-primary hover:opacity-90 disabled:opacity-50 transition-all mt-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-lg text-center font-body-md text-body-md text-on-surface-variant">
          New athlete?{' '}
          <Link href="/signup" className="text-primary-container hover:opacity-80 transition-opacity font-semibold">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  )
}
