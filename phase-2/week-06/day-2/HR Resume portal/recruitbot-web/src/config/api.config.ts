const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiConfig = {
  baseUrl: configuredBaseUrl || 'http://localhost:3000',
  timeoutMs: 30_000,
  appName: import.meta.env.VITE_APP_NAME?.trim() || 'Codeboard',
  mockEnabled: import.meta.env.VITE_ENABLE_MOCK === 'true',
}
