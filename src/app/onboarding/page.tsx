'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { FitnessLevel } from '@/lib/types'
import { EQUIPMENT_CATALOG, EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/equipmentCatalog'

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

    router.push('/onboarding/goals')
  }

  const progressSegments = [step >= 1, step >= 2, step >= 3]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Fixed Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-white/[0.06] fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
        <div className="flex items-center justify-between px-margin h-14">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="text-on-surface-variant hover:text-primary-container transition-colors p-1 -ml-1"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
          ) : (
            <div className="w-8" />
          )}
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">
            Elite Athlete
          </h1>
          <div className="w-8" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col">
        {/* Progress Bar */}
        <div className="flex gap-xs mb-lg mt-sm">
          {progressSegments.map((active, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${active ? 'bg-primary-container' : 'bg-surface-container-high'}`}
            />
          ))}
        </div>

        {/* Step 1: Fitness Level */}
        {step === 1 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 1 of 3</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Select Your Level</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                Calibrate the engine. This determines your initial volume and intensity.
              </p>
            </div>
            <div className="flex flex-col gap-xs flex-grow">
              {FITNESS_LEVELS.map(level => (
                <button
                  key={level.value}
                  onClick={() => setFitnessLevel(level.value)}
                  className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                    fitnessLevel === level.value
                      ? 'border-primary-container/40 bg-surface-container'
                      : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex-1">
                    <h3 className="font-headline-md text-[18px] text-on-surface uppercase mb-[2px]">{level.label}</h3>
                    <p className="font-body-md text-[14px] text-on-surface-variant">{level.description}</p>
                  </div>
                  <span className={`material-symbols-outlined text-[28px] ml-sm transition-colors ${fitnessLevel === level.value ? 'text-primary-container' : 'text-on-surface-variant/30'}`}>
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
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 2 of 3</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Training Frequency</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                How many sessions per week can you commit to?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-sm flex-grow content-start">
              {[3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setDaysPerWeek(n)}
                  className={`rounded-xl border transition-all duration-200 flex flex-col items-center justify-center py-lg ${
                    daysPerWeek === n
                      ? 'border-primary-container/40 bg-surface-container'
                      : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                  }`}
                >
                  <span className={`font-mono text-[40px] font-bold transition-colors leading-none ${daysPerWeek === n ? 'text-primary-container' : 'text-on-surface'}`}>
                    {n}
                  </span>
                  <span className="font-label-caps text-[11px] text-on-surface-variant uppercase mt-xs tracking-widest">
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
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 3 of 3</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Your Arsenal</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                Select everything available at your gym.
              </p>
            </div>
            <div className="flex flex-col gap-sm flex-grow overflow-y-auto">
              {(Object.keys(EQUIPMENT_CATEGORIES) as EquipmentCategory[]).map(cat => (
                <div key={cat} className="flex flex-col gap-xs">
                  <p className="font-label-caps text-[10px] text-on-surface-variant/50 tracking-widest uppercase">
                    {EQUIPMENT_CATEGORIES[cat]}
                  </p>
                  <div className="flex flex-wrap gap-xs">
                    {EQUIPMENT_CATALOG.filter(i => i.category === cat).map(it => (
                      <button
                        key={it.name}
                        onClick={() => toggleEquipment(it.name)}
                        className={`px-sm py-xs rounded-full text-[13px] border transition-all duration-200 font-medium ${
                          selectedEquipment.includes(it.name)
                            ? 'border-primary-container/40 bg-primary-container/10 text-primary-container'
                            : 'border-white/[0.08] bg-surface-container-high text-on-surface-variant hover:border-white/[0.15]'
                        }`}
                      >
                        {it.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface/90 backdrop-blur-md p-margin border-t border-white/[0.06] z-40">
        <div className="flex justify-between items-center">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="font-label-caps text-[12px] text-on-surface-variant hover:text-primary-container py-xs px-sm uppercase transition-colors tracking-wider"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-xs font-bold"
            >
              Next Step
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-xs font-bold"
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
