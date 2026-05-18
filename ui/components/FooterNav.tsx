import { LayoutDashboard, List, Settings } from 'lucide-react'

type View = 'home' | 'settings' | 'sessions'

interface Props {
  view: View
  onNavigate: (v: View) => void
}

export function FooterNav({ view, onNavigate }: Props) {
  return (
    <nav aria-label="Primary">
      <button
        type="button"
        className="app-footer-button"
        onClick={() => onNavigate('home')}
        aria-label="Dashboard"
        aria-current={view === 'home' ? 'page' : undefined}
      >
        <LayoutDashboard size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="app-footer-button"
        onClick={() => onNavigate('sessions')}
        aria-label="Current Sessions"
        aria-current={view === 'sessions' ? 'page' : undefined}
      >
        <List size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="app-footer-button"
        onClick={() => onNavigate('settings')}
        aria-label="Settings"
        aria-current={view === 'settings' ? 'page' : undefined}
      >
        <Settings size={16} aria-hidden="true" />
      </button>
    </nav>
  )
}

export default FooterNav
