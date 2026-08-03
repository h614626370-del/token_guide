import { z } from 'zod'

export const editableDocIds = ['index', 'integration', 'member'] as const
export type EditableDocId = typeof editableDocIds[number]

export const editableDocIdSchema = z.enum(editableDocIds)
export const editableDocPathSchema = z.enum(['/', '/integration', '/member'])

export const adminDocUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300),
  body: z.string().min(1).max(100_000),
}).strict()

export type AdminDocUpdateInput = z.infer<typeof adminDocUpdateSchema>
