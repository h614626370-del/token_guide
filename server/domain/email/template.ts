export function renderEmailTemplate(template: string, variables: Record<string, unknown>) {
  return String(template).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = variables[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function feedbackReplyEmail(feedback: { contact?: string | null }) {
  const value = String(feedback.contact || '').trim()
  return isEmail(value) ? value : null
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}