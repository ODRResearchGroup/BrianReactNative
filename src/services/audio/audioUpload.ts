import ReactNativeBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';
import type { AudioTrackBundle } from './audioTrack';

export type UploadAudioResult = { container: string; blobName: string };

function pickAudioContentType(ext: string) {
  if (ext === 'm4a') {
    return 'audio/mp4';
  }
  if (ext === 'aac') {
    return 'audio/aac';
  }
  if (ext === 'wav') {
    return 'audio/wav';
  }
  return 'application/octet-stream';
}

function normalizeFilePath(path: string) {
  return path.startsWith('file://') ? path.replace(/^file:\/\//, '') : path;
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
    throw new Error(`Azure PUT failed: ${res.status} ${text}`);
  }
}

export async function uploadAudioToAzure(
  localUri: string,
  sasUploadUrl: string,
  container: string,
  blobName: string,
): Promise<UploadAudioResult> {
  const normalized = normalizeFilePath(localUri);
  if (!(await ReactNativeBlobUtil.fs.exists(normalized))) {
    throw new Error(`File not found: ${normalized}`);
  }
  const ext = normalized.split('.').pop()?.toLowerCase() || 'm4a';
  const contentType = pickAudioContentType(ext);
  // Use ReactNativeBlobUtil.fetch to stream the file — avoids Uint8Array/Content-Length issues
  const res = await ReactNativeBlobUtil.fetch(
    'PUT',
    sasUploadUrl,
    { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType },
    ReactNativeBlobUtil.wrap(normalized),
  );
  if (res.respInfo.status < 200 || res.respInfo.status >= 300) {
    throw new Error(`Azure PUT failed: ${res.respInfo.status} ${res.text()}`);
  }
  return { container, blobName };
}

export async function uploadAudioTrackJsonToAzure(
  track: AudioTrackBundle,
  sasUploadUrl: string,
  container: string,
  blobName: string,
  audioRef: { container: string; blobName: string },
) {
  const payload = { ...track, audio: audioRef };
  const bytes = Uint8Array.from(Buffer.from(JSON.stringify(payload), 'utf8'));
  await putBytesToSasUrl(sasUploadUrl, bytes, 'application/json');
  return { container, blobName };
}
