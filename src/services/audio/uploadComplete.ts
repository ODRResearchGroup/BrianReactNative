import Config from 'react-native-config';

export type UploadCompleteResponse = {
  ok: boolean;
  recordingId: string;
  kickedOff: boolean;
};

export async function notifyUploadComplete(
  recordingId: string,
  audioExt: 'm4a' | 'wav' = 'm4a',
  locale: string = Config.AZURE_STT_LOCALE ?? 'en-US',
): Promise<UploadCompleteResponse> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_UPLOAD_COMPLETE_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error(
      'Missing AZURE_FUNCTION_BASE_URL or AZURE_UPLOAD_COMPLETE_KEY',
    );
  }

  const res = await fetch(
    `${baseUrl}/api/upload-complete?code=${encodeURIComponent(functionKey)}`,
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
  const data = (await res.json()) as UploadCompleteResponse;
  console.log('[uploadComplete] response:', JSON.stringify(data));
  return data;
}
