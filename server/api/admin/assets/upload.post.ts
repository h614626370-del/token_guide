import { defineEventHandler, readMultipartFormData } from 'h3'
import { saveUploadedImage } from '../../../domain/assets/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data?.length)
  if (!file) {
    apiError(400, 'UPLOAD_FILE_REQUIRED', '请选择要上传的图片。')
  }

  try {
    return apiOk(await saveUploadedImage({
      data: file.data,
      contentType: file.type,
      originalName: file.filename,
    }, event))
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片上传失败。'
    apiError(400, 'UPLOAD_IMAGE_FAILED', message)
  }
})
