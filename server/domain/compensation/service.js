import crypto from 'node:crypto'
import { createCompensationRepository } from './repository.js'
import { compensationOperations } from './schema.js'

const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const MAX_LOOKUP_CONCURRENCY = 8
const MAX_EXECUTION_CONCURRENCY = 4

export function createCompensationService({ db, config, sub2api, logger }) {
  const repo = createCompensationRepository(db)

  return {
    async preview(input) {
      const normalized = normalizeInput(input, config)
      const window = createTimeWindow(normalized)
      const usage = await sub2api.listUsageLogsAll({
        startDate: normalized.date,
        endDate: normalized.date,
        timezone: normalized.timezone,
      })

      const candidates = new Map()
      let inWindowRecords = 0
      for (const record of usage) {
        const createdAt = parseDateMs(record?.created_at)
        if (createdAt == null || createdAt < window.startMs || createdAt >= window.endMs) continue
        inWindowRecords += 1
        const userId = positiveInteger(record?.user_id)
        if (!userId || candidates.has(userId)) continue
        candidates.set(userId, normalizeUser(record?.user, userId))
      }

      const users = await resolveUsers(Array.from(candidates.values()), sub2api, logger)
      const eligible = users
        .filter(user => user && !user.is_deleted && !user.unresolved)
        .sort((left, right) => left.id - right.id)
      const excluded = users.filter(user => user && user.is_deleted).length
      const fingerprint = buildPreviewFingerprint({
        ...normalized,
        user_ids: eligible.map(user => user.id),
      })

      return {
        date: normalized.date,
        start_time: normalized.start_time,
        end_time: normalized.end_time,
        timezone: normalized.timezone,
        operation: normalized.operation,
        amount: normalized.amount,
        window: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
          semantics: '[start, end)',
        },
        source: {
          usage_records: usage.length,
          records_in_window: inWindowRecords,
          excluded_users: excluded,
          unresolved_users: users.filter(user => user && user.unresolved).length,
        },
        summary: {
          user_count: eligible.length,
          total_amount: roundMoney(eligible.length * normalized.amount),
        },
        users: eligible,
        fingerprint,
      }
    },

    async execute(input) {
      const executionKeyHash = normalizeExecutionKeyHash(input.execution_key)
      const existing = repo.getBatchByExecutionKeyHash(executionKeyHash)
      if (existing) return existing

      const {
        notes,
        preview_fingerprint: expectedFingerprint,
        execution_key: _executionKey,
        ...previewInput
      } = input
      const preview = await this.preview(previewInput)
      if (preview.fingerprint !== expectedFingerprint) {
        const error = new Error('The preview is stale. Run the preview again before executing compensation.')
        error.code = 'COMPENSATION_PREVIEW_STALE'
        throw error
      }
      if (!preview.users.length) {
        const error = new Error('No eligible users were found in the selected time window.')
        error.code = 'COMPENSATION_NO_USERS'
        throw error
      }

      return createAndRunBatch({
        mode: 'batch',
        date: preview.date,
        start_time: preview.start_time,
        end_time: preview.end_time,
        timezone: preview.timezone,
        operation: preview.operation,
        amount: preview.amount,
        notes,
        preview_fingerprint: preview.fingerprint,
        execution_key_hash: executionKeyHash,
        users: preview.users,
        sub2api,
        repo,
        logger,
      })
    },

    async test(input) {
      const normalized = normalizeTestInput(input, config)
      const user = await resolveTargetUser(normalized, sub2api)
      if (user.is_deleted) {
        const error = new Error('The selected user has been deleted and cannot receive a balance adjustment.')
        error.code = 'COMPENSATION_USER_DELETED'
        throw error
      }

      const timestamp = wallClockParts(new Date(), DEFAULT_TIMEZONE)
      return createAndRunBatch({
        mode: 'single',
        date: timestamp.date,
        start_time: timestamp.time,
        end_time: timestamp.time,
        timezone: DEFAULT_TIMEZONE,
        operation: normalized.operation,
        amount: normalized.amount,
        notes: normalized.notes,
        preview_fingerprint: buildSingleFingerprint(normalized, user.id),
        users: [user],
        sub2api,
        repo,
        logger,
      })
    },

    async getBatch(id) {
      return repo.getBatch(id)
    },

    listBatches(page, pageSize) {
      return repo.listBatches(page, pageSize)
    },

    async retry(id, notes) {
      const batch = repo.getBatch(id)
      if (!batch) return null
      if (batch.status === 'completed') {
        const error = new Error('This compensation batch is already completed.')
        error.code = 'COMPENSATION_ALREADY_COMPLETED'
        throw error
      }
      if (batch.mode === 'single') {
        const items = repo.listPendingItems(id)
        await runItems(id, items, batch, notes || batch.notes, sub2api, repo, logger)
        return repo.getBatch(id)
      }
      const preview = await this.preview({
        date: batch.date,
        start_time: batch.start_time,
        end_time: batch.end_time,
        timezone: batch.timezone,
        operation: batch.operation,
        amount: batch.amount,
      })
      if (preview.fingerprint !== batch.preview_fingerprint) {
        const error = new Error('The source user set changed; create a new preview before retrying.')
        error.code = 'COMPENSATION_PREVIEW_STALE'
        throw error
      }
      const items = repo.listPendingItems(id)
      await runItems(id, items, preview, notes || batch.notes, sub2api, repo, logger)
      return repo.getBatch(id)
    },
  }
}

