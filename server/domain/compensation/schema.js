import { z } from 'zod'

export const compensationOperations = ['add', 'subtract', 'set']

export const compensationPreviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD.'),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'start_time must use HH:mm.'),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'end_time must use HH:mm.'),
  timezone: z.string().trim().min(1).max(80).default('Asia/Shanghai'),
  operation: z.enum(compensationOperations).default('add'),
  amount: z.coerce.number().finite().positive(),
}).strict()

export const compensationExecuteSchema = compensationPreviewSchema.extend({
  notes: z.string().trim().min(1).max(500),
  preview_fingerprint: z.string().trim().regex(/^[a-f0-9]{64}$/),
  execution_key: z.string().uuid(),
}).strict()

export const compensationTestSchema = z.object({
  target_type: z.enum(['id', 'account']),
  target: z.string().trim().min(1).max(320),
  operation: z.enum(compensationOperations).default('add'),
  amount: z.coerce.number().finite().positive(),
  notes: z.string().trim().min(1).max(500),
}).strict()

export const compensationRetrySchema = z.object({
  notes: z.string().trim().max(500).optional(),
}).strict()
