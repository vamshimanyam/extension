import { useEffect, useState } from 'react';
import { Settings, ExternalLink, Keyboard, RefreshCw } from 'lucide-react';
import { debounce } from '../../../utils/debounce';
import './SettingsPanel.css';

interface Command {
  name: string;
  description: string;
  shortcut: string;
}

const executeFetch = (
  setCommands: React.Dispatch<React.SetStateAction<Command[]>>,
  onComplete?: () => void
) => {
  if (typeof chrome !== 'undefined' && chrome.commands) {
    chrome.commands.getAll((cmds) => {
      setCommands(cmds as Command[]);
      onComplete?.();
    });
  } else {
    onComplete?.();
    console.warn('Chrome extension APIs are only available in the extension environment.');
  }
};

// 800ms is used here to safely bridge the standard OS keyboard repeat delay (which is typically 500ms).
// If we used 500ms, holding down the Enter key would cause the first debounce to resolve at the exact
// moment the OS starts spamming repeat clicks, resulting in a double fetch.
const debouncedFetchCommands = debounce(executeFetch as (...args: unknown[]) => void, 500);

export function SettingsPanel() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    debouncedFetchCommands(setCommands, () => setIsRefreshing(false));
  };

  useEffect(() => {
    executeFetch(setCommands);
  }, []);

  const openShortcutsSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } else {
      alert('Extension settings are only available when running as a Chrome Extension.');
    }
  };

  return (
    <div className="settings-container">
      <header className="settings-header">
        <Settings size={24} color="var(--accent)" aria-hidden="true" />
        <h2 className="settings-title" id="settings-title" tabIndex={-1}>Settings</h2>
      </header>

      <section className="settings-section" aria-labelledby="shortcuts-title">
        <div className="settings-section-header">
          <div className="settings-section-header-text">
            <h3 className="settings-section-title" id="shortcuts-title">
              <Keyboard size={18} aria-hidden="true" />
              Keyboard Shortcuts
            </h3>
            <p className="settings-description">
              Customize your capture shortcuts. For security reasons, Chrome requires you to change these in the native extensions settings page.
            </p>
          </div>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={handleRefresh}
            aria-label="Refresh shortcuts"
            title="Refresh shortcuts"
            aria-disabled={isRefreshing}
          >
            <RefreshCw size={18} aria-hidden="true" className={isRefreshing ? 'spin-animation' : ''} />
          </button>
        </div>
          
          <ul className="shortcuts-list" aria-label="List of keyboard shortcuts">
            {commands.map((cmd) => {
              if (cmd.name === '_execute_action') {
                return null;
              }
              return (
              <li key={cmd.name} className="shortcut-item">
                <span className="shortcut-desc">{cmd.description}</span>
                {cmd.shortcut ? (
                  <kbd className="shortcut-kbd" aria-label={`Shortcut: ${cmd.shortcut}`}>{cmd.shortcut}</kbd>
                ) : (
                  <span className="shortcut-unassigned" aria-label="Unassigned shortcut" role="status">Unassigned</span>
                )}
              </li>
              )
            })}
          </ul>

        <button 
          onClick={openShortcutsSettings}
          className="btn-primary"
          type="button"
        >
          Change Shortcuts in Chrome
          <ExternalLink size={16} aria-label=', opens in a new tab' />
        </button>
      </section>
    </div>
  );
}
