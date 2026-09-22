import Config from 'react-native-config';

export type SuggestDescriptorsResponse = {
  suggestedDescriptors: string[];
  reasoning: string;
  availableDescriptors: string[];
};

export async function fetchSuggestedDescriptors(
  transcriptText: string,
  recordingId?: string,
): Promise<SuggestDescriptorsResponse> {
  const baseUrl = Config.AZURE_FUNCTION_BASE_URL;
  const functionKey = Config.AZURE_SUGGEST_DESCRIPTORS_KEY;
  if (!baseUrl || !functionKey) {
    throw new Error('Missing AZURE_SUGGEST_DESCRIPTORS_KEY');
  }

  const res = await fetch(
    `${baseUrl}/api/suggest-descriptors?code=${encodeURIComponent(
      functionKey,
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptText, recordingId }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`suggest-descriptors failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SuggestDescriptorsResponse;
}
