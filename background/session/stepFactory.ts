import { createId } from '../utils/idGen'
import type { ConsoleEntry } from '../../types/console'
import type { NetworkEntry } from '../../types/network'
import type { CaptureMode, RegionBounds, Step } from '../../types/step'
import type { TabInfo } from '../../types/tabInfo'

interface CreateStepArgs {
  sessionId: string
  stepNumber: number
  tabInfo: TabInfo
  screenshotId: string | null
  captureMode: CaptureMode
  note?: string
  regionBounds?: RegionBounds
  networkEntries?: NetworkEntry[]
  consoleEntries?: ConsoleEntry[]
}

export class StepFactory {
  public create(args: CreateStepArgs): Step {
    return {
      id: createId(),
      sessionId: args.sessionId,
      stepNumber: args.stepNumber,
      timestamp: new Date().toISOString(),
      url: args.tabInfo.url,
      domain: args.tabInfo.domain,
      pageTitle: args.tabInfo.pageTitle,
      browserInfo: args.tabInfo.browserInfo,
      windowSize: args.tabInfo.windowSize,
      screenshotId: args.screenshotId,
      captureMode: args.captureMode,
      regionBounds: args.regionBounds,
      note: args.note ?? '',
      status: 'unset',
      networkEntries: args.networkEntries ?? [],
      consoleEntries: args.consoleEntries ?? [],
      annotations: [],
    }
  }
}
