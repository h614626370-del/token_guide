import { defineEventHandler } from 'h3'
import { codexInstallerResponse } from '../utils/codex-installer-response'

export default defineEventHandler(event => codexInstallerResponse(event, 'windows'))
