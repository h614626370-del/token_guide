import { z } from 'zod'

export const editableDocIds = ['index', 'integration', 'member'] as const
export type EditableDocId = string

export const editableDocIdSchema = z.string().trim().min(1).max(120)
export const editableDocPathSchema = z.string().regex(/^\/(?:[A-Za-z0-9][A-Za-z0-9_-]*\/)*[A-Za-z0-9][A-Za-z0-9_-]*$|^\/$/, '路径只能使用字母、数字、短横线和下划线。')

export const adminDocUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300),
  body: z.string().min(1).max(100_000),
}).strict()

export type AdminDocUpdateInput = z.infer<typeof adminDocUpdateSchema>

export const adminDocSettingsSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(1_000_000).optional(),
}).strict()

export type AdminDocSettingsInput = z.infer<typeof adminDocSettingsSchema>

export const adminDocOrderSchema = z.object({
  ids: z.array(editableDocIdSchema).min(1).max(200),
}).strict()

export const customDocUploadSchema = z.object({
  label: z.string().trim().max(120).optional(),
  path: editableDocPathSchema.optional(),
}).strict()