async function createAndRunBatch({
  mode,
  date,
  start_time: startTime,
  end_time: endTime,
  timezone,
  operation,
  amount,
  notes,
  preview_fingerprint: previewFingerprint,
  execution_key_hash: executionKeyHash = null,
  users,
  sub2api,
  repo,
  logger,
}) {
  const batchId = crypto.randomUUID()
  const now = new Date().toISOString()
  const batch = {
    id: batchId,
    mode,
    date,
    start_time: startTime,
    end_time: endTime,
    timezone,
    operation,
    amount,
    notes,
    preview_fingerprint: previewFingerprint,
    execution_key_hash: executionKeyHash,
    user_count: users.length,
    total_amount: roundMoney(users.length * amount),
    status: 'running',
    created_at: now,
    updated_at: now,
  }
  const items = users.map(user => ({
    batch_id: batchId,
    user_id: user.id,
    email: user.email,
    username: user.username,
    status: 'pending',
    idempotency_key_hash: hashSecret(idempotencyKey(batchId, user.id)),
    created_at: now,
    updated_at: now,
  }))
  const reservation = repo.reserveBatch(batch, items)
  if (!reservation.created) return reservation.batch
  await runItems(batchId, repo.listPendingItems(batchId), batch, notes, sub2api, repo, logger)
  return repo.getBatch(batchId)
}

function normalizeExecutionKeyHash(value) {
  const key = String(value || '').trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) {
    const error = new Error('Compensation execution_key must be a valid UUID.')
    error.code = 'COMPENSATION_EXECUTION_KEY_INVALID'
    throw error
  }
  return hashSecret(key)
}

function normalizeInput(input, config) {
  const amount = Number(input.amount)
  const maxAmount = Number(config.compensationMaxAmount || 100000)
  if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
    const error = new Error(`Compensation amount must be greater than 0 and no more than ${maxAmount}.`)
    error.code = 'COMPENSATION_AMOUNT_INVALID'
    throw error
  }
  if (!compensationOperations.includes(input.operation)) {
    const error = new Error('Unsupported compensation operation.')
    error.code = 'COMPENSATION_OPERATION_INVALID'
    throw error
  }
  if (input.start_time >= input.end_time) {
    const error = new Error('The compensation start time must be earlier than the end time.')
    error.code = 'COMPENSATION_TIME_RANGE_INVALID'
    throw error
  }
  return {
    date: String(input.date),
    start_time: String(input.start_time),
    end_time: String(input.end_time),
    timezone: String(input.timezone || DEFAULT_TIMEZONE),
    operation: input.operation,
    amount: roundMoney(amount),
  }
}

