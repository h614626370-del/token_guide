import { z } from 'zod'

export const feedbackCategories = [
  'bug',
  'billing',
  'api',
  'playground',
  'pricing',
  'suggestion',
  'other',
]

export const feedbackStatuses = ['open', 'triaged', 'closed', 'spam']

const metadataValue = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null(),
])

export const createFeedbackSchema = z.object({
  category: z.enum(feedbackCategories).default('other'),
  title: z.string().trim().min(2).max(120),
  content: z.string().trim().min(10).max(4000),
  contact: z.string().trim().max(160).optional().nullable(),
  page_url: z.string().trim().url().max(1000).optional().nullable(),
  source: z.string().trim().min(1).max(40).default('guide'),
  user_id: z.string().trim().max(64).optional().nullable(),
  metadata: z.record(metadataValue).optional(),
  website: z.string().max(0).optional(),
})

export const listFeedbackQuerySchema = z.object({
  status: z.enum(feedbackStatuses).optional(),
  category: z.enum(feedbackCategories).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

export const listMyFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(30).default(10),
})

export const updateFeedbackSchema = z.object({
  status: z.enum(feedbackStatuses).optional(),
  admin_reply: z.string().trim().max(4000).optional().nullable(),
  admin_note: z.string().trim().max(2000).optional().nullable(),
}).refine((value) => (
  value.status !== undefined
  || value.admin_reply !== undefined
  || value.admin_note !== undefined
), {
  message: 'At least one field is required.',
})
