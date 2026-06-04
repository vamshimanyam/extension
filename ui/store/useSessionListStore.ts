import { create } from 'zustand'
import type { Session } from '../../types/session'

interface SessionListState {
  sessions: Session[]
  activeSessionId: string | null
  setSessionData: (sessions: Session[], activeSessionId: string | null) => void
  upsertSession: (session: Session) => void
  setActiveSessionId: (sessionId: string | null) => void
}

const useSessionListStore = create<SessionListState>((set) => ({
  sessions: [],
  activeSessionId: null,
  setSessionData: (sessions, activeSessionId) =>
    set({
      sessions,
      activeSessionId,
    }),
  upsertSession: (session) =>
    set((state) => {
      const existing = state.sessions.find((item) => item.id === session.id)
      const sessions = existing
        ? state.sessions.map((item) => (item.id === session.id ? session : item))
        : [session, ...state.sessions]

      sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

      return {
        sessions,
      }
    }),
  setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),
}))

export default useSessionListStore
