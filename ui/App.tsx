import { Badge, Box, Button, Card, Flex, Select, Tabs, Text, TextField } from '@radix-ui/themes'
import * as React from 'react'
import { onRuntimeEvent, sendMessage } from '../messaging/client'
import type { SessionImportResult } from '../types/backup'
import type { Session } from '../types/session'
import type { Step } from '../types/step'
import ExportDocxButton from './features/export/ExportDocxButton'
import ExportPdfButton from './features/export/ExportPdfButton'
import SessionCollaborationPanel from './features/export/SessionCollaborationPanel'
import HomeDashboard from './features/home/HomeDashboard'
import StartSessionCard from './features/session/StartSessionCard'
import SessionHeader from './features/session/SessionHeader'
import StepEditor from './features/step/StepEditor'
import TechDataPicker from './features/tech/TechDataPicker'
import Timeline from './features/timeline/Timeline'
import { SettingsPanel } from './sections/settings/SettingsPanel'
import useActiveSessionStore from './store/useActiveSessionStore'
import useSessionListStore from './store/useSessionListStore'
import useSettingsStore from './store/useSettingsStore'
import useUiStore, { tabs, type TabsType } from './store/useUiStore'

function App() {
  const view = useUiStore((state) => state.view)
  const setView = useUiStore((state) => state.setView)

  const session = useActiveSessionStore((state) => state.session)
  const steps = useActiveSessionStore((state) => state.steps)
  const selectedStepId = useActiveSessionStore((state) => state.selectedStepId)
  const setBundle = useActiveSessionStore((state) => state.setBundle)
  const addStep = useActiveSessionStore((state) => state.addStep)
  const updateStep = useActiveSessionStore((state) => state.updateStep)
  const removeStep = useActiveSessionStore((state) => state.removeStep)
  const selectStep = useActiveSessionStore((state) => state.selectStep)
  const clearActiveSession = useActiveSessionStore((state) => state.clear)

  const sessions = useSessionListStore((state) => state.sessions)
  const setSessionData = useSessionListStore((state) => state.setSessionData)
  const setActiveSessionId = useSessionListStore((state) => state.setActiveSessionId)
  const upsertSession = useSessionListStore((state) => state.upsertSession)

  const setSettings = useSettingsStore((state) => state.setSettings)
  const settings = useSettingsStore((state) => state.settings)

  const [bannerMessage, setBannerMessage] = React.useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = React.useState(false)
  const [undoDeletedStep, setUndoDeletedStep] = React.useState<Step | null>(null)
  const [techPickerState, setTechPickerState] = React.useState<{
    stepId: string
    tabId: number
  } | null>(null)

  const showBanner = React.useCallback((message: string) => {
    setBannerMessage(message)
    window.setTimeout(() => {
      setBannerMessage((current) => (current === message ? null : current))
    }, 5000)
  }, [])

  const dismissOnboarding = React.useCallback(() => {
    setShowOnboarding(false)
    void chrome.storage.local.set({ qaOnboardingDismissed: true })
  }, [])

  const maybeShowFirstCaptureTip = React.useCallback(
    (step: Step) => {
      if (step.stepNumber !== 1) {
        return
      }

      void chrome.storage.local.get('qaFirstCaptureTipSeen').then((storage) => {
        if (storage.qaFirstCaptureTipSeen) {
          return
        }

        showBanner('Step 1 added. Select the card to add a note, status, or annotation.')
        void chrome.storage.local.set({ qaFirstCaptureTipSeen: true })
      })
    },
    [showBanner]
  )

  React.useEffect(() => {
    if (!undoDeletedStep) {
      return
    }

    const timeout = window.setTimeout(() => {
      setUndoDeletedStep(null)
    }, 10000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [undoDeletedStep])

  const refreshSessionState = React.useCallback(async () => {
    const [sessionListResponse, activeSessionResponse] = await Promise.all([
      sendMessage('GET_SESSION_LIST', undefined),
      sendMessage('GET_ACTIVE_SESSION', undefined),
    ])

    setSessionData(sessionListResponse.sessions, sessionListResponse.activeSessionId)
    setBundle(activeSessionResponse.session, activeSessionResponse.steps)
    setActiveSessionId(activeSessionResponse.session?.id ?? null)

    if (!activeSessionResponse.session) {
      clearActiveSession()
    }

    return {
      sessionListResponse,
      activeSessionResponse,
    }
  }, [clearActiveSession, setActiveSessionId, setBundle, setSessionData])

  const handleOpenSession = React.useCallback(
    async (sessionId: string) => {
      const response = await sendMessage('GET_SESSION_DETAIL', { sessionId })

      if (!response.session) {
        showBanner('Selected session could not be loaded.')
        return
      }

      setBundle(response.session, response.steps)
      setActiveSessionId(response.session.status === 'active' ? response.session.id : null)
      setView('sessions')
    },
    [setActiveSessionId, setBundle, setView, showBanner]
  )

  const handleCloseSessionView = React.useCallback(() => {
    clearActiveSession()
  }, [clearActiveSession])

  const handleDeleteStep = React.useCallback(
    async (step: Step) => {
      await sendMessage('DELETE_STEP', { stepId: step.id })
      setUndoDeletedStep(step)
      showBanner(`Step ${step.stepNumber} deleted. Undo available for 10 seconds.`)
    },
    [showBanner]
  )

  const handleUndoDeleteStep = React.useCallback(async () => {
    if (!undoDeletedStep) {
      return
    }

    const snapshot = undoDeletedStep
    setUndoDeletedStep(null)

    try {
      await sendMessage('RESTORE_DELETED_STEP', { step: snapshot })
      showBanner(`Step ${snapshot.stepNumber} restored.`)
    } catch {
      showBanner('Failed to restore deleted step.')
    }
  }, [undoDeletedStep, showBanner])

  const handleDuplicateStep = React.useCallback(
    async (step: Step) => {
      const response = await sendMessage('DUPLICATE_STEP', { stepId: step.id })
      selectStep(response.step.id)
      showBanner(`Step ${response.step.stepNumber} duplicated.`)
    },
    [selectStep, showBanner]
  )

  const handleAddManualStep = React.useCallback(
    async (sessionId: string) => {
      await sendMessage('CREATE_MANUAL_STEP', { sessionId })
      showBanner('Manual step added.')
    },
    [showBanner]
  )

  const handleDeleteSession = React.useCallback(
    async (sessionId: string, sessionName: string) => {
      const confirmed = globalThis.confirm(
        `Delete session "${sessionName}"? This will permanently remove all captured steps and screenshots.`
      )

      if (!confirmed) {
        return
      }

      await sendMessage('DELETE_SESSION', { sessionId })

      await refreshSessionState()

      showBanner(`Session "${sessionName}" deleted.`)
    },
    [refreshSessionState, showBanner]
  )

  const handleArchiveSession = React.useCallback(
    async (sessionId: string, status: Session['status']) => {
      const response = await sendMessage('UPDATE_SESSION', {
        sessionId,
        updates: {
          status,
        },
      })

      upsertSession(response.session)
      await refreshSessionState()
      showBanner(status === 'archived' ? 'Session archived.' : 'Session restored to completed.')
    },
    [refreshSessionState, showBanner, upsertSession]
  )

  const handleCompleteRemainingSessions = React.useCallback(async () => {
    const response = await sendMessage('COMPLETE_REMAINING_SESSIONS', undefined)

    if (response.sessions.length === 0) {
      showBanner('No active sessions to complete.')
      return
    }

    await refreshSessionState()

    const count = response.sessions.length
    showBanner(`${count} session${count === 1 ? '' : 's'} marked as completed.`)
  }, [refreshSessionState, showBanner])

  const handleDeleteCompletedSessions = React.useCallback(async () => {
    const response = await sendMessage('DELETE_COMPLETED_SESSIONS', undefined)

    await refreshSessionState()

    if (response.deletedCount === 0) {
      showBanner('No completed sessions to delete.')
      return
    }

    showBanner(`Deleted ${response.deletedCount} completed session${response.deletedCount === 1 ? '' : 's'}.`)
  }, [refreshSessionState, showBanner])

  const handleReorderSteps = React.useCallback(
    async (sessionId: string, orderedStepIds: string[]) => {
      const response = await sendMessage('REORDER_STEPS', {
        sessionId,
        orderedStepIds,
      })

      const currentSession = useActiveSessionStore.getState().session
      if (currentSession && currentSession.id === sessionId) {
        setBundle(currentSession, response.steps)
      }

      const sessionListResponse = await sendMessage('GET_SESSION_LIST', undefined)
      setSessionData(sessionListResponse.sessions, sessionListResponse.activeSessionId)
    },
    [setBundle, setSessionData]
  )

  const handleTechDataAttached = React.useCallback(
    (counts: { network: number; console: number }) => {
      setTechPickerState(null)
      showBanner(`Attached ${counts.network} network and ${counts.console} console entries.`)
    },
    [showBanner]
  )

  const handleBackupImported = React.useCallback(
    async (result: SessionImportResult) => {
      await refreshSessionState()
      await handleOpenSession(result.session.id)
    },
    [handleOpenSession, refreshSessionState]
  )

  const selectedStep = React.useMemo(() => {
    if (!selectedStepId) {
      return null
    }

    return steps.find((step) => step.id === selectedStepId) ?? null
  }, [steps, selectedStepId])

  const previousSelectedStep = React.useMemo(() => {
    if (!selectedStep) {
      return null
    }

    const selectedIndex = steps.findIndex((step) => step.id === selectedStep.id)
    return selectedIndex > 0 ? (steps[selectedIndex - 1] ?? null) : null
  }, [selectedStep, steps])

  React.useEffect(() => {
    void chrome.storage.local.get('qaOnboardingDismissed').then((storage) => {
      setShowOnboarding(storage.qaOnboardingDismissed !== true)
    })

    const bootstrap = async () => {
      const [sessionListResponse, activeSessionResponse, settingsResponse] = await Promise.all([
        sendMessage('GET_SESSION_LIST', undefined),
        sendMessage('GET_ACTIVE_SESSION', undefined),
        sendMessage('GET_SETTINGS', undefined),
      ])

      setSessionData(sessionListResponse.sessions, sessionListResponse.activeSessionId)
      setBundle(activeSessionResponse.session, activeSessionResponse.steps)
      setSettings(settingsResponse.settings)

      if (activeSessionResponse.session) {
        setView('sessions')
      }
    }

    void bootstrap()
  }, [setBundle, setSessionData, setSettings, setView])

  React.useEffect(() => {
    const refreshSessionList = async () => {
      const response = await sendMessage('GET_SESSION_LIST', undefined)
      setSessionData(response.sessions, response.activeSessionId)
    }

    const refreshActiveSession = async () => {
      const response = await sendMessage('GET_ACTIVE_SESSION', undefined)
      setBundle(response.session, response.steps)
      if (response.session) {
        setActiveSessionId(response.session.id)
      } else {
        setActiveSessionId(null)
      }
    }

    const offSessionStarted = onRuntimeEvent('SESSION_STARTED', (payload) => {
      upsertSession(payload.session)
      setActiveSessionId(payload.session.id)
      setView('sessions')
      void refreshActiveSession()
    })

    const offSessionRestored = onRuntimeEvent('SESSION_RESTORED', (payload) => {
      upsertSession(payload.session)
      setActiveSessionId(payload.session.id)
      setView('sessions')
      void refreshActiveSession()
      showBanner('Session restored after service worker restart.')
    })

    const offSessionEnded = onRuntimeEvent('SESSION_ENDED', (payload) => {
      upsertSession(payload.session)
      setActiveSessionId(null)
      if (useActiveSessionStore.getState().session?.id === payload.session.id) {
        clearActiveSession()
      }
      void refreshSessionList()
      showBanner('Session ended.')
    })

    const offSessionUpdated = onRuntimeEvent('SESSION_UPDATED', (payload) => {
      upsertSession(payload.session)

      const currentSessionId = useActiveSessionStore.getState().session?.id
      if (currentSessionId === payload.session.id) {
        void sendMessage('GET_SESSION_DETAIL', { sessionId: payload.session.id }).then((response) => {
          setBundle(response.session, response.steps)
        })
      }

      void refreshSessionList()
    })

    const offSessionDeleted = onRuntimeEvent('SESSION_DELETED', (payload) => {
      if (useActiveSessionStore.getState().session?.id === payload.sessionId) {
        clearActiveSession()
        setActiveSessionId(null)
      }

      void refreshSessionList()
    })

    const offStepAdded = onRuntimeEvent('STEP_ADDED', (payload) => {
      const currentSessionId = useActiveSessionStore.getState().session?.id
      if (!currentSessionId) {
        void refreshActiveSession()
        return
      }

      if (currentSessionId === payload.step.sessionId) {
        addStep(payload.step)
      }

      maybeShowFirstCaptureTip(payload.step)
      void refreshSessionList()
    })

    const offStepUpdated = onRuntimeEvent('STEP_UPDATED', (payload) => {
      const currentSessionId = useActiveSessionStore.getState().session?.id
      if (currentSessionId === payload.step.sessionId) {
        updateStep(payload.step)
      }
      void refreshSessionList()
    })

    const offStepDeleted = onRuntimeEvent('STEP_DELETED', (payload) => {
      removeStep(payload.stepId)
      void refreshSessionList()
    })

    const offNotePopup = onRuntimeEvent('OPEN_NOTE_POPUP', (payload) => {
      setView('sessions')
      selectStep(payload.stepId)
    })

    const offTechPopup = onRuntimeEvent('OPEN_TECH_POPUP', (payload) => {
      setView('sessions')
      selectStep(payload.stepId)
      setTechPickerState({
        stepId: payload.stepId,
        tabId: payload.tabId,
      })
    })

    const offCaptureError = onRuntimeEvent('CAPTURE_ERROR', (payload) => {
      showBanner(payload.message)
    })

    const offStorageWarning = onRuntimeEvent('STORAGE_WARNING', (payload) => {
      showBanner(payload.message)
    })

    return () => {
      offSessionStarted()
      offSessionRestored()
      offSessionEnded()
      offSessionUpdated()
      offSessionDeleted()
      offStepAdded()
      offStepUpdated()
      offStepDeleted()
      offNotePopup()
      offTechPopup()
      offCaptureError()
      offStorageWarning()
    }
  }, [
    addStep,
    clearActiveSession,
    removeStep,
    selectStep,
    setActiveSessionId,
    setBundle,
    setSessionData,
    setView,
    updateStep,
    upsertSession,
    showBanner,
    maybeShowFirstCaptureTip,
  ])

  const handleTabChange = (newTab: string) => {
    setView(newTab as TabsType)
  }

  return (
    <div className={`app-container thumbnail-${settings?.ui.thumbnailSize ?? 'medium'} theme-${settings?.ui.theme ?? 'dark'}`}>
      <Tabs.Root value={view} onValueChange={handleTabChange}>
        <header>
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Trigger key={tab} value={tab}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </header>

        <main>
          {bannerMessage && (
            <Card className="banner-card" mb="3">
              <Text size="2">{bannerMessage}</Text>
            </Card>
          )}

          {showOnboarding && <OnboardingCard onDismiss={dismissOnboarding} />}

          <Tabs.Content value="home">
            <HomeTab />
          </Tabs.Content>

          <Tabs.Content value="sessions">
            <SessionsTab
              session={session}
              sessions={sessions}
              steps={steps}
              selectedStep={selectedStep}
              previousSelectedStep={previousSelectedStep}
              onSelectStep={selectStep}
              onOpenSession={handleOpenSession}
              onDeleteSession={handleDeleteSession}
              onArchiveSession={handleArchiveSession}
              onDeleteCompletedSessions={handleDeleteCompletedSessions}
              onCompleteRemainingSessions={handleCompleteRemainingSessions}
              onReorderSteps={handleReorderSteps}
              onCloseSessionView={handleCloseSessionView}
              onDeleteStep={handleDeleteStep}
              onDuplicateStep={handleDuplicateStep}
              onAddManualStep={handleAddManualStep}
              onBackupImported={handleBackupImported}
              onStatus={showBanner}
              undoDeletedStep={undoDeletedStep}
              onUndoDeleteStep={handleUndoDeleteStep}
            />

            <TechDataPicker
              open={Boolean(techPickerState)}
              stepId={techPickerState?.stepId ?? null}
              tabId={techPickerState?.tabId ?? null}
              onOpenChange={(open) => {
                if (!open) {
                  setTechPickerState(null)
                }
              }}
              onAttached={handleTechDataAttached}
            />
          </Tabs.Content>

          <Tabs.Content value="settings">
            <SettingsPanel />
          </Tabs.Content>
        </main>
      </Tabs.Root>
    </div>
  )
}

function HomeTab() {
  return (
    <HomeDashboard />
  )
}

function OnboardingCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card mb="3">
      <Flex direction="column" gap="3">
        <Text size="3" weight="bold">
          Welcome to QA Session Documenter
        </Text>
        <Flex direction="column" gap="1">
          <Text size="2">Silent capture: Ctrl+Shift+S</Text>
          <Text size="2">Capture with note: Ctrl+Shift+N</Text>
          <Text size="2">Capture with technical data: Ctrl+Shift+D</Text>
          <Text size="2">Region capture: Ctrl+Shift+R</Text>
        </Flex>
        <Button onClick={onDismiss}>Start a Test Session</Button>
      </Flex>
    </Card>
  )
}

