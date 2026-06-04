import { Badge, Button, Card, Flex, Text, TextField } from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../../messaging/client'
import type { Session } from '../../../types/session'

interface SessionHeaderProps {
  session: Session
}

function SessionHeader({ session }: SessionHeaderProps) {
  const isActiveSession = session.status === 'active'
  const [name, setName] = React.useState(session.name)
  const [environment, setEnvironment] = React.useState(session.environment ?? '')
  const [testerName, setTesterName] = React.useState(session.testerName ?? '')
  const [tags, setTags] = React.useState(session.tags.join(', '))
  const [saving, setSaving] = React.useState(false)

  const handleEndSession = async () => {
    await sendMessage('END_SESSION', { sessionId: session.id })
  }

  const handleSaveMetadata = async () => {
    setSaving(true)
    try {
      await sendMessage('UPDATE_SESSION', {
        sessionId: session.id,
        updates: {
          name: name.trim() || session.name,
          environment: environment.trim() || undefined,
          testerName: testerName.trim() || undefined,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="3" weight="bold">
            {session.name}
          </Text>
          <Flex gap="2" align="center" wrap="wrap">
            <Badge
              color={session.status === 'active' ? 'green' : session.status === 'completed' ? 'blue' : 'gray'}
              variant="soft"
            >
              {session.status.toUpperCase()}
            </Badge>
            <Text size="1" color="gray">
              {session.stepCount} steps
            </Text>
            <Text size="1" color="gray">
              {new Date(session.createdAt).toLocaleString()}
            </Text>
            {session.completedAt && !isActiveSession && (
              <Text size="1" color="gray">
                Completed {new Date(session.completedAt).toLocaleString()}
              </Text>
            )}
          </Flex>
        </Flex>

        {isActiveSession && (
          <Button color="orange" variant="soft" onClick={() => void handleEndSession()}>
            End Session
          </Button>
        )}
        </Flex>

        <Flex gap="2" wrap="wrap" align="center">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} placeholder="Session name" />
          <TextField.Root value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="Environment" />
          <TextField.Root value={testerName} onChange={(event) => setTesterName(event.target.value)} placeholder="Tester" />
          <TextField.Root value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, comma separated" />
          <Button size="2" variant="soft" onClick={() => void handleSaveMetadata()} loading={saving}>
            Save Details
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

export default SessionHeader
