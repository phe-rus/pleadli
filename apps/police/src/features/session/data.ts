import { api, ApiError, setBrowserToken } from '@/lib/api'
import * as z from 'zod'
import {
  actorSchema,
  authEventSchema,
  authPolicySchema,
  commandSetupSchema,
  installationSchema,
  signInSchema,
  stationSetupSchema,
  type CommandSetupInput,
  type SignInInput,
  type StationSetupInput,
} from './schema'

export async function getInstallation() {
  return installationSchema.parse(await api('/system/state'))
}

/** The officer signed in at this window, or null. */
export async function getMe() {
  try {
    return actorSchema.parse(await api('/auth/me'))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

function keepBrowserToken(result: { token?: string }) {
  // The desktop shell holds the token and does not pass it on.
  if (result.token) setBrowserToken(result.token)
}

export async function signIn(input: SignInInput) {
  const parsed = signInSchema.parse(input)
  const body = { badgeNumber: parsed.badgeNumber.trim(), password: parsed.password || null }
  keepBrowserToken(await api('/auth/sign-in', { method: 'POST', body: JSON.stringify(body) }))
}

/** An administrator with no password yet chooses one, and is signed in. */
export async function chooseFirstPassword(input: { badgeNumber: string; password: string }) {
  keepBrowserToken(await api('/auth/first-password', { method: 'POST', body: JSON.stringify({ badgeNumber: input.badgeNumber.trim(), password: input.password }) }))
}

export async function signOut() {
  try {
    await api('/auth/sign-out', { method: 'POST' })
  } finally {
    setBrowserToken(null)
  }
}

function administratorBody(input: StationSetupInput['administrator']) {
  return {
    existingOfficerId: input.existingOfficerId,
    name: input.name.trim() || null,
    rank: input.rank.trim() || null,
    badgeNumber: input.badgeNumber.trim(),
    password: input.password || null,
  }
}

export async function setupStation(input: StationSetupInput) {
  const parsed = stationSetupSchema.parse(input)
  const body = {
    stationName: parsed.stationName.trim(),
    region: parsed.region.trim() || null,
    district: parsed.district.trim() || null,
    division: parsed.division.trim() || null,
    administrator: administratorBody(parsed.administrator),
  }
  keepBrowserToken(await api('/system/onboarding/station', { method: 'POST', body: JSON.stringify(body) }))
}

export async function setupCommand(input: CommandSetupInput) {
  const parsed = commandSetupSchema.parse(input)
  const body = { commandName: parsed.commandName.trim(), level: parsed.level, administrator: administratorBody(parsed.administrator) }
  keepBrowserToken(await api('/system/onboarding/command', { method: 'POST', body: JSON.stringify(body) }))
}

/** Dev builds only: the application has no such route in a release build. */
export async function setDevMode(mode: 'station' | 'command') {
  return installationSchema.parse(await api('/system/dev-mode', { method: 'POST', body: JSON.stringify({ mode }) }))
}

export async function getAuthPolicy() {
  return authPolicySchema.parse(await api('/auth/policy'))
}

export async function saveAuthPolicy(input: { mode: 'badge_only' | 'password'; idleTimeoutMinutes: number }) {
  return authPolicySchema.parse(await api('/auth/policy', { method: 'PUT', body: JSON.stringify(input) }))
}

export async function listAuthEvents() {
  return z.array(authEventSchema).parse(await api('/auth/events'))
}
