export function createCompensationRepository(db) {
  const insertBatch = db.prepare(`
    INSERT INTO compensation_batches (
      id, mode, date, start_time, end_time, timezone, operation, amount,
      notes, preview_fingerprint, execution_key_hash, user_count, total_amount, status,
      created_at, updated_at
    ) VALUES (
      @id, @mode, @date, @start_time, @end_time, @timezone, @operation, @amount,
      @notes, @preview_fingerprint, @execution_key_hash, @user_count, @total_amount, @status,
      @created_at, @updated_at
    )
  `)
  const insertItem = db.prepare(`
    INSERT INTO compensation_items (
      batch_id, user_id, email, username, status, idempotency_key_hash,
      created_at, updated_at
    ) VALUES (
      @batch_id, @user_id, @email, @username, @status, @idempotency_key_hash,
      @created_at, @updated_at
    )
  `)
  const getBatch = db.prepare('SELECT * FROM compensation_batches WHERE id = ?')
  const getBatchByExecutionKeyHash = db.prepare('SELECT id FROM compensation_batches WHERE execution_key_hash = ?')
  const getItems = db.prepare('SELECT * FROM compensation_items WHERE batch_id = ? ORDER BY user_id ASC, id ASC')
  const getItem = db.prepare('SELECT * FROM compensation_items WHERE id = ? AND batch_id = ?')
  const listBatchRows = db.prepare(`
    SELECT * FROM compensation_batches
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `)
  const countBatches = db.prepare('SELECT COUNT(*) AS count FROM compensation_batches')
  const updateBatch = db.prepare(`
    UPDATE compensation_batches
    SET status = @status,
        completed_at = @completed_at,
        updated_at = @updated_at
    WHERE id = @id
  `)
  const updateItem = db.prepare(`
    UPDATE compensation_items
    SET status = @status,
        upstream_response_json = @upstream_response_json,
        error_message = @error_message,
        completed_at = @completed_at,
        updated_at = @updated_at
    WHERE id = @id AND batch_id = @batch_id
  `)

  const reserveBatch = db.transaction((batch, items) => {
    if (batch.execution_key_hash) {
      const existing = getBatchByExecutionKeyHash.get(batch.execution_key_hash)
      if (existing) return { created: false, batch_id: existing.id }
    }
    insertBatch.run(batch)
    for (const item of items) insertItem.run(item)
    return { created: true, batch_id: batch.id }
  })

  return {
    reserveBatch(batch, items) {
      const reservation = reserveBatch.immediate(batch, items)
      return { ...reservation, batch: this.getBatch(reservation.batch_id) }
    },

    getBatch(id) {
      const row = getBatch.get(id)
      if (!row) return null
      return batchView(row, getItems.all(id).map(itemView))
    },

    getBatchByExecutionKeyHash(executionKeyHash) {
      const row = getBatchByExecutionKeyHash.get(executionKeyHash)
      return row ? this.getBatch(row.id) : null
    },

    listBatches(page = 1, pageSize = 20) {
      const total = Number(countBatches.get().count || 0)
      const rows = listBatchRows.all({ limit: pageSize, offset: (page - 1) * pageSize }).map(row => batchView(row))
      return {
        items: rows,
        total,
        page,
        page_size: pageSize,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      }
    },

    updateBatch(id, status, completedAt = null) {
      updateBatch.run({ id, status, completed_at: completedAt, updated_at: new Date().toISOString() })
      return this.getBatch(id)
    },

    updateItem(batchId, itemId, patch) {
      updateItem.run({
        id: itemId,
        batch_id: batchId,
        status: patch.status,
        upstream_response_json: patch.upstream_response_json ?? null,
        error_message: patch.error_message ?? null,
        completed_at: patch.completed_at ?? null,
        updated_at: new Date().toISOString(),
      })
      return getItem.get(itemId, batchId) || null
    },

    listPendingItems(batchId) {
      return db.prepare(`
        SELECT * FROM compensation_items
        WHERE batch_id = ? AND status IN ('pending', 'running', 'failed')
        ORDER BY user_id ASC, id ASC
      `).all(batchId)
    },
  }
}

function batchView(row, items) {
  const { execution_key_hash: _executionKeyHash, ...batch } = row
  return items ? { ...batch, items } : batch
}

function itemView(item) {
  return {
    ...item,
    balance_after: balanceAfter(item.upstream_response_json),
  }
}

function balanceAfter(value) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    for (const key of ['balance', 'balance_after', 'new_balance', 'current_balance']) {
      const raw = parsed?.[key]
      if (raw == null || raw === '') continue
      const number = Number(raw)
      if (Number.isFinite(number)) return number
    }
  } catch {}
  return null
}
