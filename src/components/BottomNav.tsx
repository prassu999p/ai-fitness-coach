'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'DASHBOARD' },
  { href: '/workout/log', icon: 'fitness_center', label: 'WORKOUT' },
  { href: '/history', icon: 'monitoring', label: 'HISTORY' },
  { href: '/profile', icon: 'person', label: 'PROFILE' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 w-full max-w-md z-50 flex justify-around items-center px-2 h-20 bg-surface/80 backdrop-blur-xl border-t border-white/5 shadow-[0_-4px_20px_rgba(171,214,0,0.15)] mx-auto">
      {NAV_ITEMS.map(item => {
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center rounded-xl px-4 py-1.5 w-1/4 transition-all duration-200 ${
              isActive
                ? 'bg-primary-container text-on-primary-container shadow-[0_0_15px_rgba(195,244,0,0.3)] scale-90'
                : 'text-on-surface-variant opacity-60 hover:text-primary hover:opacity-100'
            }`}
          >
            <span className="material-symbols-outlined mb-1" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
              {item.icon}
            </span>
            <span className="font-label-caps text-[10px] tracking-wider">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
