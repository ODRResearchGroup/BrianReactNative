import { STT_CONFIG } from './config';

export async function fetchTranscriptText(
  recordingId: string,
): Promise<string> {
  const { BASE_URL, PROCESSED_TRANSCRIPT_KEY } = STT_CONFIG;
  if (!BASE_URL || !PROCESSED_TRANSCRIPT_KEY) {
    throw new Error(
      'STT_CONFIG: BASE_URL and PROCESSED_TRANSCRIPT_KEY must be set',
    );
  }

  const res = await fetch(
    `${BASE_URL}/api/processed-transcript` +
      `?recordingId=${encodeURIComponent(recordingId)}` +
      `&code=${encodeURIComponent(PROCESSED_TRANSCRIPT_KEY)}`,
  );

  if (res.status === 404) {
    return '';
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`processed-transcript failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const blob = json?.transcript ?? json;

  // Already normalised (saved by stt-poll with phrases array)
  if (Array.isArray(blob?.phrases)) {
    return blob.phrases
      .slice()
      .sort((a: any, b: any) => a.index - b.index)
      .map((p: any) => p.text?.trim())
      .filter(Boolean)
      .join(' ');
  }

  // Raw Azure Speech shape with recognizedPhrases
  const phrases: any[] = blob?.recognizedPhrases ?? [];
  return phrases
    .filter((p: any) => (p.channel ?? 0) === 0)
    .map((p: any) => p.nBest?.[0]?.display ?? p.nBest?.[0]?.lexical ?? '')
    .filter(Boolean)
    .join(' ');
}
