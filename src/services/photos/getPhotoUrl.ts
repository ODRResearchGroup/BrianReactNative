import Config from 'react-native-config';

export type GetPhotoUrlResponse = {
  ok: boolean;
  captureId: string;
  photoUrl: string;
  expiresAt: string;
};

export async function getPhotoUrl(
  captureId: string,
  blobName: string,
  container?: string,
): Promise<GetPhotoUrlResponse> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_GET_PHOTO_URL_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing AZURE_GET_PHOTO_URL_KEY');
  }

  const params = new URLSearchParams({
    code: functionKey,
    captureId,
    blobName,
    ...(container ? { container } : {}),
  });

  const res = await fetch(`${baseUrl}/api/get-photo-url?${params.toString()}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`get-photo-url failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GetPhotoUrlResponse;
}
