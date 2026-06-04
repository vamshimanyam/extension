import type { ConsoleEntry } from './console'
import type { NetworkEntry } from './network'

export type StepStatus = 'pass' | 'fail' | 'warning' | 'info' | 'unset'
export type CaptureMode = 'silent' | 'note' | 'tech' | 'region' | 'manual'

export interface RegionBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Annotation {
  id: string
  type: 'arrow' | 'rect' | 'circle' | 'text' | 'blur'
  color: string
  coords: {
    x: number
    y: number
    width?: number
    height?: number
    endX?: number
    endY?: number
  }
  text?: string
}

export interface StepBrowserInfo {
  name: string
  version: string
}

export interface StepWindowSize {
  width: number
  height: number
}

export interface Step {
  id: string
  sessionId: string
  stepNumber: number
  timestamp: string
  url: string
  domain: string
  pageTitle: string
  browserInfo: StepBrowserInfo
  windowSize: StepWindowSize
  screenshotId: string | null
  captureMode: CaptureMode
  regionBounds?: RegionBounds
  note: string
  status: StepStatus
  networkEntries: NetworkEntry[]
  consoleEntries: ConsoleEntry[]
  annotations: Annotation[]
}
