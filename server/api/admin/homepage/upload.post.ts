import { defineEventHandler, readMultipartFormData } from 'h3'
import { stageHomepageFiles } from '../../../domain/homepage/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parts = await readMultipartFormData(event)
  const manifestPart = parts?.find(part => part.name === 'manifest')
  let manifest: string[] = []
  try {
    manifest = JSON.parse(manifestPart?.data.toString('utf8') || '[]')
  } catch {
    apiError(400, 'INVALID_HOMEPAGE_MANIFEST', '首页文件清单格式不正确。')
  }
  const fileParts = (parts || []).filter(part => part.name === 'files' && part.data?.length)
  if (!Array.isArray(manifest) || manifest.length !== fileParts.length) {
    apiError(400, 'INVALID_HOMEPAGE_FILES', '首页文件清单与上传内容不匹配。')
  }
  try {
    return apiOk(await stageHomepageFiles(fileParts.map((part, index) => ({ path: String(manifest[index]), data: part.data })), event))
  } catch (error) {
    apiError(400, 'UPLOAD_HOMEPAGE_FAILED', error instanceof Error ? error.message : '首页上传失败。')
  }
})
