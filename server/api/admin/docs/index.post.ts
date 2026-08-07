import { readMultipartFormData } from 'h3'
import { createDocsRepository, parseFrontmatter } from '../../../domain/docs/repository'
import { customDocUploadSchema } from '../../../domain/docs/schema'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

const MAX_MARKDOWN_BYTES = 100_000

function field(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
  const part = parts?.find(item => item.name === name && !item.filename)
  return part?.data?.toString('utf8') || undefined
}

function slugFromFilename(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, '').toLowerCase()
  const slug = stem
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `/${slug || `document-${Date.now()}`}`
}

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(item => item.name === 'file' && Boolean(item.filename) && Boolean(item.data))
  if (!file?.data || !file.filename) apiError(400, 'DOC_FILE_REQUIRED', '请选择一个 Markdown 文件。')
  if (file.data.length > MAX_MARKDOWN_BYTES) apiError(413, 'DOC_FILE_TOO_LARGE', 'Markdown 文件不能超过 100 KB。')
  if (!/\.(md|markdown|mdown)$/i.test(file.filename)) apiError(400, 'DOC_FILE_TYPE', '只支持 .md、.markdown 或 .mdown 文件。')

  const markdown = file.data.toString('utf8').replace(/^\uFEFF/, '')
  const fallbackLabel = file.filename.replace(/\.[^.]+$/, '').trim() || '未命名文档'
  const content = parseFrontmatter(markdown, fallbackLabel)
  const parsed = customDocUploadSchema.safeParse({
    label: field(parts, 'label'),
    path: field(parts, 'path'),
  })
  if (!parsed.success) apiError(400, 'INVALID_DOC_UPLOAD', '文档名称或路径格式不正确。', parsed.error.flatten())

  const path = parsed.data.path || slugFromFilename(file.filename)
  const label = parsed.data.label || content.title || fallbackLabel
  const doc = createDocsRepository(useGuideDatabase()).createCustom({ path, label, content })
  if (!doc) apiError(409, 'DOC_PATH_EXISTS', '这个文档路径已经存在，请更换文件名或路径。')
  return apiOk(doc)
})
