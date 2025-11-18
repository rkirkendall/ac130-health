export const PRESIDIO_ANALYZER_URL =
  process.env.PRESIDIO_ANALYZER_URL || 'http://localhost:5002';

export interface PresidioAnalyzerRequest {
  text: string;
  language: string;
  score_threshold?: number;
}

export interface PresidioRecognizerResult {
  start: number;
  end: number;
  entity_type: string;
  score: number;
}

export async function analyzeText(
  text: string,
  language = 'en'
): Promise<PresidioRecognizerResult[]> {
  try {
    const response = await fetch(`${PRESIDIO_ANALYZER_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, language }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Presidio Analyzer request failed with status ${response.status}: ${errorBody}`
      );
    }

    const results = (await response.json()) as PresidioRecognizerResult[];
    return results;
  } catch (error) {
    console.error('Error calling Presidio Analyzer:', error);
    // In case of error (e.g., service not available), return no findings
    return [];
  }
}
