import notifee, {
  AndroidImportance,
  AuthorizationStatus,
} from '@notifee/react-native';
import { Platform } from 'react-native';

const CHANNEL_ID = 'smell-walk-recording';
const NOTIFICATION_ID = 'smell-walk-foreground-service';

export async function requestForegroundServicePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const settings = await notifee.requestPermission();

  return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
}

async function createSmellWalkChannel(): Promise<string> {
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Smell walk recording',
    description: 'Shown while Brian is recording a smell walk',
    importance: AndroidImportance.LOW,
    vibration: false,
  });
}

export async function startSmellWalkForegroundService(
  walkId: string,
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const channelId = await createSmellWalkChannel();

  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: 'Brian is recording a smell walk',
    body: 'Sensor and location data are being recorded.',
    data: {
      walkId,
    },
    android: {
      channelId,
      asForegroundService: true,
      ongoing: true,
      autoCancel: false,
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
    },
  });
}

export async function stopSmellWalkForegroundService(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await notifee.stopForegroundService();
}
