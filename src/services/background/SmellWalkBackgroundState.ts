import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_WALK_ID_KEY = '@brian/active-smell-walk-id';

export async function saveActiveWalkId(walkId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_WALK_ID_KEY, walkId);
}

export async function getActiveWalkId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_WALK_ID_KEY);
}

export async function clearActiveWalkId(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_WALK_ID_KEY);
}
