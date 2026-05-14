import type { SuggestedWorkout } from '@/lib/types'

interface Props {
  workout: SuggestedWorkout | null
  loading: boolean
  isPrescribed?: boolean
}

export function WorkoutCard({ workout, loading, isPrescribed }: Props) {
  if (loading) {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-surface-container h-[280px] animate-pulse">
        <div className="absolute inset-0 flex flex-col justify-end p-6 gap-2">
          <div className="h-4 bg-surface-container-high rounded w-24 mb-2" />
          <div className="h-8 bg-surface-container-high rounded w-3/4" />
          <div className="h-4 bg-surface-container-high rounded w-1/2 mt-2" />
        </div>
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="w-full rounded-2xl border border-white/10 bg-surface-container p-6 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">cloud_off</span>
        <p className="font-body-md text-body-md text-on-surface-variant">Could not load today&apos;s workout.</p>
      </div>
    )
  }

  return (
    <section aria-label={isPrescribed ? 'Prescribed Workout' : 'Suggested Workout'}>
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.6)] group block">
        {/* Dark gradient background */}
        <div className="absolute inset-0 bg-surface-dim">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0e0e0e] to-transparent opacity-80" />
        </div>

        {/* Card Content */}
        <div className="relative p-6 flex flex-col justify-end h-[280px]">
          {/* Top: Badge + menu */}
          <div className="mb-auto flex justify-between items-start">
            <div className="px-3 py-1 bg-primary-container text-on-primary-container font-label-caps text-label-caps rounded flex items-center gap-1 shadow-[0_0_15px_rgba(195,244,0,0.3)]">
              <span className="material-symbols-outlined text-[14px]">{isPrescribed ? 'verified' : 'bolt'}</span>
              {isPrescribed ? 'PRESCRIBED' : 'SUGGESTED'}
            </div>
          </div>

          {/* Bottom: Workout info */}
          <div className="flex flex-col gap-1">
            <span className="font-data-sm text-data-sm text-surface-tint tracking-widest uppercase">
              {workout.muscle_groups.slice(0, 2).join(' · ')}
            </span>
            <h3 className="font-headline-lg text-headline-lg text-primary uppercase leading-none drop-shadow-md">
              {workout.title}
            </h3>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-on-surface">
                <span className="material-symbols-outlined text-[18px] opacity-70">schedule</span>
                <span className="font-data-lg text-[16px]">~{workout.estimated_minutes} MIN</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-white/30" />
              <div className="flex items-center gap-1.5 text-on-surface">
                <span className="material-symbols-outlined text-[18px] opacity-70">fitness_center</span>
                <span className="font-data-lg text-[16px]">{workout.exercises.length} EXERCISES</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
