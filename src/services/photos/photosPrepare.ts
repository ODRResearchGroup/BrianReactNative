import Config from 'react-native-config';

export type PhotosPrepareResponse = {
  captureId: string;
  imageUpload: { container: string; blobName: string; uploadUrl: string };
  bundleUpload: { container: string; blobName: string; uploadUrl: string };
  expiresIn: number;
};

export async function photosPrepare(
  captureId: string,
  imageExt: 'jpg' | 'png' = 'jpg',
): Promise<PhotosPrepareResponse> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_FUNCTION_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing Azure function env config');
  }

  const res = await fetch(
    `${baseUrl}/api/photos-prepare?code=${encodeURIComponent(functionKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId, imageExt }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`photos-prepare failed: ${res.status} ${text}`);
  }
  return (await res.json()) as PhotosPrepareResponse;
}
