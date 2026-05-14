'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PrimaryGoal, PlanPreview } from '@/lib/types'
import { PlanPreviewCard } from '@/components/PlanPreviewCard'

const GOALS: Array<{ value: PrimaryGoal; label: string; description: string; icon: string }> = [
  { value: 'hypertrophy', label: 'Hypertrophy', description: 'Build muscle size through volume-focused training.', icon: 'fitness_center' },
  { value: 'strength', label: 'Strength', description: 'Increase your 1RM on core lifts through progressive overload.', icon: 'exercise' },
  { value: 'fat_loss', label: 'Fat Loss', description: 'Preserve muscle while creating a caloric deficit through training.', icon: 'local_fire_department' },
  { value: 'endurance', label: 'Endurance', description: 'Improve cardiovascular capacity and muscular stamina.', icon: 'directions_run' },
  { value: 'general_fitness', label: 'General Fitness', description: 'Balanced all-round fitness — strength, cardio, and mobility.', icon: 'star' },
]

const DURATIONS: Array<{ weeks: number; label: string; sublabel: string }> = [
  { weeks: 4, label: '1 Month', sublabel: '4 weeks' },
  { weeks: 8, label: '2 Months', sublabel: '8 weeks' },
  { weeks: 12, label: '3 Months', sublabel: '12 weeks' },
]

const GOAL_DURATION_NOTES: Record<PrimaryGoal, string> = {
  hypertrophy: '8–12 weeks allows full hypertrophy phases (accumulation → intensification → peak).',
  strength: '12 weeks is optimal for strength peaking — allows a proper base and taper.',
  fat_loss: '4–8 weeks keeps intensity high enough to preserve muscle during a deficit.',
  endurance: '8–12 weeks builds aerobic base progressively without overtraining.',
  general_fitness: '4–8 weeks works well — enough time to see real progress across all qualities.',
}

type Step = 1 | 2 | 3 | 4

