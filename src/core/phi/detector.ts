import { getResourceDefinition } from '../resource-registry.js';
import { analyzeText, PresidioRecognizerResult } from './presidio.js';
import _ from 'lodash';

/**
 * Scans a resource payload for PHI and returns any findings.
 * This function now returns the raw Presidio results for each scanned field.
 *
 * @param payload The resource payload to scan.
 * @param resourceType The type of the resource.
 * @returns A map of field paths to their Presidio analysis results.
 */
export async function detectPhi(
  payload: Record<string, any>,
  resourceType: string
): Promise<Map<string, PresidioRecognizerResult[]>> {
  const resourceDef = getResourceDefinition(resourceType);
  if (!resourceDef || !resourceDef.phiFields) {
    return new Map();
  }

  const analysisResultsMap = new Map<string, PresidioRecognizerResult[]>();

  for (const phiField of resourceDef.phiFields) {
    const value = _.get(payload, phiField.path);
    if (typeof value !== 'string' || !value) {
      continue;
    }

    const analysisResults = await analyzeText(value);
    if (analysisResults.length > 0) {
      analysisResultsMap.set(phiField.path, analysisResults);
    }
  }

  return analysisResultsMap;
}
