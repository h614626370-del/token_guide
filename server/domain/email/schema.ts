import { z } from 'zod'

const emailAddress = z.string().trim().max(320).refine(
  value => !value || z.string().email().safeParse(value).success,
  '必须是有效的邮箱地址',
)

export const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  smtp_host: z.string().trim().max(255),
  smtp_port: z.coerce.number().int().min(1).max(65535),
  smtp_secure: z.boolean(),
  smtp_username: z.string().trim().max(320),
  smtp_password: z.string().max(1024).optional().nullable(),
  clear_smtp_password: z.boolean().optional(),
  from_name: z.string().trim().max(120),
  from_email: emailAddress,
  admin_email: emailAddress,
  admin_subject_template: z.string().trim().min(1).max(500),
  admin_body_template: z.string().trim().min(1).max(20_000),
  reply_subject_template: z.string().trim().min(1).max(500),
  reply_body_template: z.string().trim().min(1).max(20_000),
}).strict().superRefine((value, context) => {
  if (!value.enabled) return
  for (const key of ['smtp_host', 'from_email', 'admin_email'] as const) {
    if (!value[key]) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: '启用邮件通知时不能为空' })
    }
  }
})

export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>