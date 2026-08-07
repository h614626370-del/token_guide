import { defineEventHandler, readMultipartFormData } from 'h3'
import { stageHomepageArchive, stageHomepageFiles, stageHomepageIndex, stageHomepageMerge } from '../../../domain/homepage/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

type UploadMode = 'index' | 'merge' | 'directory' | 'archive'

function textPart(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string) {
  return parts?.find(part => part.name === name)?.data.toString('utf8') || ''
}

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parts = await readMultipartFormData(event)
  const mode = (textPart(parts, 'mode') || 'directory') as UploadMode

  try {
    if (mode === 'index') {
      const file = parts?.find(part => part.name === 'file' && part.filename)
      if (!file) apiError(400, 'INVALID_HOMEPAGE_FILE', '请选择 index.html 文件。')
      return apiOk(await stageHomepageIndex({ path: file.filename || 'index.html', data: file.data }, event))
    }

    if (mode === 'archive') {
      const archive = parts?.find(part => part.name === 'archive' && part.filename)
      if (!archive) apiError(400, 'INVALID_HOMEPAGE_ARCHIVE', '请选择 ZIP 压缩包。')
      return apiOk(await stageHomepageArchive(archive.data, event))
    }

    if (mode !== 'merge' && mode !== 'directory') apiError(400, 'INVALID_HOMEPAGE_MODE', '首页上传方式不正确。')
    const manifestPart = parts?.find(part => part.name === 'manifest')
    let manifest: string[] = []
    try {
      manifest = JSON.parse(manifestPart?.data.toString('utf8') || '[]')
    } catch {
      apiError(400, 'INVALID_HOMEPAGE_MANIFEST', '首页文件清单格式不正确。')
    }
    const fileParts = (parts || []).filter(part => part.name === 'files' && part.filename)
    if (!Array.isArray(manifest) || manifest.length !== fileParts.length) {
      apiError(400, 'INVALID_HOMEPAGE_FILES', '首页文件清单与上传内容不匹配，请重新选择整个目录。')
    }
    const files = fileParts.map((part, index) => ({ path: String(manifest[index]), data: part.data }))
    return apiOk(mode === 'merge' ? await stageHomepageMerge(files, event) : await stageHomepageFiles(files, event))
  } catch (error) {
    apiError(400, 'UPLOAD_HOMEPAGE_FAILED', error instanceof Error ? error.message : '首页上传失败。')
  }
})
