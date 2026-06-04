import {create} from 'zustand'

export const tabs = ['home', 'sessions', 'settings'] as const;
export type TabsType = (typeof tabs)[number];

interface UiState {
  view: TabsType
  setView: (v: TabsType) => void
}

const useUiStore = create<UiState>((set) => ({
  view: 'home',
  setView: (v: TabsType) => set({ view: v }),
}))

export default useUiStore
