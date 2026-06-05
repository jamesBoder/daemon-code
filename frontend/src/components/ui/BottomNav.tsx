import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Zap, Scroll, GitBranch, Settings } from 'lucide-react'

const TABS = [
  { label: 'Home',      path: '/home',      Icon: Home      },
  { label: 'Session',   path: '/session',   Icon: Zap       },
  { label: 'Chronicle', path: '/chronicle', Icon: Scroll    },
  { label: 'Processes', path: '/processes', Icon: GitBranch },
  { label: 'Settings',  path: '/settings',  Icon: Settings  },
]

export function BottomNav() {
  const { pathname } = useLocation()
  const navigate     = useNavigate()

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(56px + env(safe-area-inset-bottom))',
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: 'rgba(13, 16, 24, 0.92)',
      borderTop: '0.5px solid rgba(255, 255, 255, 0.07)',
      backdropFilter: 'blur(16px) saturate(140%)',
      WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      display: 'flex', alignItems: 'flex-start',
      zIndex: 100,
    }}>
      {TABS.map(({ label, path, Icon }) => {
        const active = pathname === path
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              flex: 1, height: 56,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 3,
              background: 'none', border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
          >
            <Icon size={20} strokeWidth={1.5} />
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              lineHeight: 1,
              letterSpacing: '0.01em',
            }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
