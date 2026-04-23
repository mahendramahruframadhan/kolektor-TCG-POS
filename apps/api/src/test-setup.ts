import { beforeAll } from 'vitest'

beforeAll(() => {
  if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = require('node:crypto')
    // @ts-ignore
    globalThis.crypto = webcrypto
  }
})
