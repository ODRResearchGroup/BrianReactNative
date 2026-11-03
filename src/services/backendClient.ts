import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

const INSTALLATION_ID_KEY = '@brian/backend-installation-id';
const SESSION_TOKEN_KEY = '@brian/backend-session-token';

function baseUrl(): string {
  const value = Config.BRIAN_BACKEND_URL?.replace(/\/$/, '');
  if (!value) {
    throw new Error('Missing BRIAN_BACKEND_URL');
  }
  if (!value.startsWith('https://') && !__DEV__) {
    throw new Error('BRIAN_BACKEND_URL must use HTTPS in release builds');
  }
  return value;
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function getSessionToken(): Promise<string> {
  const existing = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  if (existing) {
    return existing;
  }

  let installationId = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (!installationId) {
    installationId = randomId();
    await AsyncStorage.setItem(INSTALLATION_ID_KEY, installationId);
  }

  const response = await fetch(`${baseUrl()}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installationId }),
  });
  if (!response.ok) {
    throw new Error(`Backend session creation failed: ${response.status}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error('Backend did not return a session token');
  }
  await AsyncStorage.setItem(SESSION_TOKEN_KEY, data.token);
  return data.token;
}

export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let token = await getSessionToken();
  const request = () =>
    fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await request();
  if (response.status === 401) {
    await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
    token = await getSessionToken();
    response = await request();
  }
  return response;
}
