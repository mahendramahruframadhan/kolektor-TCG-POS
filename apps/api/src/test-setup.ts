import { beforeAll } from 'vitest'

beforeAll(async () => {
  if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = await import('node:crypto')
    globalThis.crypto = webcrypto as unknown as Crypto
  }
})
