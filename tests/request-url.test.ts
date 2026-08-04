import { describe, expect, it } from 'vitest'
import { rebasePublicUploadUrl } from '../server/utils/request-url'

describe('public upload URLs', () => {
  it('rebases local uploaded assets onto the current site origin', () => {
    const previous = 'https://guide.kkflow.org/uploads/20260804011445-group-0123456789.png'
    expect(rebasePublicUploadUrl(previous, 'https://guide.aiziyou.org')).toBe(
      'https://guide.aiziyou.org/uploads/20260804011445-group-0123456789.png',
    )
  })

  it('does not rewrite external image URLs', () => {
    const external = 'https://cdn.example.com/images/group.png'
    expect(rebasePublicUploadUrl(external, 'https://guide.aiziyou.org')).toBe(external)
  })
})
