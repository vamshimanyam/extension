import { Box, Text } from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../../messaging/client'

interface SessionListThumbnailProps {
  sessionId: string
}

function SessionListThumbnail({ sessionId }: SessionListThumbnailProps) {
  const [src, setSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    const loadThumbnail = async () => {
      const detailResponse = await sendMessage('GET_SESSION_DETAIL', { sessionId })
      const firstScreenshotStep = detailResponse.steps.find((step) => Boolean(step.screenshotId))

      if (!active || !firstScreenshotStep?.screenshotId) {
        setSrc(null)
        return
      }

      const screenshotResponse = await sendMessage('GET_SCREENSHOT', {
        screenshotId: firstScreenshotStep.screenshotId,
      })

      if (!active || !screenshotResponse.screenshot?.dataUrl) {
        setSrc(null)
        return
      }

      setSrc(screenshotResponse.screenshot.dataUrl)
    }

    void loadThumbnail().catch(() => {
      if (active) {
        setSrc(null)
      }
    })

    return () => {
      active = false
    }
  }, [sessionId])

  if (!src) {
    return (
      <Box className="session-list-thumbnail placeholder">
        <Text size="1" color="gray">
          N/A
        </Text>
      </Box>
    )
  }

  return (
    <Box className="session-list-thumbnail">
      <img src={src} alt="Session thumbnail" loading="lazy" />
    </Box>
  )
}

export default SessionListThumbnail
