import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  ScrollArea,
  Separator,
  Text,
} from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../../messaging/client'
import type { ConsoleEntry } from '../../../types/console'
import type { NetworkEntry } from '../../../types/network'

interface TechDataPickerProps {
  open: boolean
  stepId: string | null
  tabId: number | null
  onOpenChange: (open: boolean) => void
  onAttached: (counts: { network: number; console: number }) => void
}

function TechDataPicker({ open, stepId, tabId, onOpenChange, onAttached }: TechDataPickerProps) {
  const [loading, setLoading] = React.useState(false)
  const [attaching, setAttaching] = React.useState(false)
  const [networkEntries, setNetworkEntries] = React.useState<NetworkEntry[]>([])
  const [consoleEntries, setConsoleEntries] = React.useState<ConsoleEntry[]>([])
  const [selectedNetworkIds, setSelectedNetworkIds] = React.useState<Set<string>>(new Set())
  const [selectedConsoleIds, setSelectedConsoleIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!open || !stepId || tabId == null) {
      return
    }

    let active = true

    const loadBuffer = async () => {
      setLoading(true)

      try {
        const response = await sendMessage('GET_TECH_BUFFER', { tabId })

        if (!active) {
          return
        }

        setNetworkEntries(response.networkEntries)
        setConsoleEntries(response.consoleEntries)

        const failedNetworkIds = response.networkEntries
          .filter((entry) => entry.statusCode >= 400 || entry.statusCode === 0)
          .map((entry) => entry.id)

        const errorConsoleIds = response.consoleEntries
          .filter((entry) => entry.level === 'error')
          .map((entry) => entry.id)

        setSelectedNetworkIds(new Set(failedNetworkIds))
        setSelectedConsoleIds(new Set(errorConsoleIds))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadBuffer().catch(() => {
      if (!active) {
        return
      }

      setNetworkEntries([])
      setConsoleEntries([])
      setSelectedNetworkIds(new Set())
      setSelectedConsoleIds(new Set())
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [open, stepId, tabId])

  const toggleNetworkSelection = (entryId: string) => {
    setSelectedNetworkIds((current) => {
      const next = new Set(current)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const toggleConsoleSelection = (entryId: string) => {
    setSelectedConsoleIds((current) => {
      const next = new Set(current)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const handleAttach = async () => {
    if (!stepId) {
      return
    }

    setAttaching(true)

    try {
      const selectedNetworkEntries = networkEntries.filter((entry) => selectedNetworkIds.has(entry.id))
      const selectedConsoleEntries = consoleEntries.filter((entry) => selectedConsoleIds.has(entry.id))

      await sendMessage('ATTACH_TECH_DATA_TO_STEP', {
        stepId,
        networkEntries: selectedNetworkEntries,
        consoleEntries: selectedConsoleEntries,
      })

      onAttached({
        network: selectedNetworkEntries.length,
        console: selectedConsoleEntries.length,
      })

      onOpenChange(false)
    } finally {
      setAttaching(false)
    }
  }

  const totalSelected = selectedNetworkIds.size + selectedConsoleIds.size

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="760px">
        <Dialog.Title>Attach Technical Data</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Select buffered network and console entries to attach to this step.
        </Dialog.Description>

        <Flex direction="column" gap="3" mt="3">
          <Flex justify="between" align="center" wrap="wrap" gap="2">
            <Text size="2" weight="medium">
              Network Requests
            </Text>
            <Badge color="gray" variant="soft">
              {selectedNetworkIds.size} selected
            </Badge>
          </Flex>

          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 180 }}>
            <Flex direction="column" gap="2">
              {networkEntries.map((entry) => (
                <Flex key={entry.id} align="start" gap="2" className="hotkey-row">
                  <Checkbox
                    checked={selectedNetworkIds.has(entry.id)}
                    onCheckedChange={() => toggleNetworkSelection(entry.id)}
                  />
                  <Box style={{ minWidth: 0 }}>
                    <Text size="2" style={{ display: 'block' }}>
                      {entry.method} {entry.urlPath}
                    </Text>
                    <Text size="1" color="gray">
                      {entry.statusCode === 0 ? entry.statusText : `${entry.statusCode}`} • {entry.durationMs}ms
                    </Text>
                  </Box>
                </Flex>
              ))}

              {!loading && networkEntries.length === 0 && (
                <Text size="2" color="gray">
                  No buffered network requests found.
                </Text>
              )}
            </Flex>
          </ScrollArea>

          <Separator size="4" />

          <Flex justify="between" align="center" wrap="wrap" gap="2">
            <Text size="2" weight="medium">
              Console Entries
            </Text>
            <Badge color="gray" variant="soft">
              {selectedConsoleIds.size} selected
            </Badge>
          </Flex>

          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 180 }}>
            <Flex direction="column" gap="2">
              {consoleEntries.map((entry) => (
                <Flex key={entry.id} align="start" gap="2" className="hotkey-row">
                  <Checkbox
                    checked={selectedConsoleIds.has(entry.id)}
                    onCheckedChange={() => toggleConsoleSelection(entry.id)}
                  />
                  <Box style={{ minWidth: 0 }}>
                    <Text size="2" style={{ display: 'block' }}>
                      {entry.level.toUpperCase()}: {entry.message}
                    </Text>
                    <Text size="1" color="gray">
                      {new Date(entry.timestamp).toLocaleTimeString()} • {entry.source}
                    </Text>
                  </Box>
                </Flex>
              ))}

              {!loading && consoleEntries.length === 0 && (
                <Text size="2" color="gray">
                  No buffered console entries found.
                </Text>
              )}
            </Flex>
          </ScrollArea>

          <Flex justify="between" align="center" wrap="wrap" gap="2">
            <Text size="2" color="gray">
              {loading ? 'Loading technical data…' : `${totalSelected} total entries selected`}
            </Text>
            <Flex gap="2">
              <Button variant="soft" color="gray" onClick={() => onOpenChange(false)} disabled={attaching}>
                Skip
              </Button>
              <Button onClick={() => void handleAttach()} loading={attaching} disabled={loading}>
                Attach Selected
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

export default TechDataPicker
