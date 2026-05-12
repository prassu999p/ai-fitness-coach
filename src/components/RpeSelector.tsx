'use client'

interface Props {
  value: number | null
  onChange: (rpe: number) => void
}

const RPE_LABELS: Record<number, string> = {
  1: 'Very easy', 2: 'Easy', 3: 'Moderate', 4: 'Somewhat hard', 5: 'Hard',
  6: 'Harder', 7: 'Very hard', 8: 'Very very hard', 9: 'Near max', 10: 'Max effort',
}

export function RpeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="font-body-sm text-on-surface-variant text-xs uppercase tracking-widest">
        Effort (RPE)
      </p>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-8 h-8 rounded text-xs font-mono font-bold transition-colors ${
              value === n
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
            }`}
            title={RPE_LABELS[n]}
          >
            {n}
          </button>
        ))}
      </div>
      {value != null && (
        <p className="text-xs text-on-surface-variant">{RPE_LABELS[value]}</p>
      )}
    </div>
  )
}
