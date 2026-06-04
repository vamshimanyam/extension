import { create } from 'zustand'
import type { Settings } from '../../types/settings'

interface SettingsState {
  settings: Settings | null
  setSettings: (settings: Settings) => void
}

const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}))

export default useSettingsStore
