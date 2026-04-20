// Credential persistence via safeStorage. On Linux, if encryption is
// unavailable we store plaintext AND set a flag so the renderer can warn.

import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Credentials } from '@shared/types'
import { logger } from '@utils/logger'

const FILE_NAME = 'credentials.bin'
const PLAINTEXT_MARKER = 'PLAIN:'
const ENCRYPTED_MARKER = 'ENC:'

function credPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

export function saveEncryptedCredentials(username: string, password: string): void {
  const path = credPath()
  const payload = JSON.stringify({ username, password })
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(payload)
      writeFileSync(path, Buffer.concat([Buffer.from(ENCRYPTED_MARKER), buf]))
      return
    }
    logger.warn(
      'safeStorage encryption unavailable on this platform — storing credentials in plaintext'
    )
    writeFileSync(path, PLAINTEXT_MARKER + payload, { encoding: 'utf8' })
  } catch (err) {
    logger.error('failed to save credentials', err)
    throw err
  }
}

export function loadEncryptedCredentials(): Credentials | null {
  const path = credPath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path)
    const head = raw.subarray(0, ENCRYPTED_MARKER.length).toString('utf8')
    if (head === ENCRYPTED_MARKER) {
      const body = raw.subarray(ENCRYPTED_MARKER.length)
      const decrypted = safeStorage.decryptString(body)
      return JSON.parse(decrypted) as Credentials
    }
    const str = raw.toString('utf8')
    if (str.startsWith(PLAINTEXT_MARKER)) {
      return JSON.parse(str.slice(PLAINTEXT_MARKER.length)) as Credentials
    }
    return null
  } catch (err) {
    logger.error('failed to load credentials', err)
    return null
  }
}

export function clearCredentials(): void {
  const path = credPath()
  if (existsSync(path)) rmSync(path)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
