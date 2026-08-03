export function normalizeVersion(value: string) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
}

export function isSemverLike(value: string) {
  return /^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(normalizeVersion(value))
}

/** Compare two version strings. Returns >0 if left is newer, <0 if right is newer, 0 if equal/unknown. */
export function compareVersions(left: string, right: string) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) {
    const an = normalizeVersion(left)
    const bn = normalizeVersion(right)
    if (!an || !bn) return 0
    return an === bn ? 0 : an > bn ? 1 : -1
  }

  for (let index = 0; index < 3; index += 1) {
    const leftPart = a.parts[index] ?? 0
    const rightPart = b.parts[index] ?? 0
    const diff = leftPart - rightPart
    if (diff !== 0) return diff
  }

  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease > b.prerelease ? 1 : -1
}

export function isUpdateAvailable(current: string, latest: string) {
  const currentNormalized = normalizeVersion(current)
  const latestNormalized = normalizeVersion(latest)
  if (!currentNormalized || !latestNormalized) return false
  if (currentNormalized === 'dev' || currentNormalized === '0.0.0') {
    return latestNormalized !== currentNormalized
  }
  if (currentNormalized === 'latest') {
    return latestNormalized !== currentNormalized
  }
  return compareVersions(latestNormalized, currentNormalized) > 0
}

export function toImageTag(version: string) {
  const normalized = normalizeVersion(version)
  if (!normalized) return 'latest'
  if (normalized === 'latest') return 'latest'
  return `v${normalized}`
}

function parseVersion(value: string) {
  const normalized = normalizeVersion(value)
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-.](.+))?$/)
  if (!match) return null
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || '',
  }
}
