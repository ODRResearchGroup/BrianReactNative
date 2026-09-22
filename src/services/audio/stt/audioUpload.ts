import { readFile } from 'react-native-fs';
import { Buffer } from 'buffer';

async function putBytesToSasUrl(
  sasUrl: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const res = await fetch(sasUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': contentType,
    },
    body: bytes,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure PUT failed: ${res.status} ${text}`);
  }
}

export async function uploadAudioToAzure(
  localUri: string,
  sasUploadUrl: string,
): Promise<void> {
  const path = localUri.startsWith('file://')
    ? localUri.replace('file://', '')
    : localUri;
  const base64 = await readFile(path, 'base64');
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  await putBytesToSasUrl(sasUploadUrl, bytes, 'audio/mp4');
}
