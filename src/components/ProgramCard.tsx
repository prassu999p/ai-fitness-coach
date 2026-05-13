'use client'

import { useState } from 'react'
import type { TrainingProgram } from '@/lib/types'
import { differenceInDays, parseISO } from 'date-fns'

interface Props {
  program: TrainingProgram
}

const STATUS_COLOR = {
  completed: 'text-primary-container',
  active: 'text-secondary-container',
  upcoming: 'text-on-surface-variant/40',
}

export function ProgramCard({ program }: Props) {
  const [expanded, setExpanded] = useState(false)

  const today = new Date()
  const start = parseISO(program.start_date)
  const daysSinceStart = differenceInDays(today, start)
  const currentWeek = Math.max(1, Math.min(Math.ceil((daysSinceStart + 1) / 7), program.duration_weeks))
  const progressPct = Math.round((currentWeek / program.duration_weeks) * 100)

  const activePhase = program.phases.find(
    p => currentWeek >= p.week_range[0] && currentWeek <= p.week_range[1]
  ) ?? program.phases[0]

  const goalLabel = program.goal.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <section aria-label="Program Progress" className="bg-surface-container border border-white/[0.06] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex flex-col px-md py-sm hover:bg-white/[0.02] transition-colors gap-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>layers</span>
            <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase">
              Week {currentWeek} of {program.duration_weeks} · {goalLabel}
            </p>
          </div>
          <span
            className="material-symbols-outlined text-[16px] text-on-surface-variant/40 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            expand_more
          </span>
        </div>
        <p className="text-left font-headline-md text-[15px] text-on-surface uppercase">
          {activePhase?.name ?? 'Active Block'}
        </p>
        <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-container rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-left font-label-caps text-[9px] text-on-surface-variant/40 tracking-widest">
          {progressPct}% COMPLETE
        </p>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
          {program.phases.map(phase => {
            const isActive = currentWeek >= phase.week_range[0] && currentWeek <= phase.week_range[1]
            const isCompleted = currentWeek > phase.week_range[1]
            const status: 'active' | 'completed' | 'upcoming' = isCompleted ? 'completed' : isActive ? 'active' : 'upcoming'

            return (
              <div key={phase.name} className={`flex items-center justify-between px-md py-sm ${isActive ? 'bg-primary-container/5' : ''}`}>
                <div>
                  <p className={`font-headline-md text-[14px] uppercase ${isActive ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
                    {phase.name}
                  </p>
                  <p className="font-body-md text-[12px] text-on-surface-variant/50">
                    Weeks {phase.week_range[0]}–{phase.week_range[1]} · {phase.focus}
                  </p>
                </div>
                <div className={`font-label-caps text-[10px] tracking-widest uppercase ${STATUS_COLOR[status]}`}>
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  ) : isActive ? (
                    <span className="inline-flex items-center gap-[4px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-pulse" />
                      NOW
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/20">radio_button_unchecked</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
