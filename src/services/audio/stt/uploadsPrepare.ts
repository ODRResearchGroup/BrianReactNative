import { STT_CONFIG } from './config';

export type UploadsPrepareResponse = {
  recordingId: string;
  audioUpload: {
    container: string;
    blobName: string;
    uploadUrl: string;
  };
  bundleUpload: {
    container: string;
    blobName: string;
    uploadUrl: string;
  };
};

export async function uploadsPrepare(
  recordingId: string,
  audioExt: 'm4a' | 'wav' = 'm4a',
): Promise<UploadsPrepareResponse> {
  const { BASE_URL, UPLOADS_PREPARE_KEY } = STT_CONFIG;
  if (!BASE_URL || !UPLOADS_PREPARE_KEY) {
    throw new Error('STT_CONFIG: BASE_URL and UPLOADS_PREPARE_KEY must be set');
  }

  const res = await fetch(
    `${BASE_URL}/api/uploads-prepare?code=${encodeURIComponent(
      UPLOADS_PREPARE_KEY,
    )}`,
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

  return (await res.json()) as UploadsPrepareResponse;
}
