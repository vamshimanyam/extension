import type { TabInfo } from '../../types/tabInfo'

export class TabInfoService {
  public async getActiveTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab || tab.id == null || !tab.url) {
      throw new Error('No active tab is available for capture')
    }

    return tab
  }

  public async getTabInfo(tab: chrome.tabs.Tab): Promise<TabInfo> {
    if (tab.id == null || !tab.url) {
      throw new Error('Missing tab information')
    }

    const windowInfo = await chrome.windows.get(tab.windowId)
    const url = tab.url

    return {
      url,
      domain: this.safeDomain(url),
      pageTitle: tab.title ?? 'Untitled page',
      browserInfo: this.getBrowserInfo(),
      windowSize: {
        width: windowInfo.width ?? 0,
        height: windowInfo.height ?? 0,
      },
    }
  }

  private getBrowserInfo(): { name: string; version: string } {
    const userAgent = navigator.userAgent
    const browserName = userAgent.includes('Edg')
      ? 'Edge'
      : userAgent.includes('Brave')
        ? 'Brave'
        : userAgent.includes('Chrome')
          ? 'Chrome'
          : 'Browser'
    const versionMatch = userAgent.match(/(Chrome|Edg|Brave)\/(\d+(?:\.\d+)?)/)

    return {
      name: browserName,
      version: versionMatch?.[2] ?? 'unknown',
    }
  }

  private safeDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return 'unknown'
    }
  }
}
