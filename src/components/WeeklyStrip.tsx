import { format, startOfWeek, addDays } from 'date-fns'
import type { Workout, WeeklyPlan, DayKey } from '@/lib/types'

interface Props {
  workouts: Workout[]
  weeklyPlan?: WeeklyPlan | null
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const FOCUS_SHORT: Record<string, string> = {
  push: 'PUSH', pull: 'PULL', legs: 'LEGS',
  upper: 'UPR', lower: 'LWR', full_body: 'FULL',
  chest: 'CHST', back: 'BACK', shoulders: 'SHLD',
  arms: 'ARMS', core: 'CORE', rest: 'REST',
}

export function WeeklyStrip({ workouts, weeklyPlan }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <section aria-label="Weekly Workout Status">
      <div className="flex justify-between items-end bg-surface-container-low rounded-xl p-4 border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isToday = dateStr === today
          const isFuture = dateStr > today
          const workout = workouts.find(w => w.date === dateStr)
          const focus = weeklyPlan?.day_slots?.[DAY_KEYS[i]]
          const focusLabel = focus ? FOCUS_SHORT[focus] ?? focus.toUpperCase() : null

          return (
            <div key={dateStr} className="flex flex-col items-center gap-xs relative">
              <span className={`font-label-caps text-label-caps ${isToday ? 'text-primary' : isFuture ? 'text-on-surface-variant opacity-50' : 'text-on-surface-variant'}`}>
                {DAY_LABELS[i]}
              </span>

              {isToday ? (
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center border-2 border-primary-container relative z-10 shadow-[0_0_15px_rgba(195,244,0,0.4)]">
                  <div className="w-2 h-2 rounded-full bg-primary-container" />
                </div>
              ) : workout?.status === 'completed' ? (
                <div className="w-8 h-8 rounded-full bg-primary-container/10 flex items-center justify-center border border-primary-container shadow-[0_0_12px_rgba(195,244,0,0.2)]">
                  <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
                </div>
              ) : workout?.status === 'skipped' ? (
                <div className="w-8 h-8 rounded-full bg-error-container/20 flex items-center justify-center border border-error">
                  <span className="material-symbols-outlined text-[16px] text-error" style={{ fontVariationSettings: "'wght' 600" }}>close</span>
                </div>
              ) : isFuture ? (
                <div className="w-8 h-8 rounded-full border border-dashed border-white/20 flex items-center justify-center opacity-50" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center border border-white/10 opacity-60">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'wght' 300" }}>bed</span>
                </div>
              )}

              {focusLabel && (
                <span className={`font-mono text-[9px] tracking-widest ${focus === 'rest' ? 'text-on-surface-variant/40' : 'text-primary-container/70'}`}>
                  {focusLabel}
                </span>
              )}

              {isToday && (
                <div className="absolute -bottom-3 w-4 h-[2px] bg-primary-container rounded-full" />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
