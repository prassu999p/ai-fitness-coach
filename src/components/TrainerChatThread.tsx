'use client'

import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import type { TrainerMessage } from '@/lib/types'

interface Props {
  history: TrainerMessage[]
  isStreaming: boolean
  streamContent: string
}

function MessageBubble({ msg }: { msg: TrainerMessage }) {
  const isTrainer = msg.role === 'trainer'

  if (isTrainer && (msg.message_type === 'weekly_review' || msg.message_type === 'check_in')) {
    return (
      <div className="flex gap-sm items-start">
        <div className="w-8 h-8 rounded-full bg-primary-container/20 border border-primary-container/30 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        </div>
        <div className="flex-1 bg-surface-container border border-primary-container/20 rounded-2xl rounded-tl-sm p-sm">
          <p className="font-label-caps text-[9px] text-primary-container/60 tracking-widest uppercase mb-xs">
            {msg.message_type === 'weekly_review' ? 'Weekly Review' : 'Coach Check-in'}
          </p>
          <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{msg.content}</p>
          {msg.created_at && (
            <p className="font-mono text-[9px] text-on-surface-variant/30 mt-xs">
              {format(new Date(msg.created_at), 'MMM d, h:mm a')}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isTrainer) {
    return (
      <div className="flex gap-sm items-start">
        <div className="w-8 h-8 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        </div>
        <div className="flex-1 bg-surface-container border border-white/[0.06] rounded-2xl rounded-tl-sm p-sm max-w-[85%]">
          <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div className="bg-primary-container/15 border border-primary-container/20 rounded-2xl rounded-tr-sm p-sm max-w-[85%]">
        <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  )
}

export function TrainerChatThread({ history, isStreaming, streamContent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamContent])

  return (
    <div className="flex flex-col gap-md">
      {history.map(msg => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}

      {isStreaming && (
        <div className="flex gap-sm items-start">
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60 animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div className="flex-1 bg-surface-container border border-white/[0.06] rounded-2xl rounded-tl-sm p-sm max-w-[85%]">
            {streamContent ? (
              <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{streamContent}</p>
            ) : (
              <div className="flex gap-[4px] items-center py-[2px]">
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
