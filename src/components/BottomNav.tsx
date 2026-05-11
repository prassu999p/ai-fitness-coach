'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'Home' },
  { href: '/workout/log', icon: 'fitness_center', label: 'Workout' },
  { href: '/history', icon: 'monitoring', label: 'History' },
  { href: '/profile', icon: 'person', label: 'Profile' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/90 backdrop-blur-xl border-t border-white/[0.06]">
      <div className="flex justify-around items-center h-16 px-xs">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-[2px] w-16 py-xs rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-primary-container'
                  : 'text-on-surface-variant/50 hover:text-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-primary-container' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute bottom-1 w-5 h-[3px] rounded-full bg-primary-container" />
              )}
            </Link>
          )
        })}
      </div>
      {/* Safe area spacer for notched phones */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
