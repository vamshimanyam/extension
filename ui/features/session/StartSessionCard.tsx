import { Button, Card, Flex, Text, TextField } from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../../messaging/client'
import useSettingsStore from '../../store/useSettingsStore'

function StartSessionCard() {
  const settings = useSettingsStore((state) => state.settings)
  const [sessionName, setSessionName] = React.useState('')
  const [environment, setEnvironment] = React.useState(settings?.session.defaultEnvironment ?? '')
  const [testerName, setTesterName] = React.useState(settings?.session.defaultTesterName ?? '')
  const [starting, setStarting] = React.useState(false)

  const handleStartSession = async () => {
    setStarting(true)
    try {
      await sendMessage('START_SESSION', {
        name: sessionName.trim() || undefined,
        environment: environment.trim() || undefined,
        testerName: testerName.trim() || undefined,
      })
      setSessionName('')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Text size="3" weight="bold">
          Start a QA Session
        </Text>
        <Text size="2" color="gray">
          Start a session, then use hotkeys to capture steps directly from any tab.
        </Text>

        <TextField.Root
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
          placeholder="Optional session name"
        />

        <TextField.Root
          value={environment}
          onChange={(event) => setEnvironment(event.target.value)}
          placeholder="Environment"
        />

        <TextField.Root
          value={testerName}
          onChange={(event) => setTesterName(event.target.value)}
          placeholder="Tester name"
        />

        <Button onClick={() => void handleStartSession()} loading={starting}>
          Start Session
        </Button>
      </Flex>
    </Card>
  )
}

export default StartSessionCard
