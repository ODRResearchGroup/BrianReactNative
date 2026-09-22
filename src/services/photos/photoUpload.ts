import ReactNativeBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import type { PhotoBundle } from './photoTypes';

export type UploadPhotoResult = {
  container: string;
  blobName: string;
  contentType: string;
};

function pickImageContentType(fileName?: string | null): string {
  return (fileName ?? '').toLowerCase().endsWith('.png')
    ? 'image/png'
    : 'image/jpeg';
}

function normalizeFilePath(path: string): string {
  return path.startsWith('file://') ? path.replace(/^file:\/\//, '') : path;
}

async function getReadablePath(uri: string): Promise<string> {
  if (uri.startsWith('file://')) {
    return uri.replace(/^file:\/\//, '');
  }
  if (uri.startsWith('content://')) {
    const stat = await ReactNativeBlobUtil.fs.stat(uri);
    if (stat?.path) {
      return stat.path;
    }
  }
  return uri;
}

async function putBytesToSasUrl(
  sasUrl: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const res = await fetch(sasUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType },
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure photo PUT failed: ${res.status} ${text}`);
  }
}

export async function uploadPhotoToAzure(
  localUri: string,
  sasUploadUrl: string,
  container: string,
  blobName: string,
  originalFileName?: string | null,
): Promise<UploadPhotoResult> {
  const readablePath = await getReadablePath(localUri);
  const normalized = normalizeFilePath(readablePath);
  if (!(await ReactNativeBlobUtil.fs.exists(normalized))) {
    throw new Error(`File not found: ${normalized}`);
  }
  const contentType = pickImageContentType(originalFileName ?? blobName);
  const base64 = await ReactNativeBlobUtil.fs.readFile(normalized, 'base64');
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  await putBytesToSasUrl(sasUploadUrl, bytes, contentType);
  return { container, blobName, contentType };
}

export async function uploadPhotoBundleJsonToAzure(
  bundle: PhotoBundle,
  sasUploadUrl: string,
  container: string,
  blobName: string,
): Promise<{ container: string; blobName: string }> {
  const bytes = Uint8Array.from(Buffer.from(JSON.stringify(bundle), 'utf8'));
  await putBytesToSasUrl(sasUploadUrl, bytes, 'application/json');
  return { container, blobName };
}
