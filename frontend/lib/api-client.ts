const API_PROXY_PATH = '/api/proxy'

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_PROXY_PATH}${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('API Error:', response.status, errorText)
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const text = await response.text()
  if (!text) return {} as T
  const data = JSON.parse(text)
  return data
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'GET' })
}

export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiPut<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'DELETE' })
}
