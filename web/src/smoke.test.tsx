import { describe, expect, it } from 'vitest'

 describe('web toolchain', () => {
  it('runs a browser test environment', () => {
    expect(document.body).toBeInstanceOf(HTMLElement)
  })
})
