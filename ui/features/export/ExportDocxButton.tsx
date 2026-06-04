import { Download } from 'lucide-react'
import { Button, Flex, Text } from '@radix-ui/themes'
import * as React from 'react'
import { DEFAULT_SETTINGS } from '../../../config/constants'
import type { Session } from '../../../types/session'
import type { Step } from '../../../types/step'
import useSettingsStore from '../../store/useSettingsStore'

interface ExportDocxButtonProps {
  session: Session
  steps: Step[]
  onExportStateChange?: (exporting: boolean) => void
}

function ExportDocxButton({ session, steps, onExportStateChange }: ExportDocxButtonProps) {
  const settings = useSettingsStore((state) => state.settings)
  const [exporting, setExporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    onExportStateChange?.(true)
    setError(null)

    try {
      const { exportSessionToDocx } = await import('./docxExporter')
      await exportSessionToDocx(session, steps, settings?.export ?? DEFAULT_SETTINGS.export)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError))
    } finally {
      setExporting(false)
      onExportStateChange?.(false)
    }
  }

  return (
    <Flex direction="column" gap="2">
      <Button variant="soft" color="green" onClick={() => void handleExport()} loading={exporting}>
        <Download size={14} />
        Export DOCX
      </Button>
      {error && (
        <Text size="1" color="red">
          Export failed: {error}
        </Text>
      )}
    </Flex>
  )
}

export default ExportDocxButton
