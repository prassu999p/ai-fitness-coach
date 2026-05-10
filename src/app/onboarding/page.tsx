'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { FitnessLevel } from '@/lib/types'

const EQUIPMENT_OPTIONS = [
  { name: 'Barbell', icon: '🏋️' },
  { name: 'Dumbbells', icon: '💪' },
  { name: 'Cables', icon: '🔗' },
  { name: 'Smith Machine', icon: '⚙️' },
  { name: 'Pull-up Bar', icon: '🔩' },
  { name: 'Resistance Bands', icon: '🎯' },
  { name: 'Treadmill', icon: '🏃' },
  { name: 'Stationary Bike', icon: '🚴' },
  { name: 'Rowing Machine', icon: '🚣' },
  { name: 'Kettlebells', icon: '🔔' },
  { name: 'Dip Bars', icon: '📊' },
  { name: 'Leg Press', icon: '🦵' },
  { name: 'Lat Pulldown', icon: '⬇️' },
]

const FITNESS_LEVELS: Array<{ value: FitnessLevel; label: string; description: string; icon: string }> = [
  { value: 'beginner', label: 'Beginner', description: '0–1 years training. Focus on form and baseline strength.', icon: 'stat_1' },
  { value: 'intermediate', label: 'Intermediate', description: '1–3 years training. Familiar with progressive overload.', icon: 'stat_2' },
  { value: 'advanced', label: 'Advanced', description: '3+ years. Requires specialized programming and high volume.', icon: 'stat_3' },
]

type Step = 1 | 2 | 3

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1)
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate')
  const [daysPerWeek, setDaysPerWeek] = useState(4)
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  function toggleEquipment(name: string) {
    setSelectedEquipment(prev =>
      prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]
    )
  }

  async function handleFinish() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').upsert({
      id: user.id,
      fitness_level: fitnessLevel,
      days_per_week: daysPerWeek,
    })

    if (selectedEquipment.length > 0) {
      await supabase.from('user_equipment').insert(
        selectedEquipment.map(name => ({ user_id: user.id, equipment_name: name.toLowerCase() }))
      )
    }

    router.push('/dashboard')
    router.refresh()
  }

  const progressSegments = [step >= 1, step >= 2, step >= 3]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Fixed Header */}
      <header className="bg-surface/60 backdrop-blur-xl border-b border-white/5 fixed top-0 w-full max-w-md z-50 flex items-center justify-between px-margin h-16">
        {step > 1 ? (
          <button
            onClick={() => setStep((step - 1) as Step)}
            className="text-primary hover:opacity-80 transition-opacity"
          >
            <span className="material-symbols-outlined text-3xl">arrow_back</span>
          </button>
        ) : (
          <div className="w-8" />
        )}
        <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider">
          Elite Athlete
        </h1>
        <div className="w-8" />
      </header>

      {/* Main Content */}
      <main className="flex-grow pt-[88px] pb-[104px] px-margin flex flex-col">
        {/* Progress Bar */}
        <div className="flex gap-xs mb-lg mt-md">
          {progressSegments.map((active, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${active ? 'bg-primary-container glow-primary' : 'bg-surface-container-high'}`}
            />
          ))}
        </div>

        {/* Step 1: Fitness Level */}
        {step === 1 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">Step 1 of 3</p>
              <h2 className="font-display-lg text-display-lg text-primary uppercase">Select Your Level</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">
                Calibrate the engine. This determines your initial volume and intensity.
              </p>
            </div>
            <div className="flex flex-col gap-md flex-grow">
              {FITNESS_LEVELS.map(level => (
                <button
                  key={level.value}
                  onClick={() => setFitnessLevel(level.value)}
                  className={`w-full text-left rounded-xl p-md border-2 inner-glow transition-all duration-200 flex items-center justify-between ${
                    fitnessLevel === level.value
                      ? 'border-primary-container bg-surface-container glow-primary-active'
                      : 'border-transparent bg-surface-container-high'
                  }`}
                >
                  <div className="flex-1">
                    <h3 className="font-headline-md text-headline-md text-primary uppercase mb-base">{level.label}</h3>
                    <p className="font-body-md text-body-md text-on-surface-variant">{level.description}</p>
                  </div>
                  <span className={`material-symbols-outlined text-4xl ml-sm transition-colors ${fitnessLevel === level.value ? 'text-primary-container' : 'text-on-surface-variant'}`}>
                    {level.icon}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Days Per Week */}
        {step === 2 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">Step 2 of 3</p>
              <h2 className="font-display-lg text-display-lg text-primary uppercase">Training Frequency</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">
                How many sessions per week can you commit to?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-md flex-grow">
              {[3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setDaysPerWeek(n)}
                  className={`rounded-xl border-2 inner-glow transition-all duration-200 flex flex-col items-center justify-center py-lg ${
                    daysPerWeek === n
                      ? 'border-primary-container bg-surface-container glow-primary-active'
                      : 'border-transparent bg-surface-container-high'
                  }`}
                >
                  <span className={`font-display-lg text-display-lg font-mono transition-colors ${daysPerWeek === n ? 'text-primary-container' : 'text-primary'}`}>
                    {n}
                  </span>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase mt-xs">
                    {n === 1 ? 'day' : 'days'} / week
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Equipment */}
        {step === 3 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-md">
              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">Step 3 of 3</p>
              <h2 className="font-display-lg text-display-lg text-primary uppercase">Your Arsenal</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">
                Select everything available at your gym.
              </p>
            </div>
            <div className="flex flex-wrap gap-xs flex-grow content-start">
              {EQUIPMENT_OPTIONS.map(eq => (
                <button
                  key={eq.name}
                  onClick={() => toggleEquipment(eq.name)}
                  className={`px-sm py-xs rounded-full text-sm border transition-all duration-200 font-body-md ${
                    selectedEquipment.includes(eq.name)
                      ? 'border-primary-container bg-primary-container/15 text-primary-container glow-primary'
                      : 'border-outline-variant bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  {eq.icon} {eq.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 w-full max-w-md bg-surface/90 backdrop-blur-md p-margin border-t border-white/5 z-40 mx-auto">
        <div className="flex justify-between items-center">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary py-xs px-sm uppercase transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              className="bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container font-label-caps text-label-caps py-sm px-lg rounded-xl uppercase tracking-wider glow-primary hover:opacity-90 transition-opacity flex items-center gap-xs"
            >
              Next Step
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container font-label-caps text-label-caps py-sm px-lg rounded-xl uppercase tracking-wider glow-primary hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-xs"
            >
              {saving ? 'Setting up...' : "Let's Train"}
              {!saving && <span className="material-symbols-outlined text-[18px]">bolt</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
