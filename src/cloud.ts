/** The private library kept on the site, so pieces sent from the Mac can be downloaded to this device. */

const PASSCODE_KEY = 'library:passcode'

export interface CloudPiece {
  path: string
  name: string
  size: number
  uploadedAt: string
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message)
  }
}

export const getPasscode = (): string => {
  try {
    return localStorage.getItem(PASSCODE_KEY) ?? ''
  } catch {
    return ''
  }
}

export const setPasscode = (passcode: string): void => {
  try {
    if (passcode) localStorage.setItem(PASSCODE_KEY, passcode)
    else localStorage.removeItem(PASSCODE_KEY)
  } catch {
    /* storage unavailable */
  }
}

async function request(query: string, init: RequestInit = {}, passcode = getPasscode()): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`/api/library${query}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${passcode}` },
      cache: 'no-store',
    })
  } catch {
    throw new CloudError('Cannot reach your library. Are you offline?')
  }
  // A site without the service answers every address with its home page.
  if (response.ok && (response.headers.get('content-type') ?? '').includes('text/html')) {
    throw new CloudError('The library service is not available at this address.', 404)
  }
  if (response.ok) return response
  let message = ''
  try {
    message = ((await response.json()) as { error?: string }).error ?? ''
  } catch {
    /* not JSON: the service is not at this address */
  }
  if (response.status === 401) throw new CloudError('That passcode is not right.', 401)
  if (response.status === 404 && !message) throw new CloudError('The library service is not available at this address.', 404)
  throw new CloudError(message || `The library answered with an error (${response.status}).`, response.status)
}

/** Lists the pieces in the library; also the way to check a passcode. */
export async function listCloud(passcode?: string): Promise<CloudPiece[]> {
  return (await (await request('', {}, passcode)).json()) as CloudPiece[]
}

export async function downloadCloud(path: string): Promise<ArrayBuffer> {
  return (await request(`?path=${encodeURIComponent(path)}`)).arrayBuffer()
}

export async function removeFromCloud(path: string): Promise<void> {
  await request(`?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
}

/** The name a piece has on this device: the file name without its extension. */
export const localName = (cloudName: string): string => cloudName.replace(/\.(musicxml|mxl|xml)$/i, '')
