import { Badge, Card, Flex, Text } from '@radix-ui/themes'
import type { Step } from '../../../types/step'
import StepThumbnail from '../../components/StepThumbnail'

interface StepCardProps {
  step: Step
  selected: boolean
  onSelect: (stepId: string) => void
}

const STATUS_COLOR: Record<Step['status'], 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  unset: 'gray',
  pass: 'green',
  fail: 'red',
  warning: 'amber',
  info: 'blue',
}

function StepCard({ step, selected, onSelect }: StepCardProps) {
  return (
    <Card className={`step-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(step.id)}>
      <Flex direction="column" gap="2" align="stretch">
        <StepThumbnail screenshotId={step.screenshotId} />

        <Flex direction="column" gap="2" className="step-card-content">
          <Flex gap="2" align="center" wrap="wrap">
            <Text size="2" weight="bold">
              Step {step.stepNumber}
            </Text>
            <Badge color={STATUS_COLOR[step.status]} variant="soft">
              {step.status.toUpperCase()}
            </Badge>
            <Text size="1" color="gray">
              {new Date(step.timestamp).toLocaleTimeString()}
            </Text>
          </Flex>

          <Text size="1" color="gray">
            {step.domain}
          </Text>

          <Text size="2" className="step-note-preview">
            {step.note || 'No note added yet.'}
          </Text>
        </Flex>
      </Flex>
    </Card>
  )
}

export default StepCard
