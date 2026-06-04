export interface TabInfo {
  url: string
  domain: string
  pageTitle: string
  browserInfo: {
    name: string
    version: string
  }
  windowSize: {
    width: number
    height: number
  }
}
