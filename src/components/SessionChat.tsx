'use client'

import { useState } from 'react'
import type { SuggestedWorkout, SuggestedExercise } from '@/lib/types'

interface Props {
  workout: SuggestedWorkout
  currentExercise: string
  onClose: () => void
  onAddExercise?: (exercise: SuggestedExercise) => void
}

const QUICK_PROMPTS = [
  "No equipment available",
  "Don't know this exercise",
  "Too heavy for me",
  "Suggest a substitute",
]

/**
 * Heuristic to extract suggested exercise names from AI reply.
 * Only returns names clearly presented as substitutes, excluding the current exercise.
 */
function extractExerciseNames(text: string, currentExercise?: string): string[] {
  const names = new Set<string>()
  const subVerbs = ['try', 'substitute', 'replace', 'use', 'instead of', 'swap with']
  const subPattern = new RegExp(`(?:${subVerbs.join('|')})`, 'i')

  const isNearSubVerb = (matchIndex: number) => {
    const windowSize = 50
    const start = Math.max(0, matchIndex - windowSize)
    const end = Math.min(text.length, matchIndex + windowSize)
    const context = text.slice(start, end)
    return subPattern.test(context)
  }

  // 1. Look for bold text **Exercise Name**
  const boldMatches = Array.from(text.matchAll(/\*\*(.*?)\*\*/g))
  for (const match of boldMatches) {
    const name = match[1].trim()
    if (name.length > 2 && name.length < 40 && !name.includes('\n') && isNearSubVerb(match.index ?? 0)) {
      if (!currentExercise || name.toLowerCase() !== currentExercise.toLowerCase()) {
        names.add(name)
      }
    }
  }

  // 2. Look for quoted text "Exercise Name"
  const quoteMatches = Array.from(text.matchAll(/"(.*?)"/g))
  for (const match of quoteMatches) {
    const name = match[1].trim()
    if (name.length > 2 && name.length < 40 && !name.includes('\n') && isNearSubVerb(match.index ?? 0)) {
      if (!currentExercise || name.toLowerCase() !== currentExercise.toLowerCase()) {
        names.add(name)
      }
    }
  }

  // 3. Look for explicit patterns like "Try [Name]"
  const tryMatches = Array.from(text.matchAll(/(?:Try|try|Substitute with|substitute with) ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g))
  for (const match of tryMatches) {
    const name = match[1].trim()
    if (name.length > 2 && name.length < 40) {
      if (!currentExercise || name.toLowerCase() !== currentExercise.toLowerCase()) {
        names.add(name)
      }
    }
  }

  return Array.from(names)
}

export function SessionChat({ workout, currentExercise, onClose, onAddExercise }: Props) {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMessage(msg?: string) {
    const text = msg ?? message
    if (!text.trim()) return
    setLoading(true)

    try {
      const response = await fetch('/api/session-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todayWorkout: workout,
          exerciseName: currentExercise,
          userMessage: text,
        }),
      })

      if (!response.ok || !response.body) {
        setReply("I'm having trouble connecting. Try a similar movement with the same equipment.")
        return
      }

      // toTextStreamResponse emits plain text tokens — update reply incrementally
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setReply(accumulated)
      }

      if (!accumulated) {
        setReply("I'm having trouble connecting. Try a similar movement with the same equipment.")
      }
    } catch {
      setReply("I'm having trouble connecting. Try a similar movement with the same equipment.")
    } finally {
      setLoading(false)
    }
  }

  const suggestedNames = extractExerciseNames(reply, currentExercise)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end z-50" onClick={onClose}>
      <div
        className="bg-surface-container-low border-t border-white/10 rounded-t-3xl w-full max-w-md mx-auto flex flex-col max-h-[85vh] shadow-[0_-8px_40px_rgba(0,0,0,0.8)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-md pb-0 space-y-md">
          {/* Handle */}
          <div className="flex justify-center -mt-2 mb-xs">
            <div className="w-10 h-1 rounded-full bg-outline-variant" />
          </div>

          {/* Title Area */}
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
        </div>

        <div className="flex-1 overflow-y-auto p-md space-y-md custom-scrollbar">
          {/* AI Reply */}
          {reply && (
            <div className="flex flex-col gap-sm">
              <div className="bg-surface-container border border-primary-container/20 rounded-xl p-sm shadow-[0_0_20px_rgba(195,244,0,0.05)]">
                <div className="flex items-center gap-xs mb-xs">
                  <span className="material-symbols-outlined text-primary-container text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                  <span className="font-label-caps text-label-caps text-primary-container tracking-widest">AI TRAINER</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">{reply}</p>
              </div>

              {/* Add to plan action if substitutes detected */}
              {onAddExercise && suggestedNames.length > 0 && (
                <div className="flex flex-col gap-xs">
                  <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase px-xs">Add suggested exercises:</p>
                  {suggestedNames.map(name => (
                    <button
                      key={name}
                      onClick={() => {
                        onAddExercise({
                          name: name,
                          type: 'strength',
                          sets: 3,
                          reps: 10,
                          muscle_groups: [],
                        })
                      }}
                      className="w-full bg-primary-container/20 border border-primary-container/40 text-primary-container font-label-caps text-[12px] py-2.5 rounded-xl hover:bg-primary-container/30 transition-all flex items-center justify-center gap-xs tracking-widest font-bold"
                    >
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      ADD &quot;{name.toUpperCase()}&quot; TO PLAN
                    </button>
                  ))}
                </div>
              )}
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
        </div>

        <div className="p-md pt-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-xs bg-surface-container-high rounded-xl p-xs border border-white/5">
            <input
              type="text"
              placeholder="Ask anything about this exercise..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-transparent text-on-surface placeholder-on-surface-variant/50 px-sm py-xs outline-none font-body-md text-body-md"
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !message.trim()}
              className="bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container px-sm py-xs rounded-lg font-label-caps text-label-caps disabled:opacity-40 hover:opacity-90 transition-all glow-primary flex items-center justify-center min-w-[44px]"
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
    </div>
  )
}
