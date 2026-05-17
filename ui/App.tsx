import { SettingsPanel } from './features/settings/SettingsPanel'

function App() {
  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header">
        <h1 className="app-title">QA Documenter</h1>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        <SettingsPanel />
      </main>
    </div>
  )
}

export default App
