const modelColumns = `
  id,
  provider,
  model_name,
  display_name,
  is_visible,
  is_featured,
  sort_order,
  note,
  created_at,
  updated_at
`

const groupColumns = `
  id,
  provider,
  source_id,
  source_name,
  display_name,
  is_visible,
  recharge_multiplier,
  recharge_pay_cny,
  recharge_credit_usd,
  sort_order,
  note,
  created_at,
  updated_at
`

const runtimeSettingKeys = new Set([
  'sub2api_base_url',
  'sub2api_admin_api_key',
  'pricing_platforms',
  'provider_display_order',
  'usd_to_cny',
])

export function createPricingRepository(db) {
  const listModels = db.prepare(`
    SELECT ${modelColumns}
    FROM pricing_model_settings
    ORDER BY provider ASC, sort_order ASC, model_name ASC
  `)
  const listVisibleModels = db.prepare(`
    SELECT ${modelColumns}
    FROM pricing_model_settings
    WHERE is_visible = 1
    ORDER BY provider ASC, sort_order ASC, model_name ASC
  `)
  const upsertModel = db.prepare(`
    INSERT INTO pricing_model_settings (
      provider,
      model_name,
      display_name,
      is_visible,
      is_featured,
      sort_order,
      note,
      created_at,
      updated_at
    ) VALUES (
      @provider,
      @model_name,
      @display_name,
      @is_visible,
      @is_featured,
      @sort_order,
      @note,
      @created_at,
      @updated_at
    )
    ON CONFLICT(provider, model_name) DO UPDATE SET
      display_name = excluded.display_name,
      is_visible = excluded.is_visible,
      is_featured = excluded.is_featured,
      sort_order = excluded.sort_order,
      note = excluded.note,
      updated_at = excluded.updated_at
  `)
  const getModel = db.prepare(`
    SELECT ${modelColumns}
    FROM pricing_model_settings
    WHERE provider = ? AND model_name = ?
  `)
  const deleteModel = db.prepare('DELETE FROM pricing_model_settings WHERE id = ?')

  const listGroups = db.prepare(`
    SELECT ${groupColumns}
    FROM pricing_group_settings
    ORDER BY provider ASC, sort_order ASC, source_name ASC, source_id ASC
  `)
  const upsertGroup = db.prepare(`
    INSERT INTO pricing_group_settings (
      provider,
      source_id,
      source_name,
      display_name,
      is_visible,
      recharge_multiplier,
      recharge_pay_cny,
      recharge_credit_usd,
      sort_order,
      note,
      created_at,
      updated_at
    ) VALUES (
      @provider,
      @source_id,
      @source_name,
      @display_name,
      @is_visible,
      @recharge_multiplier,
      @recharge_pay_cny,
      @recharge_credit_usd,
      @sort_order,
      @note,
      @created_at,
      @updated_at
    )
    ON CONFLICT(provider, source_id) DO UPDATE SET
      source_name = excluded.source_name,
      display_name = excluded.display_name,
      is_visible = excluded.is_visible,
      recharge_multiplier = excluded.recharge_multiplier,
      recharge_pay_cny = excluded.recharge_pay_cny,
      recharge_credit_usd = excluded.recharge_credit_usd,
      sort_order = excluded.sort_order,
      note = excluded.note,
      updated_at = excluded.updated_at
  `)
  const getGroup = db.prepare(`
    SELECT ${groupColumns}
    FROM pricing_group_settings
    WHERE provider = ? AND source_id = ?
  `)
  const deleteGroup = db.prepare('DELETE FROM pricing_group_settings WHERE id = ?')
  const listRuntimeSettings = db.prepare(`
    SELECT key, value, is_secret, created_at, updated_at
    FROM pricing_runtime_settings
    ORDER BY key ASC
  `)
  const upsertRuntimeSetting = db.prepare(`
    INSERT INTO pricing_runtime_settings (
      key,
      value,
      is_secret,
      created_at,
      updated_at
    ) VALUES (
      @key,
      @value,
      @is_secret,
      @created_at,
      @updated_at
    )
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      is_secret = excluded.is_secret,
      updated_at = excluded.updated_at
  `)
  const deleteRuntimeSetting = db.prepare('DELETE FROM pricing_runtime_settings WHERE key = ?')

  const saveModel = (input) => {
    const now = new Date().toISOString()
    const current = getModel.get(input.provider, input.model_name)
    const row = {
      provider: input.provider,
      model_name: input.model_name,
      display_name: emptyToNull(input.display_name),
      is_visible: boolToInt(input.is_visible ?? current?.is_visible ?? false),
      is_featured: boolToInt(input.is_featured ?? current?.is_featured ?? false),
      sort_order: input.sort_order ?? current?.sort_order ?? 1000,
      note: emptyToNull(input.note),
      created_at: current?.created_at || now,
      updated_at: now,
    }
    upsertModel.run(row)
    return normalizeModel(getModel.get(input.provider, input.model_name))
  }

  const saveModels = db.transaction((inputs) => inputs.map(saveModel))

  const saveGroup = (input) => {
    const now = new Date().toISOString()
    const current = getGroup.get(input.provider, input.source_id)
    const rechargePayCny = positiveOrNull(input.recharge_pay_cny ?? current?.recharge_pay_cny)
    const rechargeCreditUsd = positiveOrNull(input.recharge_credit_usd ?? current?.recharge_credit_usd)
    const rechargeMultiplier = rechargePayCny && rechargeCreditUsd
      ? rechargeCreditUsd / rechargePayCny
      : input.recharge_multiplier ?? current?.recharge_multiplier ?? 1
    const row = {
      provider: input.provider,
      source_id: input.source_id,
      source_name: emptyToNull(input.source_name),
      display_name: emptyToNull(input.display_name),
      is_visible: nullableBoolToInt(input.is_visible ?? current?.is_visible ?? null),
      recharge_multiplier: rechargeMultiplier,
      recharge_pay_cny: rechargePayCny,
      recharge_credit_usd: rechargeCreditUsd,
      sort_order: input.sort_order ?? current?.sort_order ?? 1000,
      note: emptyToNull(input.note),
      created_at: current?.created_at || now,
      updated_at: now,
    }
    upsertGroup.run(row)
    return normalizeGroup(getGroup.get(input.provider, input.source_id))
  }

  const saveGroups = db.transaction((inputs) => inputs.map(saveGroup))

  return {
    listModelSettings() {
      return listModels.all().map(normalizeModel)
    },

    listVisibleModelSettings() {
      return listVisibleModels.all().map(normalizeModel)
    },

    upsertModelSetting(input) {
      return saveModel(input)
    },

    upsertModelSettings(inputs) {
      return saveModels(inputs)
    },

    deleteModelSetting(id) {
      return deleteModel.run(Number(id)).changes > 0
    },

    listGroupSettings() {
      return listGroups.all().map(normalizeGroup)
    },

    upsertGroupSetting(input) {
      return saveGroup(input)
    },

    upsertGroupSettings(inputs) {
      return saveGroups(inputs)
    },

    deleteGroupSetting(id) {
      return deleteGroup.run(Number(id)).changes > 0
    },

    listRuntimeSettings() {
      return Object.fromEntries(
        listRuntimeSettings.all()
          .filter((row) => runtimeSettingKeys.has(row.key))
          .map((row) => [row.key, row.value]),
      )
    },

    updateRuntimeSettings(input) {
      const now = new Date().toISOString()
      const setValue = (key, value, isSecret = false) => {
        if (!runtimeSettingKeys.has(key)) return
        const text = value == null ? '' : String(value).trim()
        if (!text) {
          deleteRuntimeSetting.run(key)
          return
        }
        upsertRuntimeSetting.run({
          key,
          value: text,
          is_secret: boolToInt(isSecret),
          created_at: now,
          updated_at: now,
        })
      }

      if ('sub2api_base_url' in input) {
        setValue('sub2api_base_url', input.sub2api_base_url)
      }
      if (input.sub2api_admin_api_key) {
        setValue('sub2api_admin_api_key', input.sub2api_admin_api_key, true)
      }
      if (input.clear_sub2api_admin_api_key) {
        deleteRuntimeSetting.run('sub2api_admin_api_key')
      }
      if ('pricing_platforms' in input) {
        setValue('pricing_platforms', JSON.stringify(input.pricing_platforms || []))
      }
      if ('provider_display_order' in input) {
        setValue('provider_display_order', JSON.stringify(input.provider_display_order || []))
      }
      if ('usd_to_cny' in input) {
        setValue('usd_to_cny', input.usd_to_cny)
      }

      return this.listRuntimeSettings()
    },
  }
}

function normalizeModel(row) {
  if (!row) return null
  return {
    ...row,
    is_visible: Boolean(row.is_visible),
    is_featured: Boolean(row.is_featured),
  }
}

function normalizeGroup(row) {
  if (!row) return null
  return {
    ...row,
    is_visible: row.is_visible == null ? null : Boolean(row.is_visible),
  }
}

function boolToInt(value) {
  return value ? 1 : 0
}

function nullableBoolToInt(value) {
  if (value == null) return null
  return value ? 1 : 0
}

function emptyToNull(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

function positiveOrNull(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}
