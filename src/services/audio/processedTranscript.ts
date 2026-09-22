import Config from 'react-native-config';

export type TranscriptPhrase = {
  index: number;
  text: string;
  start_ms: number;
  end_ms: number;
  timestamp_ms: number;
  coord: { lat: number; lon: number };
};

export type ProcessedTranscriptResponse = {
  schema: string;
  recordingId: string;
  phrases: TranscriptPhrase[];
};

export function transcriptToPlainText(t: ProcessedTranscriptResponse): string {
  const phrases = t.phrases
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(p => p.text.trim())
    .filter(Boolean);
  // Remove consecutive identical phrases (stereo duplicates that slipped through)
  return phrases.filter((p, i) => p !== phrases[i - 1]).join(' ');
}

export function deduplicateTranscript(text: string): string {
  if (!text) {
    return text;
  }
  const half = Math.floor(text.length / 2);
  if (text.slice(0, half).trim() === text.slice(half).trim()) {
    return text.slice(0, half).trim();
  }
  const phrases = text.split(/\s{2,}|\.\s+/);
  return phrases
    .filter((p, i) => p.trim() !== phrases[i - 1]?.trim())
    .join('. ')
    .replace(/\.\./g, '.');
}

export async function fetchProcessedTranscript(
  recordingId: string,
): Promise<ProcessedTranscriptResponse | null> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_PROCESSED_TRANSCRIPT_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing AZURE_PROCESSED_TRANSCRIPT_KEY');
  }

  const url =
    `${baseUrl}/api/processed-transcript` +
    `?recordingId=${encodeURIComponent(recordingId)}` +
    `&code=${encodeURIComponent(functionKey)}`;

  const res = await fetch(url, { method: 'GET' });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`processed-transcript failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const blob = json?.transcript ?? json;

  if (Array.isArray(blob?.phrases)) {
    return blob as ProcessedTranscriptResponse;
  }

  // Normalize Azure Speech API shape — keep channel 0 only to avoid stereo duplicates
  const recognizedPhrases: any[] = (blob?.recognizedPhrases ?? []).filter(
    (p: any) => p.channel === 0 || p.channel == null,
  );
  return {
    schema: 'processed_transcript_v1',
    recordingId,
    phrases: recognizedPhrases.map((p: any, i: number) => ({
      index: i,
      text: p.nBest?.[0]?.display ?? p.nBest?.[0]?.lexical ?? '',
      start_ms: offsetToMs(p.offset),
      end_ms: offsetToMs(p.offset) + offsetToMs(p.duration),
      timestamp_ms: offsetToMs(p.offset),
      coord: { lat: 0, lon: 0 },
    })),
  };
}

function offsetToMs(raw: string | number | undefined): number {
  if (!raw) {
    return 0;
  }
  if (typeof raw === 'number') {
    return Math.round(raw / 10_000);
  }
  const m = String(raw).match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (m) {
    return Math.round((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 1000);
  }
  return 0;
}
