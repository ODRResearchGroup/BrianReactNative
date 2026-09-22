import { Platform, PermissionsAndroid } from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import ReactNativeBlobUtil from 'react-native-blob-util';

const recorder = new AudioRecorderPlayer();

export type StartRecordingResult = { localUri: string; plannedPath: string };
export type StopRecordingResult = { localUri: string | null };

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function buildLocalRecordingPath(ext: string, recordingId: string) {
  return `${ReactNativeBlobUtil.fs.dirs.CacheDir}/recording-${recordingId}.${ext}`;
}

export async function startAudioRecording(
  recordingId: string,
): Promise<StartRecordingResult> {
  const ok = await ensureMicPermission();
  if (!ok) {
    throw new Error('Microphone permission denied');
  }

  // On iOS pass no path — the library picks a safe internal path.
  // Passing a custom absolute path triggers an AVAudioRecorder init bug in v3.5.x.
  const pathArg =
    Platform.OS === 'android'
      ? buildLocalRecordingPath('m4a', recordingId)
      : undefined;
  const localUri = await recorder.startRecorder(pathArg);
  const plannedPath = localUri;
  return { localUri, plannedPath };
}

export async function stopAudioRecording(): Promise<StopRecordingResult> {
  const localUri = await recorder.stopRecorder();
  recorder.removeRecordBackListener();
  return { localUri: localUri || null };
}
