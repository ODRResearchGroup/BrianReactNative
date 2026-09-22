import Config from 'react-native-config';

export type UploadsPrepareResponse = {
  recordingId: string;
  audioUpload: { container: string; blobName: string; uploadUrl: string };
  bundleUpload: { container: string; blobName: string; uploadUrl: string };
};

export async function uploadsPrepare(
  recordingId: string,
  audioExt: 'm4a' | 'wav' = 'm4a',
): Promise<UploadsPrepareResponse> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_UPLOADS_PREPARE_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing AZURE_UPLOADS_PREPARE_KEY');
  }

  const res = await fetch(
    `${baseUrl}/api/uploads-prepare?code=${encodeURIComponent(functionKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId, audioExt }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`uploads-prepare failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as UploadsPrepareResponse;
  console.log('[uploadsPrepare] response:', JSON.stringify(data));
  return data;
}
