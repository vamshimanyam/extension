import { SettingsPanel } from './features/settings/SettingsPanel'
import useUiStore from './store/useUiStore'
import FooterNav from './components/FooterNav'
import useFocusOnNavigate from './hooks/useFocusOnNavigate'

function App() {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)

  const handleNav = useFocusOnNavigate(setView)

  const renderView = () => {
    switch (view) {
      case 'home':
        return <Home />
      case 'settings':
        return <SettingsPanel />
      case 'sessions':
        return <Sessions />
      default:
        return <Home />
    }
  }

  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header">
        <h1 className="app-title">QA Documenter</h1>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="app-main">
        {renderView()}
      </main>
      {/* App Footer */}
      <footer className="app-footer">
        <FooterNav view={view} onNavigate={handleNav} />
      </footer>
    </div>
  )
}

function Home() {
  return (
    <section aria-labelledby="home-heading">
      <h2 id="home-heading" tabIndex={-1}>Welcome to QA Documenter</h2>
    </section>
  )
}

function Sessions() {
  return (
    <section aria-labelledby="sessions-heading">
      <h2 id="sessions-heading" tabIndex={-1}>Sessions</h2>
      <p>Sessions View - Coming Soon!</p>
    </section>
  )
}

export default App