interface SessionsTabProps {
  session: ReturnType<typeof useActiveSessionStore.getState>['session']
  sessions: ReturnType<typeof useSessionListStore.getState>['sessions']
  steps: ReturnType<typeof useActiveSessionStore.getState>['steps']
  selectedStep: ReturnType<typeof useActiveSessionStore.getState>['steps'][number] | null
  previousSelectedStep: ReturnType<typeof useActiveSessionStore.getState>['steps'][number] | null
  onSelectStep: (stepId: string | null) => void
  onOpenSession: (sessionId: string) => Promise<void>
  onDeleteSession: (sessionId: string, sessionName: string) => Promise<void>
  onArchiveSession: (sessionId: string, status: Session['status']) => Promise<void>
  onDeleteCompletedSessions: () => Promise<void>
  onCompleteRemainingSessions: () => Promise<void>
  onReorderSteps: (sessionId: string, orderedStepIds: string[]) => Promise<void>
  onCloseSessionView: () => void
  onDeleteStep: (step: Step) => Promise<void>
  onDuplicateStep: (step: Step) => Promise<void>
  onAddManualStep: (sessionId: string) => Promise<void>
  onBackupImported: (result: SessionImportResult) => Promise<void>
  onStatus: (message: string) => void
  undoDeletedStep: Step | null
  onUndoDeleteStep: () => Promise<void>
}

