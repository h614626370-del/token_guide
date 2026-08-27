const overrideColumns = `
  id,
  group_id,
  model_name,
  is_enabled,
  is_visible,
  multiplier,
  input_usd_per_million,
  output_usd_per_million,
  cache_read_usd_per_million,
  cache_write_usd_per_million,
  image_price_1k,
  image_price_2k,
  image_price_4k,
  official_input_usd_per_million,
  official_output_usd_per_million,
  official_cache_read_usd_per_million,
  official_cache_write_usd_per_million,
  official_image_price_1k,
  official_image_price_2k,
  official_image_price_4k,
  official_price_unit,
  note,
  created_at,
  updated_at
`

const runtimeKeys = [
  'sub2api_base_url',
  'sub2api_admin_api_key',
  'usd_to_cny',
]

export function createModelPricingRepository(db) {
  const listOverridesStatement = db.prepare(`
    SELECT ${overrideColumns}
    FROM model_pricing_group_overrides
    ORDER BY group_id, model_name COLLATE NOCASE
  `)
  const getOverrideStatement = db.prepare(`
    SELECT ${overrideColumns}
    FROM model_pricing_group_overrides
    WHERE group_id = ? AND model_name = ? COLLATE NOCASE
  `)
  const upsertOverrideStatement = db.prepare(`
    INSERT INTO model_pricing_group_overrides (
      group_id, model_name, is_enabled, is_visible, multiplier,
      input_usd_per_million, output_usd_per_million,
      cache_read_usd_per_million, cache_write_usd_per_million,
      image_price_1k, image_price_2k, image_price_4k,
      official_input_usd_per_million, official_output_usd_per_million,
      official_cache_read_usd_per_million, official_cache_write_usd_per_million,
      official_image_price_1k, official_image_price_2k, official_image_price_4k,
      official_price_unit,
      note, created_at, updated_at
    ) VALUES (
      @group_id, @model_name, @is_enabled, @is_visible, @multiplier,
      @input_usd_per_million, @output_usd_per_million,
      @cache_read_usd_per_million, @cache_write_usd_per_million,
      @image_price_1k, @image_price_2k, @image_price_4k,
      @official_input_usd_per_million, @official_output_usd_per_million,
      @official_cache_read_usd_per_million, @official_cache_write_usd_per_million,
      @official_image_price_1k, @official_image_price_2k, @official_image_price_4k,
      @official_price_unit,
      @note, @created_at, @updated_at
    )
    ON CONFLICT(group_id, model_name) DO UPDATE SET
      is_enabled = excluded.is_enabled,
      is_visible = excluded.is_visible,
      multiplier = excluded.multiplier,
      input_usd_per_million = excluded.input_usd_per_million,
      output_usd_per_million = excluded.output_usd_per_million,
      cache_read_usd_per_million = excluded.cache_read_usd_per_million,
      cache_write_usd_per_million = excluded.cache_write_usd_per_million,
      image_price_1k = excluded.image_price_1k,
      image_price_2k = excluded.image_price_2k,
      image_price_4k = excluded.image_price_4k,
      official_input_usd_per_million = excluded.official_input_usd_per_million,
      official_output_usd_per_million = excluded.official_output_usd_per_million,
      official_cache_read_usd_per_million = excluded.official_cache_read_usd_per_million,
      official_cache_write_usd_per_million = excluded.official_cache_write_usd_per_million,
      official_image_price_1k = excluded.official_image_price_1k,
      official_image_price_2k = excluded.official_image_price_2k,
      official_image_price_4k = excluded.official_image_price_4k,
      official_price_unit = excluded.official_price_unit,
      note = excluded.note,
      updated_at = excluded.updated_at
  `)
  const clearAllManualOverridesStatement = db.prepare(`
    UPDATE model_pricing_group_overrides
    SET
      is_enabled = 0,
      multiplier = NULL,
      input_usd_per_million = NULL,
      output_usd_per_million = NULL,
      cache_read_usd_per_million = NULL,
      cache_write_usd_per_million = NULL,
      image_price_1k = NULL,
      image_price_2k = NULL,
      image_price_4k = NULL,
      official_input_usd_per_million = NULL,
      official_output_usd_per_million = NULL,
      official_cache_read_usd_per_million = NULL,
      official_cache_write_usd_per_million = NULL,
      official_image_price_1k = NULL,
      official_image_price_2k = NULL,
      official_image_price_4k = NULL,
      updated_at = @updated_at
  `)
  const listDisplayOrderStatement = db.prepare(`
    SELECT scope, parent_key, item_key, sort_order
    FROM model_pricing_display_order
    ORDER BY scope, parent_key, sort_order, item_key COLLATE NOCASE
  `)
  const upsertDisplayOrderStatement = db.prepare(`
    INSERT INTO model_pricing_display_order (scope, parent_key, item_key, sort_order, updated_at)
    VALUES (@scope, @parent_key, @item_key, @sort_order, @updated_at)
    ON CONFLICT(scope, parent_key, item_key) DO UPDATE SET
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `)
  const listGroupSettingsStatement = db.prepare(`
    SELECT group_id, display_name
    FROM model_pricing_group_settings
  `)
  const upsertGroupSettingStatement = db.prepare(`
    INSERT INTO model_pricing_group_settings (group_id, display_name, updated_at)
    VALUES (@group_id, @display_name, @updated_at)
    ON CONFLICT(group_id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `)
  const runtimeSettingsStatement = db.prepare(`
    SELECT key, value
    FROM pricing_runtime_settings
    WHERE key IN (${runtimeKeys.map(() => '?').join(', ')})
  `)
  const getSnapshotStatement = db.prepare(`
    SELECT payload_json, fetched_at
    FROM model_pricing_source_snapshots
    WHERE id = 1
  `)
  const saveSnapshotStatement = db.prepare(`
    INSERT INTO model_pricing_source_snapshots (id, payload_json, fetched_at, updated_at)
    VALUES (1, @payload_json, @fetched_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at
  `)
  const getPublicSnapshotStatement = db.prepare(`
    SELECT payload_json, generated_at
    FROM model_pricing_public_snapshots
    WHERE id = 1
  `)
  const savePublicSnapshotStatement = db.prepare(`
    INSERT INTO model_pricing_public_snapshots (id, payload_json, generated_at, updated_at)
    VALUES (1, @payload_json, @generated_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      payload_json = excluded.payload_json,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at
  `)

  const saveOne = (input) => {
    const current = getOverrideStatement.get(input.group_id, input.model_name)
    const now = new Date().toISOString()
    upsertOverrideStatement.run({
      group_id: String(input.group_id),
      model_name: String(input.model_name).trim(),
      is_enabled: input.is_enabled === false ? 0 : 1,
      is_visible: input.is_visible === false ? 0 : 1,
      multiplier: positiveOrNull(input.multiplier),
      input_usd_per_million: nonNegativeOrNull(input.input_usd_per_million),
      output_usd_per_million: nonNegativeOrNull(input.output_usd_per_million),
      cache_read_usd_per_million: nonNegativeOrNull(input.cache_read_usd_per_million),
      cache_write_usd_per_million: nonNegativeOrNull(input.cache_write_usd_per_million),
      image_price_1k: nonNegativeOrNull(input.image_price_1k),
      image_price_2k: nonNegativeOrNull(input.image_price_2k),
      image_price_4k: nonNegativeOrNull(input.image_price_4k),
      official_input_usd_per_million: nonNegativeOrNull(input.official_input_usd_per_million),
      official_output_usd_per_million: nonNegativeOrNull(input.official_output_usd_per_million),
      official_cache_read_usd_per_million: nonNegativeOrNull(input.official_cache_read_usd_per_million),
      official_cache_write_usd_per_million: nonNegativeOrNull(input.official_cache_write_usd_per_million),
      official_image_price_1k: nonNegativeOrNull(input.official_image_price_1k),
      official_image_price_2k: nonNegativeOrNull(input.official_image_price_2k),
      official_image_price_4k: nonNegativeOrNull(input.official_image_price_4k),
      official_price_unit: input.official_price_unit === 'rmb' ? 'rmb' : 'usd',
      note: emptyToNull(input.note),
      created_at: current?.created_at || now,
      updated_at: now,
    })
    return normalizeOverride(getOverrideStatement.get(input.group_id, input.model_name))
  }
  const saveMany = db.transaction((items) => items.map(saveOne))
  const saveDisplayOrder = db.transaction((items) => {
    const now = new Date().toISOString()
    for (const item of items) upsertDisplayOrderStatement.run({ ...item, updated_at: now })
    return items
  })

  return {
    listOverrides() {
      return listOverridesStatement.all().map(normalizeOverride)
    },

    upsertOverrides(items) {
      return saveMany(items)
    },

    clearAllManualOverrides() {
      const result = clearAllManualOverridesStatement.run({ updated_at: new Date().toISOString() })
      return { cleared: result.changes }
    },

    listDisplayOrder() {
      return listDisplayOrderStatement.all()
    },

    upsertDisplayOrder(items) {
      return saveDisplayOrder(items)
    },

    listGroupSettings() {
      return listGroupSettingsStatement.all()
    },

    upsertGroupSetting(input) {
      upsertGroupSettingStatement.run({
        group_id: String(input.group_id),
        display_name: emptyToNull(input.display_name),
        updated_at: new Date().toISOString(),
      })
      return listGroupSettingsStatement.all().find(item => String(item.group_id) === String(input.group_id)) || null
    },

    listRuntimeSettings() {
      return Object.fromEntries(runtimeSettingsStatement.all(...runtimeKeys).map(row => [row.key, row.value]))
    },

    getSourceSnapshot() {
      const row = getSnapshotStatement.get()
      if (!row) return null
      try {
        return { payload: JSON.parse(row.payload_json), fetched_at: row.fetched_at }
      } catch {
        return null
      }
    },

    saveSourceSnapshot(payload) {
      const fetchedAt = payload.fetched_at || new Date().toISOString()
      saveSnapshotStatement.run({
        payload_json: JSON.stringify(payload),
        fetched_at: fetchedAt,
        updated_at: new Date().toISOString(),
      })
    },

    getPublicCatalogSnapshot() {
      const row = getPublicSnapshotStatement.get()
      if (!row) return null
      try {
        return { payload: JSON.parse(row.payload_json), generated_at: row.generated_at }
      } catch {
        return null
      }
    },

    savePublicCatalogSnapshot(payload) {
      const now = new Date().toISOString()
      savePublicSnapshotStatement.run({
        payload_json: JSON.stringify(payload),
        generated_at: now,
        updated_at: now,
      })
    },
  }
}

function normalizeOverride(row) {
  return row ? { ...row, is_enabled: Boolean(row.is_enabled), is_visible: Boolean(row.is_visible) } : null
}

function positiveOrNull(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function nonNegativeOrNull(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function emptyToNull(value) {
  const text = String(value || '').trim()
  return text || null
}
