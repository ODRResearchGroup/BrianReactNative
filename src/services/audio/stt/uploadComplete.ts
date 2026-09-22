import { STT_CONFIG } from './config';

export async function notifyUploadComplete(
  recordingId: string,
  audioExt: 'm4a' | 'wav' = 'm4a',
  locale: string = 'en-US',
): Promise<void> {
  const { BASE_URL, UPLOAD_COMPLETE_KEY } = STT_CONFIG;
  if (!BASE_URL || !UPLOAD_COMPLETE_KEY) {
    throw new Error('STT_CONFIG: BASE_URL and UPLOAD_COMPLETE_KEY must be set');
  }

  const res = await fetch(
    `${BASE_URL}/api/upload-complete?code=${encodeURIComponent(
      UPLOAD_COMPLETE_KEY,
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId, audioExt, locale }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upload-complete failed: ${res.status} ${text}`);
  }
}
