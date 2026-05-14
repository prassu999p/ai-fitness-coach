'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'Home' },
  { href: '/trainer', icon: 'psychology', label: 'Trainer' },
  { href: '/history', icon: 'monitoring', label: 'History' },
  { href: '/profile', icon: 'person', label: 'Profile' },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('trainer_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'trainer')
        .is('read_at', null)
      setUnreadCount(count ?? 0)
    }
    fetchUnread()
  }, [pathname, supabase])

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/90 backdrop-blur-xl border-t border-white/[0.06]">
      <div className="flex justify-around items-center h-16 px-xs">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const showBadge = item.href === '/trainer' && unreadCount > 0 && !isActive
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-[2px] w-16 py-xs rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-primary-container'
                  : 'text-on-surface-variant/50 hover:text-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-primary-container' : ''}`}>
                {item.label}
              </span>
              {showBadge && (
                <span className="absolute top-1 right-2 min-w-[16px] h-4 px-[3px] rounded-full bg-primary-container text-on-primary-container text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-1 w-5 h-[3px] rounded-full bg-primary-container" />
              )}
            </Link>
          )
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
