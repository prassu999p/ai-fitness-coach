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
      <header className="fixed top-0 w-full max-w-md z-50 bg-surface/60 backdrop-blur-xl border-b border-white/5 flex justify-between items-center px-margin h-16">
        <div className="w-8" />
        <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider">Profile</h1>
        <div className="w-8" />
      </header>

      <main className="flex-grow pt-[88px] pb-[104px] px-margin flex flex-col gap-lg">
        {/* Page Header */}
        <div>
          <h2 className="font-display-lg text-display-lg text-primary uppercase">Settings</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">
            Customize your training profile
          </p>
        </div>

        {/* Fitness Level */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            Fitness Level
          </h3>
          <div className="flex flex-col gap-xs">
            {FITNESS_LEVELS.map(level => (
              <button
                key={level.value}
                onClick={() => setFitnessLevel(level.value)}
                className={`w-full text-left rounded-xl p-sm border-2 transition-all duration-200 flex items-center justify-between ${
                  fitnessLevel === level.value
                    ? 'border-primary-container bg-surface-container glow-primary-active'
                    : 'border-transparent bg-surface-container-high'
                }`}
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
              >
                <div>
                  <p className="font-headline-md text-headline-md text-primary uppercase">{level.label}</p>
                  <p className="font-body-md text-body-md text-on-surface-variant">{level.description}</p>
                </div>
                {fitnessLevel === level.value && (
                  <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Equipment */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            Available Equipment
          </h3>
          <div className="flex flex-wrap gap-xs">
            {EQUIPMENT_OPTIONS.map(name => (
              <button
                key={name}
                onClick={() => toggleEquipment(name)}
                className={`px-sm py-xs rounded-full text-sm border transition-all duration-200 font-label-caps ${
                  equipment.includes(name.toLowerCase())
                    ? 'border-primary-container bg-primary-container/15 text-primary-container glow-primary'
                    : 'border-outline-variant bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        {/* AI Model */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            AI Model
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant text-sm">
            Requires OPENROUTER_MODEL env var restart to take effect.
          </p>
          <div className="flex flex-col gap-xs">
            {OPENROUTER_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full text-left p-sm rounded-xl border transition-all duration-200 flex items-center justify-between ${
                  model === m.id
                    ? 'border-primary-container/30 bg-surface'
                    : 'border-white/5 bg-surface hover:border-white/20'
                }`}
              >
                <div>
                  <p className="font-body-md text-body-md text-primary">{m.label}</p>
                  <p className="font-data-sm text-data-sm text-on-surface-variant">{m.description}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-sm ${
                  model === m.id ? 'border-primary-container' : 'border-outline-variant'
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
          className={`w-full font-label-caps text-label-caps py-sm rounded-xl uppercase tracking-wider transition-all ${
            saved
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container glow-primary hover:opacity-90 disabled:opacity-50'
          }`}
        >
          {saved ? '✓ SAVED' : saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>

        {/* Sign Out */}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-sm p-md bg-surface border border-white/5 rounded-xl hover:bg-error-container/20 hover:border-error/30 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-error border border-white/5 group-hover:bg-error-container/50 transition-colors">
            <span className="material-symbols-outlined">logout</span>
          </div>
          <span className="font-headline-md text-[20px] text-error">Logout</span>
        </button>
      </main>

      <BottomNav />
    </div>
  )
}
