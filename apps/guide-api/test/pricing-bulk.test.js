import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { config } from '../src/config.js'
import { openDatabase } from '../src/db/index.js'
import { createPricingRepository } from '../src/modules/pricing/repository.js'

let db
let repo

beforeEach(() => {
  db = openDatabase(':memory:')
  repo = createPricingRepository(db)
})

afterEach(() => {
  db.close()
})

test('bulk model save persists every item in one call', () => {
  const items = Array.from({ length: 183 }, (_, index) => ({
    provider: 'openai',
    model_name: `bulk-model-${index}`,
    display_name: '',
    is_visible: index % 2 === 0,
    is_featured: false,
    sort_order: index,
    note: '',
  }))

  const saved = repo.upsertModelSettings(items)

  assert.equal(saved.length, items.length)
  assert.equal(
    repo.listModelSettings().filter((item) => item.model_name.startsWith('bulk-model-')).length,
    items.length,
  )
})

test('bulk model save rolls back all items when one write fails', () => {
  assert.throws(() => repo.upsertModelSettings([
    {
      provider: 'openai',
      model_name: 'must-be-rolled-back',
      is_visible: true,
    },
    {
      provider: 'openai',
      model_name: null,
      is_visible: true,
    },
  ]))

  assert.equal(
    repo.listModelSettings().some((item) => item.model_name === 'must-be-rolled-back'),
    false,
  )
})

test('bulk model admin endpoint accepts the full model list in one request', async () => {
  const app = await createApp({
    db,
    config: {
      ...config,
      adminToken: 'bulk-test-token',
      logLevel: 'silent',
      sub2apiApiBase: '',
      sub2apiAdminApiKey: '',
    },
  })
  const items = Array.from({ length: 183 }, (_, index) => ({
    provider: 'openai',
    model_name: `http-model-${index}`,
    is_visible: true,
    is_featured: false,
    sort_order: index,
  }))

  const response = await app.inject({
    method: 'PUT',
    url: '/guide-api/admin/pricing/models/bulk',
    headers: {
      authorization: 'Bearer bulk-test-token',
    },
    payload: { items },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.length, items.length)
  await app.close()
})
