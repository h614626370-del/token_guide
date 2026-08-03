import { defineEventHandler } from 'h3'
import { apiOk } from '../../utils/api'
import { listMaskedPlaygroundKeys } from '../../utils/playground'

export default defineEventHandler(async (event) => {
  return apiOk(await listMaskedPlaygroundKeys(event))
})
