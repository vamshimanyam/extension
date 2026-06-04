import { nanoid } from 'nanoid'

export function createId(length = 12): string {
  return nanoid(length)
}