function normalizeTestInput(input, config) {
  const amount = Number(input.amount)
  const maxAmount = Number(config.compensationMaxAmount || 100000)
  if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
    const error = new Error(`Compensation amount must be greater than 0 and no more than ${maxAmount}.`)
    error.code = 'COMPENSATION_AMOUNT_INVALID'
    throw error
  }
  if (!compensationOperations.includes(input.operation)) {
    const error = new Error('Unsupported compensation operation.')
    error.code = 'COMPENSATION_OPERATION_INVALID'
    throw error
  }
  if (!['id', 'account'].includes(input.target_type)) {
    const error = new Error('Unsupported compensation test target type.')
    error.code = 'COMPENSATION_TARGET_INVALID'
    throw error
  }
  const target = String(input.target || '').trim()
  if (!target) {
    const error = new Error('A user ID or account is required for a single-user compensation test.')
    error.code = 'COMPENSATION_TARGET_INVALID'
    throw error
  }
  return {
    target_type: input.target_type,
    target,
    operation: input.operation,
    amount: roundMoney(amount),
    notes: String(input.notes || '').trim(),
  }
}

async function resolveTargetUser(input, sub2api) {
  if (input.target_type === 'id') {
    const userId = positiveInteger(input.target)
    if (!userId) {
      const error = new Error('The single-user test ID must be a positive integer.')
      error.code = 'COMPENSATION_TARGET_INVALID'
      throw error
    }
    try {
      const user = normalizeUser(await sub2api.getUser(userId), userId)
      if (user) return user
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
    throwUserNotFound()
  }

  const account = normalizeAccount(input.target)
  const users = await sub2api.listUsersAll({ search: input.target })
  const matches = Array.from(new Map(users
    .map(user => normalizeUser(user))
    .filter(user => user && (normalizeAccount(user.email) === account || normalizeAccount(user.username) === account))
    .map(user => [user.id, user])).values())
  if (!matches.length) throwUserNotFound()
  if (matches.length > 1) {
    const error = new Error('Multiple users exactly match that account. Use the numeric user ID instead.')
    error.code = 'COMPENSATION_USER_AMBIGUOUS'
    throw error
  }
  return matches[0]
}

function throwUserNotFound() {
  const error = new Error('No user exactly matched the specified ID or account.')
  error.code = 'COMPENSATION_USER_NOT_FOUND'
  throw error
}

function normalizeAccount(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US')
}

function isNotFoundError(error) {
  return /\b404\b/.test(error instanceof Error ? error.message : String(error || ''))
}

async function runItems(batchId, items, preview, notes, sub2api, repo, logger) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(MAX_EXECUTION_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      if (!item) return
      const key = idempotencyKey(batchId, item.user_id)
      repo.updateItem(batchId, item.id, { status: 'running', completed_at: null })
      try {
        const response = await sub2api.adjustUserBalance(item.user_id, {
          balance: preview.amount,
          operation: preview.operation,
          notes,
          idempotencyKey: key,
        })
        repo.updateItem(batchId, item.id, {
          status: 'succeeded',
          upstream_response_json: JSON.stringify(redactUpstreamResponse(response)),
          completed_at: new Date().toISOString(),
        })
      } catch (error) {
        logger?.warn({ batchId, userId: item.user_id, err: error }, 'compensation item failed')
        repo.updateItem(batchId, item.id, {
          status: 'failed',
          error_message: safeErrorMessage(error),
          completed_at: new Date().toISOString(),
        })
      }
    }
  })
  await Promise.all(workers)

  const current = repo.getBatch(batchId)
  const statuses = (current?.items || []).map(item => item.status)
  const status = statuses.length && statuses.every(value => value === 'succeeded')
    ? 'completed'
    : statuses.some(value => value === 'succeeded')
      ? 'partial'
      : 'failed'
  repo.updateBatch(batchId, status, new Date().toISOString())
}

