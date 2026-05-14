'use client'

import type { TrainerMessage } from '@/lib/types'
import { format } from 'date-fns'

interface Props {
  message: TrainerMessage
  onDismiss: (id: string) => void
}

export function CoachingCard({ message, onDismiss }: Props) {
  const typeLabel: Record<TrainerMessage['message_type'], string> = {
    check_in: 'Coach Check-in',
    weekly_review: 'Weekly Review',
    program_adjustment: 'Program Update',
    chat: 'Message',
    session_feedback: 'Session Feedback',
  }

  return (
    <div className="relative bg-surface-container border border-primary-container/20 rounded-2xl p-md overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-container/50 to-transparent" />

      <div className="flex items-start gap-sm">
        <div className="w-9 h-9 rounded-xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[18px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-[4px]">
            <p className="font-label-caps text-[9px] text-primary-container/70 tracking-widest uppercase">
              {typeLabel[message.message_type]}
            </p>
            <p className="font-mono text-[9px] text-on-surface-variant/30">
              {format(new Date(message.created_at), 'MMM d')}
            </p>
          </div>
          <p className="font-body-md text-[14px] text-on-surface line-clamp-3">{message.content}</p>
        </div>
        <button
          onClick={() => onDismiss(message.id)}
          className="flex-shrink-0 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors -mt-[2px] -mr-[4px] p-[4px]"
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  )
}
