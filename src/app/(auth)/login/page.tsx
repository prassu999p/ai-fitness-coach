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
    <div className="flex flex-col min-h-screen px-margin relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 20%, rgba(195, 244, 0, 0.04) 0%, transparent 60%)' }} />

      <div className="flex-1 flex flex-col justify-center relative">
        {/* Brand */}
        <div className="mb-xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center mx-auto mb-md">
            <span className="material-symbols-outlined text-primary-container text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          </div>
          <h1 className="font-headline-lg text-[28px] text-on-surface uppercase tracking-wider mb-xs font-bold">
            Elite Athlete
          </h1>
          <p className="font-body-md text-[15px] text-on-surface-variant">
            Your personal AI trainer
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label className="font-label-caps text-[11px] text-on-surface-variant/70 uppercase tracking-widest block">
              Email
            </label>
            <input
              type="email"
              placeholder="athlete@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-surface-container text-on-surface placeholder-on-surface-variant/30 rounded-xl px-sm py-sm border border-white/[0.08] focus:border-primary-container/50 outline-none transition-colors font-body-md text-[15px]"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="font-label-caps text-[11px] text-on-surface-variant/70 uppercase tracking-widest block">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container text-on-surface placeholder-on-surface-variant/30 rounded-xl px-sm py-sm border border-white/[0.08] focus:border-primary-container/50 outline-none transition-colors font-body-md text-[15px]"
            />
          </div>

          {error && (
            <div className="bg-error-container/10 border border-error/20 rounded-xl px-sm py-xs">
              <p className="text-error text-[14px] font-body-md">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container text-on-primary-container font-label-caps text-[14px] py-3.5 rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all mt-xs font-bold"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-lg text-center font-body-md text-[14px] text-on-surface-variant">
          New athlete?{' '}
          <Link href="/signup" className="text-primary-container hover:opacity-80 transition-opacity font-semibold">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  )
}
