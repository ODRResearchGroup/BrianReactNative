import { STT_CONFIG } from './config';

export type ProcessedStatus =
  | 'uploaded'
  | 'processing'
  | 'transcribed'
  | 'failed';

export async function fetchProcessedStatus(
  recordingId: string,
): Promise<ProcessedStatus | null> {
  const { BASE_URL, PROCESSED_STATUS_KEY } = STT_CONFIG;
  if (!BASE_URL || !PROCESSED_STATUS_KEY) {
    throw new Error(
      'STT_CONFIG: BASE_URL and PROCESSED_STATUS_KEY must be set',
    );
  }

  const res = await fetch(
    `${BASE_URL}/api/processed-status` +
      `?recordingId=${encodeURIComponent(recordingId)}` +
      `&code=${encodeURIComponent(PROCESSED_STATUS_KEY)}`,
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`processed-status failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const inner = json?.status ?? json;
  return (inner.status ?? '') as ProcessedStatus;
}