async function resolveUsers(users, sub2api, logger) {
  const queue = [...users]
  const resolved = []
  const workers = Array.from({ length: Math.min(MAX_LOOKUP_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const user = queue.shift()
      if (!user) return
      if (user.role !== null || user.deleted_at !== null || user.unresolved) {
        resolved.push(user)
        continue
      }
      try {
        const upstream = await sub2api.getUser(user.id)
        resolved.push(normalizeUser(upstream, user.id))
      } catch (error) {
        logger?.warn({ userId: user.id, err: error }, 'failed to resolve compensation user')
        resolved.push({ ...user, unresolved: true })
      }
    }
  })
  await Promise.all(workers)
  return resolved
}

function normalizeUser(value, fallbackId) {
  const id = positiveInteger(value?.id ?? value?.user_id ?? fallbackId)
  if (!id) return null
  return {
    id,
    email: value?.email ? String(value.email) : null,
    username: value?.username ? String(value.username) : null,
    role: value?.role ? String(value.role) : null,
    status: value?.status ? String(value.status) : null,
    deleted_at: value?.deleted_at || value?.deletedAt || null,
    is_deleted: Boolean(value?.deleted_at || value?.deletedAt),
    unresolved: false,
  }
}

function createTimeWindow(input) {
  const start = zonedDateTimeToUtc(input.date, input.start_time, input.timezone)
  const end = zonedDateTimeToUtc(input.date, input.end_time, input.timezone)
  return { start, end, startMs: start.getTime(), endMs: end.getTime() }
}

function zonedDateTimeToUtc(date, time, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match || !timeMatch) throw new Error('Invalid compensation date or time.')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const naiveDate = new Date(naive)
  if (naiveDate.getUTCFullYear() !== year
    || naiveDate.getUTCMonth() !== month - 1
    || naiveDate.getUTCDate() !== day
    || naiveDate.getUTCHours() !== hour
    || naiveDate.getUTCMinutes() !== minute) {
    throw new Error('Invalid compensation date or time.')
  }
  let guess = naive
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]))
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second))
    guess = naive - (wall - guess)
  }
  const result = new Date(guess)
  if (Number.isNaN(result.getTime())) throw new Error('Invalid compensation timezone.')
  return result
}

function buildPreviewFingerprint(input) {
  return crypto.createHash('sha256').update(JSON.stringify({
    date: input.date,
    start_time: input.start_time,
    end_time: input.end_time,
    timezone: input.timezone,
    operation: input.operation,
    amount: input.amount,
    user_ids: input.user_ids,
  })).digest('hex')
}

function buildSingleFingerprint(input, userId) {
  return crypto.createHash('sha256').update(JSON.stringify({
    mode: 'single',
    target_type: input.target_type,
    target: normalizeAccount(input.target),
    operation: input.operation,
    amount: input.amount,
    user_id: userId,
  })).digest('hex')
}

function wallClockParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(Number(parts.hour) % 24).padStart(2, '0')}:${parts.minute}`,
  }
}

function idempotencyKey(batchId, userId) {
  return `guide-compensation-${batchId}-user-${userId}`
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function parseDateMs(value) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : null
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown upstream error')
  return message.replace(/admin[-_ ]?api[-_ ]?key[^\s]*/gi, '[redacted]').slice(0, 500)
}

function redactUpstreamResponse(value) {
  if (Array.isArray(value)) return value.map(item => redactUpstreamResponse(item))
  if (!value || typeof value !== 'object') return value

  const output = {}
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:api_?key|key|token|access_token|refresh_token|password|secret|credentials)$/i.test(key)) continue
    output[key] = redactUpstreamResponse(item)
  }
  return output
}