function SessionsTab({
  session,
  sessions,
  steps,
  selectedStep,
  previousSelectedStep,
  onSelectStep,
  onOpenSession,
  onDeleteSession,
  onArchiveSession,
  onDeleteCompletedSessions,
  onCompleteRemainingSessions,
  onReorderSteps,
  onCloseSessionView,
  onDeleteStep,
  onDuplicateStep,
  onAddManualStep,
  onBackupImported,
  onStatus,
  undoDeletedStep,
  onUndoDeleteStep,
}: SessionsTabProps) {
  const [openingSessionId, setOpeningSessionId] = React.useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = React.useState<string | null>(null)
  const [deletingCompleted, setDeletingCompleted] = React.useState(false)
  const [completingRemaining, setCompletingRemaining] = React.useState(false)
  const [exportingCount, setExportingCount] = React.useState(0)
  const [statusFilter, setStatusFilter] = React.useState<'all' | Session['status']>('all')
  const [sortMode, setSortMode] = React.useState<'newest' | 'oldest' | 'updated'>('newest')
  const [stepSearch, setStepSearch] = React.useState('')
  const [stepStatusFilter, setStepStatusFilter] = React.useState<'all' | Step['status']>('all')
  const settings = useSettingsStore((state) => state.settings)

  const activeSessionsCount = sessions.filter((item) => item.status === 'active').length
  const completedSessionsCount = sessions.filter((item) => item.status === 'completed').length
  const isExporting = exportingCount > 0

  const visibleSessions = React.useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? [...sessions]
        : sessions.filter((item) => item.status === statusFilter)

    filtered.sort((left, right) => {
      if (sortMode === 'oldest') {
        return left.createdAt.localeCompare(right.createdAt)
      }

      if (sortMode === 'updated') {
        return right.updatedAt.localeCompare(left.updatedAt)
      }

      return right.createdAt.localeCompare(left.createdAt)
    })

    return filtered
  }, [sessions, sortMode, statusFilter])

  const visibleSteps = React.useMemo(() => {
    const normalizedSearch = stepSearch.trim().toLowerCase()
    return steps.filter((step) => {
      const matchesStatus = stepStatusFilter === 'all' || step.status === stepStatusFilter
      const searchable = `${step.note} ${step.domain} ${step.pageTitle} ${step.url}`.toLowerCase()
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch)
      return matchesStatus && matchesSearch
    })
  }, [stepSearch, stepStatusFilter, steps])

  const hasStepFilter = stepSearch.trim().length > 0 || stepStatusFilter !== 'all'

  const handleOpenSession = async (sessionId: string) => {
    setOpeningSessionId(sessionId)
    try {
      await onOpenSession(sessionId)
    } finally {
      setOpeningSessionId(null)
    }
  }

  const handleDeleteSession = async (sessionId: string, sessionName: string) => {
    setDeletingSessionId(sessionId)
    try {
      await onDeleteSession(sessionId, sessionName)
    } finally {
      setDeletingSessionId((currentId) => (currentId === sessionId ? null : currentId))
    }
  }

  const handleCompleteRemainingSessions = async () => {
    setCompletingRemaining(true)
    try {
      await onCompleteRemainingSessions()
    } finally {
      setCompletingRemaining(false)
    }
  }

  const handleDeleteCompletedSessions = async () => {
    setDeletingCompleted(true)
    try {
      await onDeleteCompletedSessions()
    } finally {
      setDeletingCompleted(false)
    }
  }

  const handleExportStateChange = (exporting: boolean) => {
    setExportingCount((current) => {
      const next = current + (exporting ? 1 : -1)
      return Math.max(0, next)
    })
  }

  return (
    <Flex direction="column" gap="3">
      {!session && <StartSessionCard />}

      <Card>
        <Flex direction="column" gap="2">
          <Flex justify="between" align="center" gap="2" wrap="wrap">
            <Text size="2" weight="bold">
              Recent Sessions
            </Text>

            <Flex gap="2" align="center" wrap="wrap">
              {completedSessionsCount > 0 && (
                <Button
                  size="1"
                  color="red"
                  variant="soft"
                  onClick={() => void handleDeleteCompletedSessions()}
                  loading={deletingCompleted}
                >
                  Delete Completed ({completedSessionsCount})
                </Button>
              )}

              {activeSessionsCount > 0 && (
                <Button
                  size="1"
                  color="orange"
                  variant="soft"
                  onClick={() => void handleCompleteRemainingSessions()}
                  loading={completingRemaining}
                >
                  Complete Remaining ({activeSessionsCount})
                </Button>
              )}
            </Flex>
          </Flex>

          <Flex gap="2" wrap="wrap">
            <Select.Root value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | Session['status'])}>
              <Select.Trigger placeholder="Filter" />
              <Select.Content>
                <Select.Item value="all">All statuses</Select.Item>
                <Select.Item value="active">Active</Select.Item>
                <Select.Item value="completed">Completed</Select.Item>
                <Select.Item value="archived">Archived</Select.Item>
              </Select.Content>
            </Select.Root>

            <Select.Root value={sortMode} onValueChange={(value) => setSortMode(value as 'newest' | 'oldest' | 'updated')}>
              <Select.Trigger placeholder="Sort" />
              <Select.Content>
                <Select.Item value="newest">Newest first</Select.Item>
                <Select.Item value="oldest">Oldest first</Select.Item>
                <Select.Item value="updated">Recently updated</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>

          {visibleSessions.length === 0 && (
            <Text size="2" color="gray">
              No sessions yet.
            </Text>
          )}

          {visibleSessions.slice(0, 8).map((item) => {
            const isCurrentSession = session?.id === item.id

            return (
              <Flex key={item.id} align="center" justify="between" className="session-row">
                <Box className="session-row-content">
                  <Text size="2" weight="medium" className="session-name-text">
                    {item.name}
                  </Text>
                  <Text size="1" color="gray">
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </Box>
                <Flex gap="2" align="center">
                  <Badge color={item.status === 'active' ? 'green' : item.status === 'completed' ? 'blue' : 'gray'} variant="soft">
                    {item.status.toUpperCase()}
                  </Badge>
                  <Button
                    size="1"
                    variant={isCurrentSession ? 'solid' : 'soft'}
                    onClick={() => void handleOpenSession(item.id)}
                    loading={openingSessionId === item.id}
                  >
                    {isCurrentSession ? 'Opened' : 'Open'}
                  </Button>
                  <Button
                    size="1"
                    color="red"
                    variant="soft"
                    onClick={() => void handleDeleteSession(item.id, item.name)}
                    loading={deletingSessionId === item.id}
                  >
                    Delete
                  </Button>
                  <Button
                    size="1"
                    color="gray"
                    variant="soft"
                    onClick={() => void onArchiveSession(item.id, item.status === 'archived' ? 'completed' : 'archived')}
                  >
                    {item.status === 'archived' ? 'Restore' : 'Archive'}
                  </Button>
                </Flex>
              </Flex>
            )
          })}
        </Flex>
      </Card>

      {session && (
        <Flex direction="column" gap="3" className="session-layout">
          <SessionHeader key={`${session.id}-${session.updatedAt}`} session={session} />

          <SessionCollaborationPanel
            session={session}
            steps={steps}
            onImported={onBackupImported}
            onStatus={onStatus}
          />

          <Card>
            <Flex gap="2" align="center" wrap="wrap">
              <TextField.Root
                value={stepSearch}
                onChange={(event) => setStepSearch(event.target.value)}
                placeholder="Search steps"
              />
              <Select.Root value={stepStatusFilter} onValueChange={(value) => setStepStatusFilter(value as 'all' | Step['status'])}>
                <Select.Trigger placeholder="Step status" />
                <Select.Content>
                  <Select.Item value="all">All steps</Select.Item>
                  <Select.Item value="unset">Unset</Select.Item>
                  <Select.Item value="pass">Pass</Select.Item>
                  <Select.Item value="fail">Fail</Select.Item>
                  <Select.Item value="warning">Warning</Select.Item>
                  <Select.Item value="info">Info</Select.Item>
                </Select.Content>
              </Select.Root>
              {hasStepFilter && (
                <Text size="1" color="gray">
                  Showing {visibleSteps.length} of {steps.length}
                </Text>
              )}
            </Flex>
          </Card>

          <Box className="session-main-grid">
            <Box className="session-timeline">
              <Timeline
                steps={visibleSteps}
                selectedStepId={selectedStep?.id ?? null}
                onSelect={(id) => onSelectStep(id)}
                onReorder={
                  session && !hasStepFilter
                    ? async (orderedStepIds) => {
                        await onReorderSteps(session.id, orderedStepIds)
                      }
                    : undefined
                }
                disabled={isExporting}
                layout={settings?.ui.timelineLayout ?? 'vertical'}
              />
            </Box>

            <Box className="session-editor">
              <StepEditor
                key={selectedStep?.id ?? 'empty-step'}
                step={selectedStep}
                previousStep={previousSelectedStep}
                onDeleteStep={onDeleteStep}
                onDuplicateStep={onDuplicateStep}
                disabled={isExporting}
              />
            </Box>
          </Box>

          <Flex justify="between" align="center" gap="2" wrap="wrap">
            <Flex gap="2" align="center" wrap="wrap">
              <Button variant="soft" color="gray" onClick={() => onSelectStep(null)} disabled={isExporting}>
                Clear Step Selection
              </Button>

              {undoDeletedStep && (
                <Button color="orange" variant="soft" onClick={() => void onUndoDeleteStep()} disabled={isExporting}>
                  Undo Delete
                </Button>
              )}

              {session.status === 'active' && (
                <Button variant="soft" onClick={() => void onAddManualStep(session.id)} disabled={isExporting}>
                  Add Manual Step
                </Button>
              )}
            </Flex>

            <Flex gap="2" align="center" wrap="wrap">
              <Button variant="soft" onClick={onCloseSessionView}>
                Back to Sessions List
              </Button>

              <ExportDocxButton
                session={session}
                steps={steps}
                onExportStateChange={handleExportStateChange}
              />
              <ExportPdfButton
                session={session}
                steps={steps}
                onExportStateChange={handleExportStateChange}
              />
            </Flex>
          </Flex>

          {isExporting && (
            <Text size="2" color="gray">
              Export in progress. Step edits are temporarily locked.
            </Text>
          )}
        </Flex>
      )}
    </Flex>
  )
}

export default App
