import type { PlanPreview } from '@/lib/types'

export function PlanPreviewCard({ preview }: { preview: PlanPreview }) {
  return (
    <div className="bg-surface-container-high rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-headline text-primary-container text-sm uppercase tracking-wider">
          Your {preview.duration_weeks}-Week Program
        </p>
        <p className="text-xs text-on-surface-variant">{preview.sessions_per_week}×/week</p>
      </div>
      <div className="flex flex-col gap-2">
        {preview.phases.map((phase, i) => (
          <div key={i} className="bg-surface-container rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="font-body-sm text-on-surface font-semibold">{phase.name}</p>
              <p className="text-xs text-on-surface-variant">
                Wk {phase.week_range[0]}–{phase.week_range[1]}
              </p>
            </div>
            <p className="text-xs text-on-surface-variant mb-1 capitalize">{phase.focus}</p>
            <p className="text-xs text-on-surface-variant/70">{phase.top_exercises.join(' · ')}</p>
          </div>
        ))}
      </div>
      {preview.notes && (
        <p className="text-xs text-on-surface-variant italic">{preview.notes}</p>
      )}
    </div>
  )
}
