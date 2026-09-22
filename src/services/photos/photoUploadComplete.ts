import Config from 'react-native-config';

export type PhotoUploadCompleteResponse = {
  ok: boolean;
  captureId: string;
  gpsPoint: { lat: number; lon: number; accuracy_m?: number } | null;
  capturedAtMs: number;
};

export async function notifyPhotoUploadComplete(
  captureId: string,
  imageBlobName: string,
  bundleBlobName: string,
): Promise<PhotoUploadCompleteResponse> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_PHOTO_UPLOAD_COMPLETE_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing AZURE_PHOTO_UPLOAD_COMPLETE_KEY');
  }

  const res = await fetch(
    `${baseUrl}/api/photo-upload-complete?code=${encodeURIComponent(
      functionKey,
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId, imageBlobName, bundleBlobName }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`photo-upload-complete failed: ${res.status} ${text}`);
  }
  return (await res.json()) as PhotoUploadCompleteResponse;
}