function GoalsContent() {
  const [step, setStep] = useState<Step>(1)
  const [goal, setGoal] = useState<PrimaryGoal>('hypertrophy')
  const [durationWeeks, setDurationWeeks] = useState(8)
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<PlanPreview | null>(null)
  const [draftProgram, setDraftProgram] = useState<object | null>(null)
  const [revisionFeedback, setRevisionFeedback] = useState('')
  const [revisionCount, setRevisionCount] = useState(0)
  const [revising, setRevising] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [pollActive, setPollActive] = useState(false)
  const pendingOpRef = useRef<'generate' | 'revise'>('generate')
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawReturnTo = searchParams.get('returnTo')
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
    ? rawReturnTo
    : '/dashboard'

  const progressSegments = [step >= 1, step >= 2, step >= 3, step >= 4]

  useEffect(() => {
    if (!pollActive || !draftId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/trainer/generate-program?draftId=${draftId}`)
        if (!res.ok) return
        const data = await res.json() as {
          status: string
          preview: PlanPreview | null
          draftProgram: object | null
          errorMessage: string | null
        }

        if (data.status === 'ready' && data.preview && data.draftProgram) {
          setPollActive(false)
          setDraftId(null)
          setPreview(data.preview)
          setDraftProgram(data.draftProgram)
          if (pendingOpRef.current === 'revise') {
            setRevising(false)
            setRevisionFeedback('')
            setRevisionCount(c => c + 1)
          } else {
            setGenerating(false)
            setStep(3)
          }
        } else if (data.status === 'error') {
          setPollActive(false)
          setDraftId(null)
          setGenerating(false)
          setRevising(false)
          setError(data.errorMessage ?? 'Generation failed. Please try again.')
        }
      } catch {
        // silently retry on network errors
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [pollActive, draftId])

  async function startGeneration(action: 'generate' | 'revise') {
    setError(null)
    if (action === 'generate') {
      setGenerating(true)
    } else {
      setRevising(true)
    }

    try {
      const res = await fetch('/api/trainer/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          goal,
          durationWeeks,
          feedback: action === 'revise' ? revisionFeedback : undefined,
          draftProgram: action === 'revise' ? draftProgram : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Unknown error')
      }
      const data = await res.json() as { draftId: string; status: string }
      pendingOpRef.current = action
      setDraftId(data.draftId)
      setPollActive(true)
    } catch (e) {
      setGenerating(false)
      setRevising(false)
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    }
  }

  async function handleConfirm() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', draftProgram }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Unknown error')
      }
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-white/[0.06] fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
        <div className="flex items-center justify-between px-margin h-14">
          {step > 1 && step < 4 && !generating && !revising ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="text-on-surface-variant hover:text-primary-container transition-colors p-1 -ml-1"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
          ) : <div className="w-8" />}
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">
            Elite Athlete
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col">
        <div className="flex gap-xs mb-lg mt-sm">
          {progressSegments.map((active, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${active ? 'bg-primary-container' : 'bg-surface-container-high'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 1 of 4</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Your Goal</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                Your trainer will build the entire program around this.
              </p>
            </div>
            <div className="flex flex-col gap-xs flex-grow">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                    goal === g.value
                      ? 'border-primary-container/40 bg-surface-container'
                      : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex-1">
                    <h3 className="font-headline-md text-[18px] text-on-surface uppercase mb-[2px]">{g.label}</h3>
                    <p className="font-body-md text-[14px] text-on-surface-variant">{g.description}</p>
                  </div>
                  <span className={`material-symbols-outlined text-[28px] ml-sm transition-colors ${goal === g.value ? 'text-primary-container' : 'text-on-surface-variant/30'}`}>
                    {g.icon}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 2 of 4</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Duration</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                How long is this training block?
              </p>
            </div>
            <div className="flex flex-col gap-sm mb-md">
              {DURATIONS.map(d => (
                <button
                  key={d.weeks}
                  onClick={() => setDurationWeeks(d.weeks)}
                  disabled={generating}
                  className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                    durationWeeks === d.weeks
                      ? 'border-primary-container/40 bg-surface-container'
                      : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                  }`}
                >
                  <div>
                    <h3 className="font-headline-md text-[20px] text-on-surface uppercase">{d.label}</h3>
                    <p className="font-body-md text-[13px] text-on-surface-variant">{d.sublabel}</p>
                  </div>
                  <span className={`material-symbols-outlined text-[24px] transition-colors ${durationWeeks === d.weeks ? 'text-primary-container' : 'text-on-surface-variant/30'}`}>
                    {durationWeeks === d.weeks ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                </button>
              ))}
            </div>
            {!generating && (
              <div className="bg-surface-container-high border border-white/[0.06] rounded-xl p-sm">
                <p className="font-body-md text-[13px] text-on-surface-variant">
                  <span className="text-primary-container font-semibold">Trainer note: </span>
                  {GOAL_DURATION_NOTES[goal]}
                </p>
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center gap-md py-lg mt-lg flex-grow justify-center">
                <div className="w-16 h-16 rounded-2xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary-container text-[32px] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                </div>
                <div className="text-center">
                  <p className="font-body-md text-[15px] text-on-surface font-semibold">
                    {"Your trainer is designing your program…"}
                  </p>
                  <p className="font-body-md text-[13px] text-on-surface-variant mt-xs">
                    {"This takes 30–60 seconds. You can leave this screen — we'll let you know when it's ready."}
                  </p>
                </div>
                <div className="flex gap-xs mt-xs">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary-container/60 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-error/10 border border-error/30 rounded-xl p-sm mt-md">
                <p className="font-body-md text-[13px] text-error">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && preview && (
          <div className="flex flex-col flex-grow">
            <div className="mb-md">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 3 of 4</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Review Your Plan</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                Your AI trainer designed this program for you.
              </p>
            </div>

            <PlanPreviewCard preview={preview} />

            {revisionCount < 3 && (
              <div className="flex flex-col gap-xs mt-md">
                <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase tracking-widest">
                  Request changes ({3 - revisionCount} remaining)
                </p>
                <textarea
                  value={revisionFeedback}
                  onChange={e => setRevisionFeedback(e.target.value)}
                  placeholder="e.g. Add more upper body, remove deadlifts, focus on dumbbells only..."
                  rows={3}
                  className="w-full bg-surface-container-high text-on-surface text-[14px] font-body-md rounded-xl border border-white/[0.08] p-sm resize-none focus:border-primary-container/50 outline-none transition-colors placeholder:text-on-surface-variant/40"
                />
              </div>
            )}

            {revising && (
              <div className="flex items-center gap-sm mt-md py-sm">
                <span className="material-symbols-outlined text-primary-container text-[20px] animate-pulse">psychology</span>
                <p className="font-body-md text-[14px] text-on-surface-variant">{"Revising your program…"}</p>
              </div>
            )}

            {error && (
              <div className="bg-error/10 border border-error/30 rounded-xl p-sm mt-md">
                <p className="font-body-md text-[13px] text-error">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col flex-grow items-center justify-center gap-lg">
            <div className="w-20 h-20 rounded-2xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <div className="text-center">
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase mb-xs">{"Your Program Is Ready!"}</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant">
                {`Your trainer has set up your ${durationWeeks}-week ${GOALS.find(g => g.value === goal)?.label.toLowerCase()} program.`}
              </p>
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface/90 backdrop-blur-md p-margin border-t border-white/[0.06] z-40">
        <div className="flex justify-between items-center">
          {step > 1 && step < 4 && !generating && !revising ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="font-label-caps text-[12px] text-on-surface-variant hover:text-primary-container py-xs px-sm uppercase transition-colors tracking-wider"
            >
              Back
            </button>
          ) : <div />}

          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-xs font-bold"
            >
              Next
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          )}

          {step === 2 && (
            <button
              onClick={() => startGeneration('generate')}
              disabled={generating}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-xs font-bold"
            >
              {generating ? 'Generating…' : 'Preview Program'}
              {!generating && <span className="material-symbols-outlined text-[18px]">auto_awesome</span>}
            </button>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-xs w-full">
              {revisionCount < 3 && revisionFeedback.trim() && (
                <button
                  onClick={() => startGeneration('revise')}
                  disabled={revising || generating}
                  className="w-full bg-surface-container-high text-on-surface font-label-caps text-[13px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all border border-white/[0.08]"
                >
                  {revising ? 'Revising…' : 'Request Changes'}
                </button>
              )}
              <button
                onClick={handleConfirm}
                disabled={generating || revising}
                className="w-full bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-xs font-bold"
              >
                {generating ? 'Saving…' : 'Looks Good, Start My Program'}
                {!generating && <span className="material-symbols-outlined text-[18px]">bolt</span>}
              </button>
            </div>
          )}

          {step === 4 && (
            <button
              onClick={() => { router.push(returnTo); router.refresh() }}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-xs font-bold"
            >
              Go to Dashboard
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsContent />
    </Suspense>
  )
}
