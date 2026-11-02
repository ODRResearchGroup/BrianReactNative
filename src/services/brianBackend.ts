import Config from 'react-native-config';
import ReactNativeBlobUtil from 'react-native-blob-util';

export type BrianMedia = {
  role: 'image' | 'audio' | 'bundle';
  key: string;
  url?: string | null;
  contentType: string;
  byteSize?: number | null;
};

function getConfig() {
  const baseUrl = Config.BRIAN_BACKEND_URL?.replace(/\/$/, '');
  const token = Config.BRIAN_BACKEND_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      'Missing BRIAN_BACKEND_URL or BRIAN_BACKEND_TOKEN',
    );
  }
  return { baseUrl, token };
}

export function brianBackendHeaders(): Record<string, string> {
  const { token } = getConfig();
  return {
    Authorization: `Bearer ${token}`,
  };
}

function multipartUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    return uri;
  }
  return `file://${uri}`;
}

export async function uploadAnnotationMedia(
  annotationId: string,
  localUri: string,
  contentType: string,
  fileName: string,
): Promise<BrianMedia> {
  const { baseUrl, token } = getConfig();
  const uri = multipartUri(localUri);
  const filesystemPath = uri.startsWith('file://')
    ? uri.slice('file://'.length)
    : uri;
  if (!(await ReactNativeBlobUtil.fs.exists(filesystemPath))) {
    throw new Error(`Media file does not exist: ${filesystemPath}`);
  }

  const form = new FormData();
  form.append('media', {
    uri,
    name: fileName,
    type: contentType,
  } as unknown as Blob);

  const response = await fetch(
    `${baseUrl}/api/annotations/${encodeURIComponent(annotationId)}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brian media upload failed: ${response.status} ${text}`);
  }
  const uploaded = (await response.json()) as Omit<BrianMedia, 'role'>;
  return {
    ...uploaded,
    role: contentType.startsWith('image/') ? 'image' : 'audio',
  };
}

export function brianBackendUrl(path: string): string {
  return `${getConfig().baseUrl}${path}`;
}

export function brianBackendMediaSource(url: string): {
  uri: string;
  headers: Record<string, string>;
} {
  return {
    uri: url,
    headers: brianBackendHeaders(),
  };
}
