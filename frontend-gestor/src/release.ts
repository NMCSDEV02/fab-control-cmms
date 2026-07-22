export const APP_RELEASE_VERSION = '1.4.0-dev'
export const API_COMPATIBLE_RELEASE = '1.3.1'

export function isCompatibleRelease(receivedVersion?: string): boolean {
  return receivedVersion?.trim() === API_COMPATIBLE_RELEASE
}
