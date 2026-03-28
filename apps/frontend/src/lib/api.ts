export class ApiError extends Error {
  status?: number;
  code?: string;
  data?: unknown;

  constructor(message: string, status?: number, code?: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export const fetchApi = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const hasBody = typeof options?.body !== 'undefined';
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...options?.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep data as undefined if parsing fails
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || response.statusText,
      response.status,
      data?.code,
      data
    );
  }

  return data;
};
