import { BUFFER_LIMITS } from '../../config/constants'
import type { ConsoleEntry, ConsoleLevel } from '../../types/console'
import type { NetworkEntry } from '../../types/network'
import { SettingsRepo } from '../storage/settingsRepo'
import { createId } from '../utils/idGen'

interface TabBuffer {
  navigationId: number
  networkEntries: NetworkEntry[]
  consoleEntries: ConsoleEntry[]
  lastConsoleEntry?: {
    key: string
    timestamp: number
  }
}

interface PendingRequest {
  tabId: number
  url: string
  method: string
  initiatedAt: number
  initiator: string
  requestBodySize: number
}

export interface ConsoleBridgePayload {
  level: ConsoleLevel
  message: string
  source?: string
  timestamp?: string
}

export class TechDataBuffer {
  private readonly buffersByTab = new Map<number, TabBuffer>()

  private readonly pendingRequestsById = new Map<string, PendingRequest>()

  private networkMax: number = BUFFER_LIMITS.default

  private consoleMax: number = BUFFER_LIMITS.default

  private readonly settingsRepo: SettingsRepo

  public constructor(settingsRepo: SettingsRepo) {
    this.settingsRepo = settingsRepo
  }

  public async syncLimits(): Promise<void> {
    const settings = await this.settingsRepo.get()
    this.networkMax = this.clampBufferLimit(settings.buffers.networkMax)
    this.consoleMax = this.clampBufferLimit(settings.buffers.consoleMax)
  }

  public markNavigation(tabId: number): void {
    if (tabId < 0) {
      return
    }

    const buffer = this.getOrCreateBuffer(tabId)
    buffer.navigationId += 1

    const minNavigationIdToKeep = Math.max(1, buffer.navigationId - 1)
    buffer.networkEntries = buffer.networkEntries.filter(
      (entry) => entry.navigationId >= minNavigationIdToKeep
    )
  }

  public removeTab(tabId: number): void {
    this.buffersByTab.delete(tabId)

    for (const [requestId, pendingRequest] of this.pendingRequestsById) {
      if (pendingRequest.tabId === tabId) {
        this.pendingRequestsById.delete(requestId)
      }
    }
  }

  public trackBeforeRequest(details: chrome.webRequest.OnBeforeRequestDetails): void {
    if (details.tabId < 0 || !this.shouldTrackUrl(details.url)) {
      return
    }

    const requestBodySize =
      details.requestBody?.raw?.reduce((total: number, part: chrome.webRequest.UploadData) => {
        return total + (part.bytes ? part.bytes.byteLength : 0)
      }, 0) ?? 0

    this.pendingRequestsById.set(details.requestId, {
      tabId: details.tabId,
      url: details.url,
      method: details.method || 'GET',
      initiatedAt: details.timeStamp,
      initiator: details.initiator || 'unknown',
      requestBodySize,
    })
  }

  public trackRequestCompleted(details: chrome.webRequest.OnCompletedDetails): void {
    if (details.tabId < 0 || !this.shouldTrackUrl(details.url)) {
      return
    }

    const pendingRequest = this.pendingRequestsById.get(details.requestId)
    const buffer = this.getOrCreateBuffer(details.tabId)
    const startedAt = pendingRequest?.initiatedAt ?? details.timeStamp
    const durationMs = Math.max(0, Math.round(details.timeStamp - startedAt))

    const networkEntry: NetworkEntry = {
      id: createId(),
      method: pendingRequest?.method ?? details.method ?? 'GET',
      url: pendingRequest?.url ?? details.url,
      urlPath: this.safeUrlPath(details.url),
      statusCode: details.statusCode,
      statusText: String(details.statusCode),
      durationMs,
      requestBodySize: pendingRequest?.requestBodySize ?? 0,
      responseBodySize: this.extractResponseSize(details.responseHeaders),
      contentType: this.extractContentType(details.responseHeaders),
      initiator: pendingRequest?.initiator ?? details.initiator ?? 'unknown',
      timestamp: new Date(details.timeStamp).toISOString(),
      tabId: details.tabId,
      domain: this.safeDomain(details.url),
      navigationId: buffer.navigationId,
    }

    buffer.networkEntries.unshift(networkEntry)
    this.pendingRequestsById.delete(details.requestId)
    this.trimBufferEntries(buffer)
  }

