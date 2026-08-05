import { z } from 'zod'

export const installerTools = ['codex', 'claude'] as const
export const installerPlatforms = ['windows', 'macos', 'linux'] as const
export const installerScriptIds = [
  'codex-windows',
  'codex-macos',
  'codex-linux',
  'claude-windows',
  'claude-macos',
  'claude-linux',
] as const

export type InstallerTool = typeof installerTools[number]
export type InstallerPlatform = typeof installerPlatforms[number]
export type InstallerScriptId = typeof installerScriptIds[number]

export const installerToolSchema = z.enum(installerTools)
export const installerPlatformSchema = z.enum(installerPlatforms)

export const installerSettingsSchema = z.object({
  provider_id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  base_url: z.string().trim().url().max(500).refine(value => value.startsWith('https://'), 'BASE_URL must use HTTPS.'),
  codex_default_model: z.string().trim().max(120),
  claude_default_model: z.string().trim().max(120),
}).strict()

export const installerScriptUpdateSchema = z.object({
  content: z.string().min(1).max(200_000),
}).strict()

export const installerCommandSchema = z.object({
  tool: installerToolSchema,
  platform: installerPlatformSchema,
  key_id: z.coerce.number().int().positive(),
}).strict()

export type InstallerSettingsInput = z.infer<typeof installerSettingsSchema>
