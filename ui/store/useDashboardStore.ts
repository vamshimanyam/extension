import { create } from 'zustand'
import type { DashboardStats } from '../../types/dashboard'

interface DashboardState {
  dashboard: DashboardStats | null
  loading: boolean
  error: string | null
  setLoading: (loading: boolean) => void
  setDashboard: (dashboard: DashboardStats) => void
  setError: (error: string | null) => void
}

const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  loading: false,
  error: null,
  setLoading: (loading) => set({ loading }),
  setDashboard: (dashboard) => set({ dashboard, error: null }),
  setError: (error) => set({ error }),
}))

export default useDashboardStore
