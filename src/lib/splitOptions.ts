import type { SplitType } from './types'

export interface SplitOption {
  value: SplitType
  label: string
  description: string
}

export const SPLIT_OPTIONS: SplitOption[] = [
  { value: 'auto',         label: 'Auto',          description: 'Let the AI pick the best split for your training frequency.' },
  { value: 'full_body',    label: 'Full Body',     description: 'Every session hits all major muscle groups. Best for 2–3 days/week.' },
  { value: 'upper_lower',  label: 'Upper / Lower', description: 'Alternates upper and lower body. Best for 4 days/week.' },
  { value: 'ppl',          label: 'Push / Pull / Legs', description: 'Push, pull, and leg days in rotation. Best for 3–6 days/week.' },
  { value: 'body_part',    label: 'Body-part Split', description: 'Dedicates a day to each muscle group. Best for 5–6 days/week.' },
]
