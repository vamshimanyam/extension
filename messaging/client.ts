import type {
  RuntimeEventMap,
  RuntimeEventMessage,
  RuntimeRequestMap,
  RuntimeRequestMessage,
  RuntimeRequestType,
  RuntimeResponse,
} from './types'

export async function sendMessage<T extends RuntimeRequestType>(
  type: T,
  payload: RuntimeRequestMap[T]['payload']
): Promise<RuntimeRequestMap[T]['response']> {
  const response = (await chrome.runtime.sendMessage({
    type,
    payload,
  } as RuntimeRequestMessage<T>)) as RuntimeResponse<RuntimeRequestMap[T]['response']>

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Unknown message error')
  }

  return response.data
}

export function onRuntimeEvent<T extends keyof RuntimeEventMap>(
  type: T,
  callback: (payload: RuntimeEventMap[T]) => void
): () => void {
  const listener = (message: RuntimeEventMessage) => {
    if (message.type !== type) {
      return
    }
    callback(message.payload as RuntimeEventMap[T])
  }

  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}
