import { defineEventHandler, getRouterParam, readMultipartFormData } from 'h3'
import { replaceUploadedImage } from '../../../domain/assets/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const filename = getRouterParam(event, 'filename') || ''
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data?.length)
  if (!file) apiError(400, 'REPLACE_FILE_REQUIRED', '请选择要替换的图片。')
  try {
    return apiOk(await replaceUploadedImage(filename, { data: file.data, contentType: file.type }, event))
  } catch (error) {
    apiError(400, 'REPLACE_IMAGE_FAILED', error instanceof Error ? error.message : '图片替换失败。')
  }
})
