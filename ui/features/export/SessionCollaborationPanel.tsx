import { Button, Card, Flex, Text } from '@radix-ui/themes'
import { Download, ExternalLink, FileUp, MessageSquare, ClipboardList } from 'lucide-react'
import * as React from 'react'
import { DEFAULT_SETTINGS } from '../../../config/constants'
import type { SessionImportResult } from '../../../types/backup'
import type { Session } from '../../../types/session'
import type { Step } from '../../../types/step'
import useSettingsStore from '../../store/useSettingsStore'
import {
  buildJiraDescription,
  buildSlackSummary,
  copyTextToClipboard,
  exportSessionBackup,
  importSessionBackupFile,
  openJiraIssue,
} from './backupExporter'

interface SessionCollaborationPanelProps {
  session: Session
  steps: Step[]
  onImported: (result: SessionImportResult) => Promise<void>
  onStatus: (message: string) => void
}

function SessionCollaborationPanel({ session, steps, onImported, onStatus }: SessionCollaborationPanelProps) {
  const settings = useSettingsStore((state) => state.settings) ?? DEFAULT_SETTINGS
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [working, setWorking] = React.useState(false)

  const runAction = async (action: () => Promise<void>) => {
    setWorking(true)
    try {
      await action()
    } finally {
      setWorking(false)
    }
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (!file) {
      return
    }

    await runAction(async () => {
      const result = await importSessionBackupFile(file)
      await onImported(result)
      onStatus(result.merged ? `Merged ${result.importedStepCount} imported steps.` : `Imported ${result.importedStepCount} steps.`)
    })
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Text size="2" weight="bold">
            Backup and Handoff
          </Text>
          <Text size="1" color="gray">
            JSON backups include screenshots and can be merged back into this browser.
          </Text>
        </Flex>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.qa-session.json"
          className="sr-only"
          onChange={(event) => void handleImportFile(event)}
        />

        <Flex gap="2" wrap="wrap">
          <Button variant="soft" onClick={() => void runAction(() => exportSessionBackup(session, steps))} disabled={working}>
            <Download size={14} />
            JSON Backup
          </Button>

          <Button variant="soft" color="gray" onClick={() => fileInputRef.current?.click()} disabled={working}>
            <FileUp size={14} />
            Import or Merge
          </Button>

          <Button
            variant="soft"
            color="orange"
            onClick={() => void runAction(async () => {
              await copyTextToClipboard(buildJiraDescription(session, steps))
              onStatus('Jira issue text copied.')
            })}
            disabled={working}
          >
            <ClipboardList size={14} />
            Copy Jira Text
          </Button>

          <Button
            variant="soft"
            color="orange"
            onClick={() => {
              const opened = openJiraIssue(settings, session, steps)
              onStatus(opened ? 'Opening Jira issue draft.' : 'Add Jira base URL and project key in Settings first.')
            }}
            disabled={working}
          >
            <ExternalLink size={14} />
            Open Jira
          </Button>

          <Button
            variant="soft"
            color="blue"
            onClick={() => void runAction(async () => {
              await copyTextToClipboard(buildSlackSummary(session, steps, settings.integrations.slackChannel))
              onStatus('Slack summary copied.')
            })}
            disabled={working}
          >
            <MessageSquare size={14} />
            Copy Slack
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

export default SessionCollaborationPanel