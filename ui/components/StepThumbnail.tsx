import { Box, Text } from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../messaging/client'

interface StepThumbnailProps {
  screenshotId: string | null
}

function StepThumbnail({ screenshotId }: StepThumbnailProps) {
  const [src, setSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    const loadScreenshot = async () => {
      if (!screenshotId) {
        setSrc(null)
        return
      }

      const response = await sendMessage('GET_SCREENSHOT', { screenshotId })
      if (!active || !response.screenshot) {
        setSrc(null)
        return
      }

      setSrc(response.screenshot.dataUrl)
    }

    void loadScreenshot().catch(() => {
      if (active) {
        setSrc(null)
      }
    })

    return () => {
      active = false
    }
  }, [screenshotId])

  if (!src) {
    return (
      <Box className="step-thumbnail placeholder" p="2">
        <Text size="1" color="gray">
          No screenshot
        </Text>
      </Box>
    )
  }

  return (
    <Box className="step-thumbnail">
      <img src={src} alt="Step screenshot" loading="lazy" />
    </Box>
  )
}

export default StepThumbnail
