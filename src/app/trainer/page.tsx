'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInDays, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { TrainerChatThread } from '@/components/TrainerChatThread'
import { BottomNav } from '@/components/BottomNav'
import type { TrainerMessage, TrainingProgram } from '@/lib/types'

export default function TrainerPage() {
  const [history, setHistory] = useState<TrainerMessage[]>([])
  const [program, setProgram] = useState<TrainingProgram | null>(null)
  const [activeWeek, setActiveWeek] = useState<{ status: string; updated_at: string | null } | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Mark all unread trainer messages as read
      await supabase
        .from('trainer_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null)

      // Fetch messages
      const { data: messages } = await supabase
        .from('trainer_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50)
      setHistory(messages ?? [])

      // Fetch active program
      const { data: activeProgram } = await supabase
        .from('training_programs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setProgram(activeProgram ?? null)

      // Fetch active/reviewing week
      const { data: week } = await supabase
        .from('program_weeks')
        .select('status, updated_at')
        .eq('user_id', user.id)
        .in('status', ['active', 'reviewing'])
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActiveWeek(week ?? null)

      setLoading(false)
    }

    load()
  }, [supabase])

  async function reloadHistory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: messages } = await supabase
      .from('trainer_messages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50)
    setHistory(messages ?? [])
  }

  async function sendMessage() {
    const msg = input.trim()
    if (!msg || isStreaming) return

    setInput('')
    setIsStreaming(true)
    setStreamContent('')

    // Optimistically append user message
    const tempUserMsg: TrainerMessage = {
      id: `temp-${Date.now()}`,
      user_id: userId,
      role: 'user',
      content: msg,
      message_type: 'chat',
      metadata: null,
      read_at: null,
      created_at: new Date().toISOString(),
    }
    setHistory(prev => [...prev, tempUserMsg])

    try {
      const response = await fetch('/api/trainer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })

      if (!response.ok || !response.body) {
        setIsStreaming(false)
        const errorMsg: TrainerMessage = {
          id: `error-${Date.now()}`,
          user_id: '',
          role: 'trainer',
          content: 'Sorry, I ran into an error. Please try again.',
          message_type: 'chat',
          metadata: null,
          read_at: null,
          created_at: new Date().toISOString(),
        }
        setHistory(prev => [...prev, errorMsg])
        return
      }

      // Read response body as stream (toTextStreamResponse emits plain text tokens)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreamContent(accumulated)
      }

      // Reload history from DB
      await reloadHistory()
    } finally {
      setIsStreaming(false)
      setStreamContent('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Derive active phase
  const weekNum = program
    ? Math.max(1, Math.min(
        Math.ceil((differenceInDays(new Date(), parseISO(program.start_date)) + 1) / 7),
        program.duration_weeks
      ))
    : 1
  const activePhase = program
    ? program.phases.find(p => {
        const [min, max] = p.week_range
        return weekNum >= min && weekNum <= max
      }) ?? program.phases[0]
    : null

  return (
    <div className="flex flex-col min-h-screen">
      {/* Fixed header */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-margin h-14">
          <div className="flex items-center gap-xs">
            <h1 className="font-headline-lg text-[20px] text-on-surface uppercase tracking-wider font-bold">Trainer</h1>
            <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
          </div>
          <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase">AI Coach</p>
        </div>
      </header>

      <main className="pt-[72px] pb-[160px] px-margin flex flex-col gap-md">
        {/* Program summary card */}
        {program && activePhase && (
          <div className="bg-surface-container border border-white/[0.06] rounded-2xl p-md">
            <p className="font-label-caps text-[9px] text-primary-container/60 tracking-widest uppercase mb-xs">
              Active Program
            </p>
            <p className="font-body-md text-[15px] text-on-surface font-semibold capitalize">
              {program.goal.replace(/_/g, ' ')} · {program.duration_weeks}wk
            </p>
            <p className="font-body-md text-[13px] text-on-surface-variant mt-[2px]">
              {activePhase.name} · {activePhase.focus}
            </p>
          </div>
        )}

        {/* No program card */}
        {!program && !loading && (
          <div className="bg-surface-container border border-white/[0.06] rounded-2xl p-md">
            <p className="font-label-caps text-[9px] text-on-surface-variant/50 tracking-widest uppercase mb-xs">
              No Program
            </p>
            <p className="font-body-md text-[14px] text-on-surface-variant">
              {"You don't have an active training program yet. Head to Profile → Change Program to get started with a personalized plan."}
            </p>
          </div>
        )}

        {/* Amendment J — reviewing banner */}
        {activeWeek?.status === 'reviewing' && (() => {
          const isStale = activeWeek.updated_at
            ? Date.now() - new Date(activeWeek.updated_at).getTime() > 10 * 60 * 1000
            : false
          return isStale ? (
            <div className="bg-surface-container-high rounded-xl p-sm flex items-center justify-between gap-sm">
              <p className="text-sm text-on-surface-variant">Review didn't finish.</p>
              <button
                onClick={async () => {
                  await fetch('/api/trainer/review-week/reset', { method: 'PATCH' })
                  router.refresh()
                }}
                className="text-xs text-primary-container font-semibold"
              >
                Retry Review
              </button>
            </div>
          ) : (
            <div className="bg-surface-container-high rounded-xl p-sm flex items-center gap-sm">
              <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              <p className="text-sm text-on-surface-variant">Your trainer is reviewing last week…</p>
            </div>
          )
        })()}

        {/* Chat thread */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30 animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>
              psychology
            </span>
          </div>
        ) : (
          <TrainerChatThread
            history={history}
            isStreaming={isStreaming}
            streamContent={streamContent}
          />
        )}
      </main>

      {/* Pinned input bar */}
      <div className="fixed bottom-[64px] left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-surface/80 backdrop-blur-xl border-t border-white/[0.06] px-margin py-xs">
        <div className="flex items-end gap-xs bg-surface-container border border-white/[0.08] rounded-2xl px-sm py-xs">
          {/* fieldSizing is not yet in @types/react CSSProperties */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your trainer…"
            rows={1}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            className="flex-1 bg-transparent text-on-surface placeholder-on-surface-variant/40 font-body-md text-[14px] resize-none outline-none min-h-[24px] max-h-[120px] py-[2px]"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              send
            </span>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
