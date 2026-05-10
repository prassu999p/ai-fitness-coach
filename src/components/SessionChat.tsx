'use client'

import { useState } from 'react'
import type { SuggestedWorkout } from '@/lib/types'

interface Props {
  workout: SuggestedWorkout
  currentExercise: string
  onClose: () => void
}

const QUICK_PROMPTS = [
  "No equipment available",
  "Don't know this exercise",
  "Too heavy for me",
  "Suggest a substitute",
]

export function SessionChat({ workout, currentExercise, onClose }: Props) {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMessage(msg?: string) {
    const text = msg ?? message
    if (!text.trim()) return
    setLoading(true)

    try {
      const res = await fetch('/api/session-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todayWorkout: workout,
          exerciseName: currentExercise,
          userMessage: text,
        }),
      })
      const data = await res.json()
      setReply(data.reply)
    } catch {
      setReply("I'm having trouble connecting. Try a similar movement with the same equipment.")
    } finally {
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end z-50" onClick={onClose}>
      {/* Bottom Sheet */}
      <div
        className="bg-surface-container-low border-t border-white/10 rounded-t-3xl w-full max-w-md mx-auto p-md space-y-md shadow-[0_-8px_40px_rgba(0,0,0,0.8)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center -mt-2 mb-xs">
          <div className="w-10 h-1 rounded-full bg-outline-variant" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-headline-md text-headline-md text-primary uppercase">Ask Trainer</h3>
            <p className="font-label-caps text-label-caps text-primary-container tracking-widest mt-base">
              {currentExercise.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* AI Reply */}
        {reply && (
          <div className="bg-surface-container border border-primary-container/20 rounded-xl p-sm shadow-[0_0_20px_rgba(195,244,0,0.05)]">
            <div className="flex items-center gap-xs mb-xs">
              <span className="material-symbols-outlined text-primary-container text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              <span className="font-label-caps text-label-caps text-primary-container tracking-widest">AI TRAINER</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface">{reply}</p>
          </div>
        )}

        {/* Quick prompts */}
        <div className="flex flex-wrap gap-xs">
          {QUICK_PROMPTS.map(q => (
            <button
              key={q}
              onClick={() => { setMessage(q); sendMessage(q) }}
              disabled={loading}
              className="text-xs bg-surface-container-high hover:bg-surface-container border border-outline-variant hover:border-primary-container/50 rounded-full px-sm py-xs text-on-surface-variant hover:text-primary transition-all font-label-caps"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-xs">
          <input
            type="text"
            placeholder="Ask anything about this exercise..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-surface-container-high text-on-surface placeholder-on-surface-variant/50 rounded-xl px-sm py-xs border-b-2 border-outline-variant focus:border-primary-container outline-none font-body-md text-body-md"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !message.trim()}
            className="bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container px-sm py-xs rounded-xl font-label-caps text-label-caps disabled:opacity-40 hover:opacity-90 transition-all glow-primary"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">send</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
