export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
 const response = await fetch(`/api${path}`, {...init, signal: init.signal ?? AbortSignal.timeout(40000), headers: {'Content-Type': 'application/json', ...init.headers}});
 if (!response.ok) {
   let message = `The request failed (${response.status}).`;
   try {const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : (Array.isArray(data.detail) ? data.detail.map((d: {msg: string}) => d.msg).join('. ') : message)} catch {}
   throw new Error(message);
 }
 return response.status === 204 ? null as T : response.json();
}
export const json = (data: unknown, method = 'POST'): RequestInit => ({method, body: JSON.stringify(data)});
export const signalLabel = (rssi: number) => rssi >= -60 ? 'Strong' : rssi >= -75 ? 'Fair' : 'Weak';
export const signalColor = (rssi: number) => rssi >= -60 ? '#25876c' : rssi >= -75 ? '#ad7828' : '#bf5c59';
export function download(data: unknown, filename: string) {
 const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
 const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}
