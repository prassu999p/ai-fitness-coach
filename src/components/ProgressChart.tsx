'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { format } from 'date-fns'
import type { Workout, WorkoutExercise } from '@/lib/types'

interface Props {
  exerciseName: string
  workouts: Array<Workout & { exercises: WorkoutExercise[] }>
}

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-container-highest border border-white/10 rounded-lg px-sm py-xs shadow-xl">
      <p className="font-data-sm text-data-sm text-on-surface-variant mb-base">{label}</p>
      <p className="font-data-lg text-[16px] text-primary-container">{payload[0].value} kg</p>
    </div>
  )
}

export function ProgressChart({ exerciseName, workouts }: Props) {
  const data = workouts
    .flatMap(w =>
      w.exercises
        .filter(e => e.exercise_name === exerciseName && e.weight_kg != null && e.weight_kg! > 0)
        .map(e => ({
          date: w.date,
          weight: e.weight_kg,
          label: format(new Date(w.date + 'T00:00:00'), 'MMM d'),
        }))
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  if (data.length < 2) {
    return (
      <div className="bg-surface-container-low rounded-xl border border-white/5 p-md flex flex-col items-center justify-center h-32">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-xs">trending_up</span>
        <p className="font-body-md text-body-md text-on-surface-variant text-center">
          Log at least 2 sessions with {exerciseName} to see progress.
        </p>
      </div>
    )
  }

  const firstWeight = data[0].weight ?? 0
  const lastWeight = data[data.length - 1].weight ?? 0
  const delta = firstWeight > 0 ? Math.round(((lastWeight - firstWeight) / firstWeight) * 100) : 0

  return (
    <div className="bg-surface-container-low rounded-xl p-md border border-white/5" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div className="flex justify-between items-start mb-md">
        <div>
          <h4 className="font-headline-md text-headline-md text-primary uppercase">{exerciseName}</h4>
          <p className="font-data-sm text-data-sm text-on-surface-variant">WEIGHT (KG)</p>
        </div>
        {delta !== 0 && (
          <div className="bg-surface-container-high px-3 py-1 rounded-full border border-white/10 flex items-center gap-1">
            <span className="material-symbols-outlined text-primary-container text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              {delta >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            <span className="font-data-sm text-data-sm text-primary-container">
              {delta >= 0 ? '+' : ''}{delta}%
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#c4c9ac', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#c4c9ac', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#c3f400"
            strokeWidth={2}
            dot={{ fill: '#c3f400', strokeWidth: 0, r: 3 }}
            activeDot={{ fill: '#ffffff', stroke: '#c3f400', strokeWidth: 2, r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
