import { create } from 'zustand'
import type { Session } from '../../types/session'
import type { Step } from '../../types/step'

interface ActiveSessionState {
  session: Session | null
  steps: Step[]
  selectedStepId: string | null
  pendingNoteStepId: string | null
  setBundle: (session: Session | null, steps: Step[]) => void
  setSession: (session: Session | null) => void
  addStep: (step: Step) => void
  updateStep: (step: Step) => void
  removeStep: (stepId: string) => void
  selectStep: (stepId: string | null) => void
  setPendingNoteStepId: (stepId: string | null) => void
  clear: () => void
}

const sortSteps = (steps: Step[]): Step[] => {
  return [...steps].sort((a, b) => a.stepNumber - b.stepNumber)
}

const useActiveSessionStore = create<ActiveSessionState>((set) => ({
  session: null,
  steps: [],
  selectedStepId: null,
  pendingNoteStepId: null,
  setBundle: (session, steps) => {
    const sorted = sortSteps(steps)
    set({
      session,
      steps: sorted,
      selectedStepId: sorted[0]?.id ?? null,
    })
  },
  setSession: (session) => set({ session }),
  addStep: (step) =>
    set((state) => {
      const next = sortSteps([...state.steps, step])
      return {
        steps: next,
        selectedStepId: step.id,
      }
    }),
  updateStep: (step) =>
    set((state) => ({
      steps: sortSteps(state.steps.map((item) => (item.id === step.id ? step : item))),
    })),
  removeStep: (stepId) =>
    set((state) => {
      const next = state.steps.filter((step) => step.id !== stepId)
      const selectedStepId =
        state.selectedStepId === stepId ? (next[0]?.id ?? null) : state.selectedStepId

      return {
        steps: next,
        selectedStepId,
      }
    }),
  selectStep: (stepId) => set({ selectedStepId: stepId }),
  setPendingNoteStepId: (stepId) => set({ pendingNoteStepId: stepId }),
  clear: () =>
    set({
      session: null,
      steps: [],
      selectedStepId: null,
      pendingNoteStepId: null,
    }),
}))

export default useActiveSessionStore
