import {create} from 'zustand'

export type View = 'home' | 'settings' | 'sessions'

interface UiState {
  view: View
  setView: (v: View) => void
}

const useUiStore = create<UiState>((set) => ({
  view: 'home',
  setView: (v: View) => set({ view: v }),
}))

export default useUiStore
