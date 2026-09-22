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
import { uploadsPrepare } from '../audio/uploadsPrepare';
import {
  uploadAudioToAzure,
  uploadAudioTrackJsonToAzure,
} from '../audio/audioUpload';
import { notifyUploadComplete } from '../audio/uploadComplete';
import { photosPrepare } from '../photos/photosPrepare';
import {
  uploadPhotoToAzure,
  uploadPhotoBundleJsonToAzure,
} from '../photos/photoUpload';
import { notifyPhotoUploadComplete } from '../photos/photoUploadComplete';
import type { PhotoBundle } from '../photos/photoTypes';

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
            await saveAnnotationRemote(payload);
          } else if (item.entityType === 'capture') {
            const payload = JSON.parse(item.payloadJson) as any;

            if (payload.type === 'audio') {
              const prep = await uploadsPrepare(
                payload.captureId,
                payload.audioExt ?? 'm4a',
              );
              await Promise.all([
                uploadAudioToAzure(
                  payload.localPath,
                  prep.audioUpload.uploadUrl,
                  prep.audioUpload.container,
                  prep.audioUpload.blobName,
                ),
                uploadAudioTrackJsonToAzure(
                  payload.trackBundle,
                  prep.bundleUpload.uploadUrl,
                  prep.bundleUpload.container,
                  prep.bundleUpload.blobName,
                  {
                    container: prep.audioUpload.container,
                    blobName: prep.audioUpload.blobName,
                  },
                ),
              ]);
              await updateCaptureStatus(payload.captureId, 'uploaded');
              await notifyUploadComplete(
                payload.captureId,
                payload.audioExt ?? 'm4a',
                payload.locale ?? 'en-US',
              );
            } else if (payload.type === 'photo') {
              const prep = await photosPrepare(payload.captureId, 'png');
              const bundle: PhotoBundle = {
                schema: 'photo_gps_bundle_v1',
                captured_at_ms: payload.capturedAtMs,
                photo: {
                  container: prep.imageUpload.container,
                  blobName: prep.imageUpload.blobName,
                  contentType: 'image/png',
                },
                point: payload.gpsPoint ?? null,
              };
              await Promise.all([
                uploadPhotoToAzure(
                  payload.compositedUri,
                  prep.imageUpload.uploadUrl,
                  prep.imageUpload.container,
                  prep.imageUpload.blobName,
                ),
                uploadPhotoBundleJsonToAzure(
                  bundle,
                  prep.bundleUpload.uploadUrl,
                  prep.bundleUpload.container,
                  prep.bundleUpload.blobName,
                ),
              ]);
              await updateCaptureStatus(payload.captureId, 'uploaded');
              await notifyPhotoUploadComplete(
                payload.captureId,
                prep.imageUpload.blobName,
                prep.bundleUpload.blobName,
              );
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
                imageBlobName: prep.imageUpload.blobName,
                imageContainer: prep.imageUpload.container,
                bundleBlobName: prep.bundleUpload.blobName,
                bundleContainer: prep.bundleUpload.container,
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
