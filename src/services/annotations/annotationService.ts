import { enqueueSync } from '../database/db';
import { brianBackendHeaders, brianBackendUrl, BrianMedia } from '../brianBackend';
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
  sensorReadings?: Record<string, number | null>;
  title?: string;
  note?: string;
  timestamp: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photo?: string;
  audio?: string;
  deviceName?: string;
  smellWalkId?: string;
  media?: BrianMedia[];
  // Kept only for local/offline records that have not migrated yet.
  description?: string;
  type?: 'photo' | 'audio' | 'fingerprint';
  selectedTags?: string[];
  strokes?: DrawingStroke[];
  latitudeRaw?: number;
  longitudeRaw?: number;
  accuracyM?: number;
  sensorRecordId?: string;
  photoUri?: string;
  capturedAtMs?: number;
  annotationIndex?: number;
  imageBlobName?: string;
  imageContainer?: string;
  bundleBlobName?: string;
  bundleContainer?: string;
  localMedia?: LocalAnnotationMedia[];
};

export type LocalAnnotationMedia = {
  localUri: string;
  contentType: string;
  fileName: string;
  role: 'image' | 'audio';
};

export type AnnotationRecord = SaveAnnotationPayload & {
  annotationId: string;
  savedAt: string;
  schema: string;
};

export async function saveAnnotationRemote(
  payload: SaveAnnotationPayload,
): Promise<{ annotationId: string }> {
  const backendPayload = {
    ...payload,
    latitude: toCoordinate(payload.latitude ?? payload.latitudeRaw),
    longitude: toCoordinate(payload.longitude ?? payload.longitudeRaw),
    title: payload.title ?? payload.description ?? '',
    note: payload.note ?? '',
    photo: payload.photo ?? payload.media?.find(item => item.role === 'image')?.url ?? null,
    audio: payload.audio ?? payload.media?.find(item => item.role === 'audio')?.url ?? null,
  };
  const res = await fetch(brianBackendUrl('/api/annotations'), {
    method: 'POST',
    headers: { ...brianBackendHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(backendPayload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brian annotation save failed: ${res.status} ${text}`);
  }

  function toCoordinate(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const coordinate = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(coordinate) ? coordinate : null;
  }
  const data = (await res.json()) as { annotation?: { id: string } };
  return { annotationId: data.annotation?.id ?? payload.recordingId };
}

export type SaveAnnotationResult = {
  annotationId: string;
  queued: boolean;
};

function isRetryableBackendError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'TypeError' ||
    /network request failed|failed to fetch|fetch failed|network error/i.test(
      error.message,
    )
  );
}

export async function saveAnnotation(
  payload: SaveAnnotationPayload,
): Promise<SaveAnnotationResult> {
  try {
    const result = await saveAnnotationRemote(payload);
    return { ...result, queued: false };
  } catch (e) {
    // HTTP errors mean bad data and should be shown to the user; network
    // failures are retained locally and retried by the sync worker.
    if (!isRetryableBackendError(e)) {
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
    console.warn('BrianBackend unavailable; annotation queued locally', e);
    return { annotationId: payload.recordingId, queued: true };
  }
}

export async function loadAnnotation(
  annotationId: string,
): Promise<AnnotationRecord | null> {
  const res = await fetch(
    brianBackendUrl(`/api/annotations/${encodeURIComponent(annotationId)}`),
    { headers: brianBackendHeaders() },
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`get-annotation failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { annotation: AnnotationRecord };
  return json.annotation;
}

export async function listAnnotations(): Promise<AnnotationRecord[]> {
  const res = await fetch(brianBackendUrl('/api/annotations'), {
    headers: brianBackendHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brian annotation list failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { annotations?: AnnotationRecord[] };
  return json.annotations ?? [];
}
