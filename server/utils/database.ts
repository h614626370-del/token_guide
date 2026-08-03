import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { getGuideConfig } from './config'

declare global {
  // eslint-disable-next-line no-var
  var __kkflowGuideDatabase: Database.Database | undefined
}

export function useGuideDatabase() {
  if (!globalThis.__kkflowGuideDatabase) {
    const config = getGuideConfig()
    globalThis.__kkflowGuideDatabase = openDatabase(config.dbPath) as Database.Database
  }
  return globalThis.__kkflowGuideDatabase
}

export function closeGuideDatabase() {
  if (!globalThis.__kkflowGuideDatabase) return
  globalThis.__kkflowGuideDatabase.close()
  globalThis.__kkflowGuideDatabase = undefined
}
