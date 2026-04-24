import { beforeAll } from 'vitest'

beforeAll(() => {
  // Ensure crypto is available for UUID generation in tests
  if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = require('node:crypto')
    // @ts-ignore
    globalThis.crypto = webcrypto
  }
})
