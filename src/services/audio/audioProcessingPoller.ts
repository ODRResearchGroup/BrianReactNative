import {
  listPendingAudioCaptures,
  updateCaptureStatus,
  updateCaptureTranscript,
  updateCaptureTags,
  updateCaptureDescription,
  updateSensorRecordDescription,
} from '../database/db';
import { fetchProcessedStatus } from './processedStatus';
import {
  fetchProcessedTranscript,
  transcriptToPlainText,
} from './processedTranscript';
import { fetchSuggestedDescriptors } from '../annotations/suggestDescriptors';
import { saveAnnotation } from '../annotations/annotationService';
import { notifyUploadComplete } from './uploadComplete';

let running = false;

export async function runAudioProcessingPoller(): Promise<void> {
  if (running) {
    return;
  }
  running = true;
  try {
    const pending = await listPendingAudioCaptures();
    if (pending.length === 0) {
      return;
    }

    for (const capture of pending) {
      try {
        const statusRes = await fetchProcessedStatus(capture.id);
        if (!statusRes) {
          // Upload completed but STT was never kicked off — retry
          const audioExt = (capture.localPath
            ?.split('.')
            .pop()
            ?.toLowerCase() ?? 'm4a') as 'm4a' | 'wav';
          try {
            await notifyUploadComplete(capture.id, audioExt);
          } catch {}
          continue;
        }

        if (statusRes.status === 'transcribed') {
          await updateCaptureStatus(capture.id, 'transcribed');

          const transcriptRes = await fetchProcessedTranscript(capture.id);
          let plainText = '';
          if (transcriptRes) {
            plainText = transcriptToPlainText(transcriptRes);
            await updateCaptureTranscript(
              capture.id,
              JSON.stringify(transcriptRes),
            );
            await updateCaptureDescription(capture.id, plainText);
            if (capture.sensorRecordId && plainText) {
              await updateSensorRecordDescription(
                capture.sensorRecordId,
                plainText,
              ).catch(() => {});
            }
          }

          let selectedTags: string[] = [];
          let suggestedTags: string[] = [];
          if (plainText) {
            try {
              const tagRes = await fetchSuggestedDescriptors(
                plainText,
                capture.id,
              );
              suggestedTags = tagRes.suggestedDescriptors;
              await updateCaptureTags(capture.id, selectedTags, suggestedTags);
            } catch (e) {
              console.warn('Tag suggestion failed (non-fatal):', e);
            }
          }

          const timestamp = new Date(capture.capturedAt).toLocaleTimeString(
            [],
            { hour: '2-digit', minute: '2-digit', second: '2-digit' },
          );

          await saveAnnotation({
            recordingId: capture.id,
            sensorRecordId: capture.sensorRecordId ?? undefined,
            type: 'audio',
            description: plainText,
            selectedTags,
            timestamp,
            latitude: capture.latitudeDisplay ?? '00.0000° N',
            longitude: capture.longitudeDisplay ?? '00.0000° E',
            latitudeRaw: capture.latitudeRaw ?? undefined,
            longitudeRaw: capture.longitudeRaw ?? undefined,
            capturedAtMs: capture.capturedAt,
            annotationIndex: capture.annotationIndex ?? 1,
          });
        } else if (statusRes.status === 'failed') {
          await updateCaptureStatus(capture.id, 'failed');
        }
      } catch (e) {
        console.warn(`Poller error for capture ${capture.id} (will retry):`, e);
      }
    }
  } finally {
    running = false;
  }
}
