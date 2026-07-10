const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000

export function todayChinaStartIso(now = new Date()) {
  return chinaDayStartIso(now, 0)
}

export function nextChinaStartIso(now = new Date()) {
  return chinaDayStartIso(now, 1)
}

function chinaDayStartIso(now, dayOffset) {
  const shifted = new Date(now.getTime() + CHINA_TIME_OFFSET_MS)
  const startUtcMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
  ) - CHINA_TIME_OFFSET_MS
  return new Date(startUtcMs).toISOString()
}
