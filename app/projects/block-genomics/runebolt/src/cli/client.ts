const API_BASE = process.env.RUNEBOLT_API_URL || 'http://localhost:3000/api/v1';

export async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as Record<string, any>;
  if (!res.ok) {
    throw new Error(data.message || `API error: ${res.status}`);
  }
  return data;
}
