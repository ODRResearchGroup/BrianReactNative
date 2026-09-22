import Config from 'react-native-config';
import { enqueueSync } from '../database/db';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export type DrawingStroke = {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  shape: number;
};

export type SaveAnnotationPayload = {
  recordingId: string;
  sensorRecordId?: string; // link back to sensor fingerprint
  type: 'photo' | 'audio';
  description: string;
  strokes?: DrawingStroke[];
  selectedTags: string[];
  timestamp: string;
  latitude: string;
  longitude: string;
  latitudeRaw?: number;
  longitudeRaw?: number;
  accuracyM?: number;
  capturedAtMs?: number;
  photoUri?: string;
  annotationIndex: number;
  imageBlobName?: string;
  imageContainer?: string;
  bundleBlobName?: string;
  bundleContainer?: string;
};

export type AnnotationRecord = SaveAnnotationPayload & {
  annotationId: string;
  savedAt: string;
  schema: string;
};

function getConfig() {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_SAVE_ANNOTATION_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error(
      'Missing AZURE_FUNCTION_BASE_URL or AZURE_SAVE_ANNOTATION_KEY',
    );
  }
  return { baseUrl, functionKey };
}

function qs(
  baseUrl: string,
  path: string,
  key: string,
  params: Record<string, string> = {},
) {
  const q = new URLSearchParams({ code: key, ...params });
  return `${baseUrl}/api/${path}?${q.toString()}`;
}

export async function saveAnnotationRemote(
  payload: SaveAnnotationPayload,
): Promise<{ annotationId: string }> {
  const { baseUrl, functionKey } = getConfig();
  const res = await fetch(qs(baseUrl, 'save-annotation', functionKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`save-annotation failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { annotationId: string };
}

export async function saveAnnotation(
  payload: SaveAnnotationPayload,
): Promise<{ annotationId: string }> {
  try {
    return await saveAnnotationRemote(payload);
  } catch (e: any) {
    // Only queue on network failure (TypeError). HTTP errors mean bad data — propagate them.
    if (e?.name !== 'TypeError') {
      throw e;
    }
    await enqueueSync({
      id: uuidv4(),
      entityType: 'annotation',
      entityId: payload.recordingId,
      operation: 'update',
      payloadJson: JSON.stringify(payload),
      createdAt: Date.now(),
    });
    return { annotationId: payload.recordingId };
  }
}

export async function loadAnnotation(
  annotationId: string,
): Promise<AnnotationRecord | null> {
  const { baseUrl, functionKey } = getConfig();
  const res = await fetch(
    qs(baseUrl, 'get-annotation', functionKey, { annotationId }),
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`get-annotation failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.annotation as AnnotationRecord;
}

export async function listAnnotations(): Promise<AnnotationRecord[]> {
  const { baseUrl, functionKey } = getConfig();
  const res = await fetch(qs(baseUrl, 'list-annotations', functionKey));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`list-annotations failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return (json.annotations ?? []) as AnnotationRecord[];
}
