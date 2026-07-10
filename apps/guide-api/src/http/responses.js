export function ok(reply, data, meta) {
  const payload = { ok: true, data }
  if (meta) payload.meta = meta
  return reply.send(payload)
}

export function created(reply, data, meta) {
  reply.code(201)
  return ok(reply, data, meta)
}

export function fail(reply, statusCode, code, message, details) {
  const payload = {
    ok: false,
    error: {
      code,
      message,
    },
  }
  if (details) payload.error.details = details
  return reply.code(statusCode).send(payload)
}
