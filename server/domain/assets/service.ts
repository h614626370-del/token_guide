import crypto from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { H3Event } from 'h3'
import { getGuideConfig } from '../../utils/config'

const maxImageBytes = 2 * 1024 * 1024
const allowedImageTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

export interface UploadedAsset {
  filename: string
  url: string
  content_type: string
  size: number
}

export interface AssetListItem extends UploadedAsset {
  created_at: string
}

export interface PublicAsset {
  filename: string
  contentType: string
  bytes: Buffer
  size: number
}

export function uploadsRoot(event?: H3Event) {
  return path.join(path.dirname(getGuideConfig(event).dbPath), 'uploads')
}

export function publicUploadUrl(filename: string, event?: H3Event) {
  return new URL(`/uploads/${filename}`, `${getGuideConfig(event).siteUrl}/`).toString()
}

export async function saveUploadedImage(input: {
  data: Buffer
  contentType?: string
  originalName?: string
}, event?: H3Event): Promise<UploadedAsset> {
  const contentType = normalizeContentType(input.contentType || '')
  const ext = allowedImageTypes.get(contentType)
  if (!ext) {
    throw new Error('仅支持 PNG、JPG、WebP 或 GIF 图片。')
  }
  if (!input.data.length) {
    throw new Error('上传文件不能为空。')
  }
  if (input.data.length > maxImageBytes) {
    throw new Error('图片不能超过 2MB。')
  }
  if (detectImageContentType(input.data) !== contentType) {
    throw new Error('图片文件内容与格式不匹配。')
  }

  const root = uploadsRoot(event)
  await mkdir(root, { recursive: true })
  const basename = safeBaseName(input.originalName || 'image')
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  const filename = `${stamp}-${basename}-${crypto.randomBytes(5).toString('hex')}.${ext}`
  await writeFile(path.join(root, filename), input.data, { flag: 'wx' })

  return {
    filename,
    url: publicUploadUrl(filename, event),
    content_type: contentType,
    size: input.data.length,
  }
}

export async function readPublicAsset(filename: string, event?: H3Event): Promise<PublicAsset | null> {
  if (!isSafeAssetFilename(filename)) return null
  const root = uploadsRoot(event)
  const fullPath = path.join(root, filename)
  const resolved = path.resolve(fullPath)
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) return null

  try {
    const info = await stat(resolved)
    if (!info.isFile()) return null
    const ext = path.extname(filename).slice(1).toLowerCase()
    const contentType = contentTypeFromExt(ext)
    if (!contentType) return null
    return {
      filename,
      contentType,
      bytes: await readFile(resolved),
      size: info.size,
    }
  } catch {
    return null
  }
}

export async function listUploadedAssets(event?: H3Event): Promise<AssetListItem[]> {
  const root = uploadsRoot(event)
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const items = await Promise.all(entries
      .filter(entry => entry.isFile() && isSafeAssetFilename(entry.name))
      .map(async (entry) => {
        const info = await stat(path.join(root, entry.name))
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        return {
          filename: entry.name,
          url: publicUploadUrl(entry.name, event),
          content_type: contentTypeFromExt(ext),
          size: info.size,
          created_at: info.mtime.toISOString(),
        }
      }))
    return items
      .filter(item => item.content_type)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  } catch {
    return []
  }
}

export async function deleteUploadedAsset(filename: string, event?: H3Event) {
  if (!isSafeAssetFilename(filename)) return false
  const root = uploadsRoot(event)
  const fullPath = path.join(root, filename)
  const resolved = path.resolve(fullPath)
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) return false

  try {
    await unlink(resolved)
    return true
  } catch {
    return false
  }
}

function normalizeContentType(value: string) {
  return value.split(';', 1)[0]?.trim().toLowerCase() || ''
}

function detectImageContentType(data: Buffer) {
  if (data.length >= 8
    && data[0] === 0x89
    && data[1] === 0x50
    && data[2] === 0x4e
    && data[3] === 0x47
    && data[4] === 0x0d
    && data[5] === 0x0a
    && data[6] === 0x1a
    && data[7] === 0x0a) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }
  if (data.length >= 6 && (data.subarray(0, 6).toString('ascii') === 'GIF87a' || data.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return 'image/gif'
  }
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  return ''
}

function contentTypeFromExt(ext: string) {
  for (const [contentType, itemExt] of allowedImageTypes.entries()) {
    if (itemExt === ext) return contentType
  }
  return ''
}

function safeBaseName(value: string) {
  const withoutExt = path.basename(value).replace(/\.[^.]+$/, '')
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return slug || 'image'
}

function isSafeAssetFilename(value: string) {
  return /^[0-9]{14}-[a-z0-9-]{1,32}-[a-f0-9]{10}\.(png|jpg|webp|gif)$/.test(value)
}
