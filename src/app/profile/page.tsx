'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BottomNav } from '@/components/BottomNav'
import { useRouter } from 'next/navigation'
import type { FitnessLevel } from '@/lib/types'

const EQUIPMENT_OPTIONS = [
  'Barbell', 'Dumbbells', 'Cables', 'Smith Machine',
  'Pull-up Bar', 'Resistance Bands', 'Treadmill',
  'Stationary Bike', 'Rowing Machine', 'Kettlebells',
  'Dip Bars', 'Leg Press', 'Lat Pulldown',
]

const FITNESS_LEVELS: Array<{ value: FitnessLevel; label: string; description: string }> = [
  { value: 'beginner', label: 'Beginner', description: '0–1 years training' },
  { value: 'intermediate', label: 'Intermediate', description: '1–3 years training' },
  { value: 'advanced', label: 'Advanced', description: '3+ years, specialized programming' },
]

const OPENROUTER_MODELS = [
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', description: 'Default — fast & accurate' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Most capable reasoning' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', description: 'OpenAI flagship' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', description: 'Open source powerhouse' },
]

export default function ProfilePage() {
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate')
  const [equipment, setEquipment] = useState<string[]>([])
  const [model, setModel] = useState('deepseek/deepseek-chat')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profile }, { data: eq }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('user_equipment').select('equipment_name').eq('user_id', user.id),
      ])

      if (profile) setFitnessLevel(profile.fitness_level as FitnessLevel)
      setEquipment((eq ?? []).map(e => e.equipment_name))
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleEquipment(name: string) {
    const lower = name.toLowerCase()
    setEquipment(prev =>
      prev.includes(lower) ? prev.filter(e => e !== lower) : [...prev, lower]
    )
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({ fitness_level: fitnessLevel }).eq('id', user.id)
    await supabase.from('user_equipment').delete().eq('user_id', user.id)

    if (equipment.length > 0) {
      await supabase.from('user_equipment').insert(
        equipment.map(name => ({ user_id: user.id, equipment_name: name }))
      )
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-center items-center px-margin h-14">
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">Profile</h1>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col gap-lg">
        {/* Page Header */}
        <div className="pt-xs">
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Settings</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-[4px]">
            Customize your training profile
          </p>
        </div>

        {/* Fitness Level */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">
            Fitness Level
          </h3>
          <div className="flex flex-col gap-xs">
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
                <div>
                  <p className="font-headline-md text-[18px] text-on-surface uppercase">{level.label}</p>
                  <p className="font-body-md text-[14px] text-on-surface-variant mt-[2px]">{level.description}</p>
                </div>
                {fitnessLevel === level.value && (
                  <span className="material-symbols-outlined text-primary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Equipment */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">
            Available Equipment
          </h3>
          <div className="flex flex-wrap gap-xs">
            {EQUIPMENT_OPTIONS.map(name => (
              <button
                key={name}
                onClick={() => toggleEquipment(name)}
                className={`px-sm py-xs rounded-full text-[13px] border transition-all duration-200 font-medium ${
                  equipment.includes(name.toLowerCase())
                    ? 'border-primary-container/40 bg-primary-container/10 text-primary-container'
                    : 'border-white/[0.08] bg-surface-container-high text-on-surface-variant hover:border-white/[0.15]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        {/* AI Model */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">
            AI Model
          </h3>
          <div className="flex flex-col gap-xs">
            {OPENROUTER_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full text-left p-sm rounded-xl border transition-all duration-200 flex items-center justify-between ${
                  model === m.id
                    ? 'border-primary-container/30 bg-surface-container'
                    : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                }`}
              >
                <div>
                  <p className="font-body-md text-[15px] text-on-surface">{m.label}</p>
                  <p className="font-mono text-[11px] text-on-surface-variant/60 mt-[2px]">{m.description}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-sm transition-colors ${
                  model === m.id ? 'border-primary-container' : 'border-white/20'
                }`}>
                  {model === m.id && <div className="w-2.5 h-2.5 rounded-full bg-primary-container" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Save Button */}
        <button
          onClick={save}
          disabled={saving}
          className={`w-full font-label-caps text-[14px] py-3.5 rounded-xl uppercase tracking-wider transition-all font-bold ${
            saved
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-50'
          }`}
        >
          {saved ? '✓ SAVED' : saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>

        {/* Sign Out */}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-sm p-sm bg-surface-container border border-white/[0.06] rounded-xl hover:bg-error-container/10 hover:border-error/20 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-error/70 group-hover:text-error transition-colors">
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </div>
          <span className="font-body-md text-[16px] text-on-surface-variant group-hover:text-error transition-colors">Sign Out</span>
        </button>
      </main>

      <BottomNav />
    </div>
  )
}
