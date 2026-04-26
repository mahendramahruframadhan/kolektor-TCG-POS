import { beforeAll } from 'vitest'
import { webcrypto } from 'node:crypto'

beforeAll(() => {
  // Ensure crypto is available for UUID generation in tests
  if (typeof globalThis.crypto === 'undefined') {
    // @ts-ignore
    globalThis.crypto = webcrypto
  }
})
