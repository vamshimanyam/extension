export interface NetworkEntry {
  id: string
  method: string
  url: string
  urlPath: string
  statusCode: number
  statusText: string
  durationMs: number
  requestBodySize: number
  responseBodySize: number
  contentType: string
  initiator: string
  timestamp: string
  tabId: number
  domain: string
  navigationId: number
}
