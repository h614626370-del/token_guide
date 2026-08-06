import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { getGuideConfig } from './config'

declare global {
  // eslint-disable-next-line no-var
  var __guideDatabase: Database.Database | undefined
}

export function useGuideDatabase() {
  if (!globalThis.__guideDatabase) {
    const config = getGuideConfig()
    globalThis.__guideDatabase = openDatabase(config.dbPath) as Database.Database
  }
  return globalThis.__guideDatabase
}

export function closeGuideDatabase() {
  if (!globalThis.__guideDatabase) return
  globalThis.__guideDatabase.close()
  globalThis.__guideDatabase = undefined
}
