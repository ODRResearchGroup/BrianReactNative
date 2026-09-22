import Config from 'react-native-config';

export type ProcessedStatusResponse = {
  schema: string;
  recordingId: string;
  status: string; // "uploaded" | "processing" | "transcribed" | "failed"
};

export async function fetchProcessedStatus(
  recordingId: string,
): Promise<ProcessedStatusResponse | null> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_PROCESSED_STATUS_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing AZURE_PROCESSED_STATUS_KEY');
  }

  const url =
    `${baseUrl}/api/processed-status` +
    `?recordingId=${encodeURIComponent(recordingId)}` +
    `&code=${encodeURIComponent(functionKey)}`;

  const res = await fetch(url, { method: 'GET' });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`processed-status failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  console.log('[processedStatus] raw response:', JSON.stringify(json));
  // Handle both flat { status: 'transcribed', ... } and nested { status: { ... } }
  const inner =
    typeof json?.status === 'object' && json.status !== null
      ? json.status
      : json;
  return {
    schema: inner.schema ?? '',
    recordingId: inner.recordingId ?? recordingId,
    status: typeof inner.status === 'string' ? inner.status : '',
  };
}
