import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../config/constants'
import type { Settings } from '../../types/settings'
import type { SettingsUpdate } from '../../types/settings'
import { getDb } from './db'

interface SettingsRecord extends Settings {
  key: string
}

export class SettingsRepo {
  public async get(): Promise<Settings> {
    const db = await getDb()
    const existing = await db.get('settings', SETTINGS_KEY)

    if (existing) {
      return this.mergeWithDefaults(existing)
    }

    await this.save(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }

  public async save(settings: Settings): Promise<void> {
    const db = await getDb()
    const record: SettingsRecord = {
      key: SETTINGS_KEY,
      ...settings,
    }

    await db.put('settings', record)
  }

  public async update(updates: SettingsUpdate): Promise<Settings> {
    const current = await this.get()

    const next: Settings = {
      ...current,
      ...updates,
      hotkeys: {
        ...current.hotkeys,
        ...updates.hotkeys,
      },
      capture: {
        ...current.capture,
        ...updates.capture,
      },
      buffers: {
        ...current.buffers,
        ...updates.buffers,
      },
      session: {
        ...current.session,
        ...updates.session,
      },
      export: {
        ...current.export,
        ...updates.export,
      },
      smartCapture: {
        ...current.smartCapture,
        ...updates.smartCapture,
      },
      integrations: {
        ...current.integrations,
        ...updates.integrations,
      },
      ui: {
        ...current.ui,
        ...updates.ui,
      },
    }

    await this.save(next)
    return next
  }

  private mergeWithDefaults(existing: Partial<Settings>): Settings {
    return {
      ...DEFAULT_SETTINGS,
      ...existing,
      hotkeys: {
        ...DEFAULT_SETTINGS.hotkeys,
        ...existing.hotkeys,
      },
      capture: {
        ...DEFAULT_SETTINGS.capture,
        ...existing.capture,
      },
      buffers: {
        ...DEFAULT_SETTINGS.buffers,
        ...existing.buffers,
      },
      session: {
        ...DEFAULT_SETTINGS.session,
        ...existing.session,
      },
      export: {
        ...DEFAULT_SETTINGS.export,
        ...existing.export,
      },
      smartCapture: {
        ...DEFAULT_SETTINGS.smartCapture,
        ...existing.smartCapture,
      },
      integrations: {
        ...DEFAULT_SETTINGS.integrations,
        ...existing.integrations,
      },
      ui: {
        ...DEFAULT_SETTINGS.ui,
        ...existing.ui,
      },
    }
  }
}
