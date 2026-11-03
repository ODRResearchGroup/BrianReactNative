import {
  dequeueSyncBatch,
  markSyncSuccess,
  markSyncFailure,
  getSensorRecord,
  updateCaptureStatus,
} from '../database/db';
import { uploadSensorRecord } from '../database/sensorRecordUpload';
import {
  saveAnnotationRemote,
  saveAnnotation,
  SaveAnnotationPayload,
} from '../annotations/annotationService';
import { uploadAnnotationMedia } from '../brianBackend';

let running = false;

export async function runSyncWorker(): Promise<void> {
  if (running) {
    return;
  }
  running = true;
  try {
    const batch = await dequeueSyncBatch(50);
    if (batch.length === 0) {
      return;
    }

    await Promise.allSettled(
      batch.map(async item => {
        try {
          if (item.entityType === 'sensor_record') {
            const record = await getSensorRecord(item.entityId);
            if (!record) {
              await markSyncSuccess(item.id);
              return;
            }
            await uploadSensorRecord(record);
          } else if (item.entityType === 'annotation') {
            const payload = JSON.parse(
              item.payloadJson,
            ) as SaveAnnotationPayload;
            const localMedia = payload.localMedia ?? [];
            const uploadedMedia = await Promise.all(
              localMedia.map(media =>
                uploadAnnotationMedia(
                  payload.recordingId,
                  media.localUri,
                  media.contentType,
                  media.fileName,
                ),
              ),
            );
            const remotePayload = { ...payload };
            delete remotePayload.localMedia;
            await saveAnnotationRemote({
              ...remotePayload,
              media: [...(payload.media ?? []), ...uploadedMedia],
              photo:
                remotePayload.photo ??
                uploadedMedia.find(media => media.role === 'image')?.url ??
                undefined,
              audio:
                remotePayload.audio ??
                uploadedMedia.find(media => media.role === 'audio')?.url ??
                undefined,
            });
          } else if (item.entityType === 'capture') {
            const payload = JSON.parse(item.payloadJson) as any;

            if (payload.type === 'audio') {
              const media = await uploadAnnotationMedia(
                payload.captureId,
                payload.localPath,
                'audio/mp4',
                `${payload.captureId}.m4a`,
              );
              await updateCaptureStatus(payload.captureId, 'uploaded');
              await saveAnnotation({
                recordingId: payload.captureId,
                sensorRecordId: payload.sensorRecordId ?? undefined,
                type: 'audio',
                description: '',
                timestamp: new Date(payload.capturedAt).toISOString(),
                media: [media],
                annotationIndex: payload.annotationIndex,
              });
            } else if (payload.type === 'photo') {
              const media = await uploadAnnotationMedia(
                payload.captureId,
                payload.compositedUri,
                'image/png',
                `${payload.captureId}.png`,
              );
              await updateCaptureStatus(payload.captureId, 'uploaded');
              await saveAnnotation({
                recordingId: payload.captureId,
                sensorRecordId: payload.sensorRecordId ?? undefined,
                type: 'photo',
                description: payload.description,
                strokes: JSON.parse(payload.strokesJson ?? '[]'),
                selectedTags: payload.selectedTags ?? [],
                timestamp: payload.timestamp,
                latitude: payload.latitude,
                longitude: payload.longitude,
                latitudeRaw: payload.latitudeRaw ?? undefined,
                longitudeRaw: payload.longitudeRaw ?? undefined,
                accuracyM: payload.accuracyM ?? undefined,
                capturedAtMs: payload.capturedAtMs,
                photoUri: payload.compositedUri,
                annotationIndex: payload.annotationIndex,
                media: [media],
              });
            }
          }
          await markSyncSuccess(item.id);
        } catch (e: any) {
          await markSyncFailure(item.id, e?.message ?? String(e));
        }
      }),
    );
  } finally {
    running = false;
  }
}
