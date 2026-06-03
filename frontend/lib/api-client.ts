import logger from './logger'

const API_PROXY_PATH = '/api/proxy';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_PROXY_PATH}${endpoint}`;
  const method = options.method || 'GET';

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.log('error', `API请求失败: ${method} ${endpoint} - HTTP ${response.status}`, 'APIClient', 'request')
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    const parsed = JSON.parse(text);

    if (!('success' in parsed)) {
      throw new Error(`API 响应格式错误：缺少 success 字段，endpoint: ${endpoint}`);
    }

    const apiResponse = parsed as ApiResponse<T>;
    if (!apiResponse.success) {
      logger.log('warn', `API操作失败: ${endpoint} - ${apiResponse.message}`, 'APIClient', 'request')
      throw new Error(apiResponse.message || '操作失败');
    }

    logger.log('log', `API请求成功: ${method} ${endpoint}`, 'APIClient', 'request')
    return apiResponse.data as T;
  } catch (error) {
    logger.log('error', `API请求异常: ${method} ${endpoint} - ${error}`, 'APIClient', 'request')
    throw error;
  }
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'GET' });
}

export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(endpoint: string, body?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: 'DELETE' });
}