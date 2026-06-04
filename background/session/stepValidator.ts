import type { Step } from '../../types/step'

export class StepValidator {
  public validate(step: Step): void {
    if (!step.id) {
      throw new Error('Step id is required')
    }

    if (!step.sessionId) {
      throw new Error('Step sessionId is required')
    }

    if (step.stepNumber < 1) {
      throw new Error('Step number must be >= 1')
    }

    if (!step.url) {
      throw new Error('Step url is required')
    }

    if (!step.domain) {
      throw new Error('Step domain is required')
    }

    if (!step.timestamp) {
      throw new Error('Step timestamp is required')
    }
  }
}