  public trackRequestError(details: chrome.webRequest.OnErrorOccurredDetails): void {
    if (details.tabId < 0 || !this.shouldTrackUrl(details.url)) {
      return
    }

    const pendingRequest = this.pendingRequestsById.get(details.requestId)
    const buffer = this.getOrCreateBuffer(details.tabId)
    const startedAt = pendingRequest?.initiatedAt ?? details.timeStamp
    const durationMs = Math.max(0, Math.round(details.timeStamp - startedAt))

    const networkEntry: NetworkEntry = {
      id: createId(),
      method: pendingRequest?.method ?? details.method ?? 'GET',
      url: pendingRequest?.url ?? details.url,
      urlPath: this.safeUrlPath(details.url),
      statusCode: 0,
      statusText: details.error || 'NETWORK_ERROR',
      durationMs,
      requestBodySize: pendingRequest?.requestBodySize ?? 0,
      responseBodySize: 0,
      contentType: 'unknown',
      initiator: pendingRequest?.initiator ?? details.initiator ?? 'unknown',
      timestamp: new Date(details.timeStamp).toISOString(),
      tabId: details.tabId,
      domain: this.safeDomain(details.url),
      navigationId: buffer.navigationId,
    }

    buffer.networkEntries.unshift(networkEntry)
    this.pendingRequestsById.delete(details.requestId)
    this.trimBufferEntries(buffer)
  }

  public trackConsoleEntry(tabId: number, payload: ConsoleBridgePayload): void {
    if (tabId < 0) {
      return
    }

    const buffer = this.getOrCreateBuffer(tabId)
    const normalizedMessage = payload.message.trim()

    if (!normalizedMessage) {
      return
    }

    const dedupeKey = `${payload.level}:${normalizedMessage}`
    const now = Date.now()
    if (buffer.lastConsoleEntry?.key === dedupeKey && now - buffer.lastConsoleEntry.timestamp < 100) {
      return
    }

    buffer.lastConsoleEntry = {
      key: dedupeKey,
      timestamp: now,
    }

    const consoleEntry: ConsoleEntry = {
      id: createId(),
      level: payload.level,
      message: normalizedMessage.slice(0, 500),
      fullMessage: normalizedMessage,
      source: payload.source || 'page',
      timestamp: payload.timestamp ?? new Date().toISOString(),
      tabId,
    }

    buffer.consoleEntries.unshift(consoleEntry)
    this.trimBufferEntries(buffer)
  }

  public getBuffer(tabId: number): {
    networkEntries: NetworkEntry[]
    consoleEntries: ConsoleEntry[]
  } {
    const buffer = this.buffersByTab.get(tabId)

    if (!buffer) {
      return {
        networkEntries: [],
        consoleEntries: [],
      }
    }

    return {
      networkEntries: [...buffer.networkEntries],
      consoleEntries: [...buffer.consoleEntries],
    }
  }

  private getOrCreateBuffer(tabId: number): TabBuffer {
    const existingBuffer = this.buffersByTab.get(tabId)
    if (existingBuffer) {
      return existingBuffer
    }

    const newBuffer: TabBuffer = {
      navigationId: 1,
      networkEntries: [],
      consoleEntries: [],
    }

    this.buffersByTab.set(tabId, newBuffer)
    return newBuffer
  }

  private trimBufferEntries(buffer: TabBuffer): void {
    if (buffer.networkEntries.length > this.networkMax) {
      buffer.networkEntries.length = this.networkMax
    }

    if (buffer.consoleEntries.length > this.consoleMax) {
      buffer.consoleEntries.length = this.consoleMax
    }
  }

  private clampBufferLimit(value: number): number {
    if (!Number.isFinite(value)) {
      return BUFFER_LIMITS.default
    }

    return Math.max(BUFFER_LIMITS.min, Math.min(BUFFER_LIMITS.max, Math.round(value)))
  }

  private extractContentType(
    responseHeaders: chrome.webRequest.HttpHeader[] | undefined
  ): string {
    if (!responseHeaders || responseHeaders.length === 0) {
      return 'unknown'
    }

    const contentTypeHeader = responseHeaders.find(
      (header) => header.name.toLowerCase() === 'content-type'
    )

    return contentTypeHeader?.value || 'unknown'
  }

  private extractResponseSize(responseHeaders: chrome.webRequest.HttpHeader[] | undefined): number {
    if (!responseHeaders || responseHeaders.length === 0) {
      return 0
    }

    const contentLengthHeader = responseHeaders.find(
      (header) => header.name.toLowerCase() === 'content-length'
    )
    const parsed = Number(contentLengthHeader?.value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }

  private safeDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return 'unknown'
    }
  }

  private safeUrlPath(url: string): string {
    try {
      const parsed = new URL(url)
      const query = parsed.search || ''
      return `${parsed.pathname}${query}`
    } catch {
      return url
    }
  }

  private isHttpUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://')
  }

  private shouldTrackUrl(url: string): boolean {
    if (!this.isHttpUrl(url)) {
      return false
    }

    return !this.isAssetUrl(url)
  }

  private isAssetUrl(url: string): boolean {
    return [
      /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|css|map)(\?.*)?$/i,
      /\/(favicon|robots\.txt)(\?.*)?$/i,
      /google-analytics/i,
      /analytics\./i,
      /hotjar\./i,
    ].some((pattern) => pattern.test(url))
  }
}
