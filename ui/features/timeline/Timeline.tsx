import { Flex, Text } from '@radix-ui/themes'
import * as React from 'react'
import type { Step } from '../../../types/step'
import StepCard from './StepCard'

interface TimelineProps {
  steps: Step[]
  selectedStepId: string | null
  onSelect: (stepId: string) => void
  onReorder?: (orderedStepIds: string[]) => Promise<void>
  disabled?: boolean
  layout?: 'vertical' | 'grid'
}

function Timeline({ steps, selectedStepId, onSelect, onReorder, disabled = false, layout = 'vertical' }: TimelineProps) {
  const [draggingStepId, setDraggingStepId] = React.useState<string | null>(null)
  const selectedStepRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const selectedStepElement = selectedStepRef.current
    if (!selectedStepElement) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      selectedStepElement.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [selectedStepId, steps.length])

  const handleDrop = async (targetStepId: string) => {
    if (!draggingStepId || draggingStepId === targetStepId || !onReorder) {
      setDraggingStepId(null)
      return
    }

    const orderedStepIds = steps.map((step) => step.id)
    const fromIndex = orderedStepIds.indexOf(draggingStepId)
    const toIndex = orderedStepIds.indexOf(targetStepId)

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingStepId(null)
      return
    }

    orderedStepIds.splice(fromIndex, 1)
    orderedStepIds.splice(toIndex, 0, draggingStepId)

    setDraggingStepId(null)
    await onReorder(orderedStepIds)
  }

  if (steps.length === 0) {
    return (
      <Flex className="timeline-empty" align="center" justify="center" p="5">
        <Text size="2" color="gray">
          No steps captured yet. Use your capture hotkeys to start.
        </Text>
      </Flex>
    )
  }

  return (
    <div className="timeline-scroll">
      <Flex role="list" direction="column" gap="2" className={`timeline-list ${layout === 'grid' ? 'timeline-grid' : ''}`}>
        {steps.map((step) => (
          <div
            key={step.id}
            ref={selectedStepId === step.id ? selectedStepRef : undefined}
            role="listitem"
            draggable={!disabled}
            onDragStart={() => setDraggingStepId(step.id)}
            onDragEnd={() => setDraggingStepId(null)}
            onDragOver={(event) => {
              if (!disabled) {
                event.preventDefault()
              }
            }}
            onDrop={() => {
              if (!disabled) {
                void handleDrop(step.id)
              }
            }}
            className={draggingStepId === step.id ? 'step-card-dragging' : undefined}
          >
            <StepCard step={step} selected={selectedStepId === step.id} onSelect={onSelect} />
          </div>
        ))}
      </Flex>
    </div>
  )
}

export default Timeline
