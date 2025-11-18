import { ObjectId } from 'mongodb';
import { DetectedPhi, PhiEntry, PhiVaultAdapter } from './types.js';
import { getResourceDefinition } from '../resource-registry.js';
import { analyzeText, PresidioRecognizerResult } from './presidio.js';
import _ from 'lodash';

export function generatePhiReference(vaultId: ObjectId): string {
  return `phi:vault:${vaultId.toHexString()}`;
}

function dedupeAnalyzerResults(results: PresidioRecognizerResult[]): PresidioRecognizerResult[] {
  if (results.length === 0) {
    return results;
  }

  const sorted = [...results].sort((a, b) => {
    if (a.start === b.start) {
      if (a.end === b.end) {
        return b.score - a.score;
      }
      return b.end - a.end;
    }
    return a.start - b.start;
  });

  const deduped: PresidioRecognizerResult[] = [];

  for (const current of sorted) {
    const last = deduped[deduped.length - 1];

    if (!last || current.start >= last.end) {
      deduped.push(current);
      continue;
    }

    const currentSpan = current.end - current.start;
    const lastSpan = last.end - last.start;
    const shouldReplace =
      current.score > last.score ||
      (current.score === last.score && currentSpan > lastSpan);

    if (shouldReplace) {
      deduped[deduped.length - 1] = current;
    }
  }

  return deduped;
}

function manualSanitize(
  text: string,
  results: PresidioRecognizerResult[],
  references: string[]
): string {
  if (results.length === 0) {
    return text;
  }

  const pairs = results.map((result, index) => ({
    result,
    reference: references[index],
  }));

  const sortedPairs = pairs.sort((a, b) => a.result.start - b.result.start);

  let lastIndex = 0;
  let sanitizedText = '';

  for (const { result, reference } of sortedPairs) {
    sanitizedText += text.slice(lastIndex, result.start);
    sanitizedText += reference ?? text.slice(result.start, result.end);
    lastIndex = result.end;
  }

  sanitizedText += text.slice(lastIndex);

  return sanitizedText;
}

export async function vaultAndSanitize(
  vaultAdapter: PhiVaultAdapter,
  resourceType: string,
  resourceId: ObjectId,
  dependentId: ObjectId,
  payload: Record<string, any>
): Promise<Record<string, any>> {
  const resourceDef = getResourceDefinition(resourceType);
  if (!resourceDef || !resourceDef.phiFields) {
    return payload;
  }

  const sanitizedPayload = { ...payload };

  for (const phiField of resourceDef.phiFields) {
    const originalValue = _.get(payload, phiField.path);
    if (typeof originalValue !== 'string' || !originalValue) {
      continue;
    }

    const analyzerResultsRaw = await analyzeText(originalValue);
    const analyzerResults = dedupeAnalyzerResults(analyzerResultsRaw);
    if (analyzerResults.length === 0) {
      continue;
    }

    const detectedPhi: DetectedPhi[] = analyzerResults.map((result) => ({
      field_path: phiField.path,
      value: originalValue.substring(result.start, result.end),
      phi_type: result.entity_type,
    }));

    const entriesToUpsert: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[] = detectedPhi.map(
      (phi) => ({
        dependent_id: dependentId,
        resource_type: resourceType,
        resource_id: resourceId,
        field_path: phi.field_path,
        value: phi.value,
        phi_type: phi.phi_type,
      })
    );

    const vaultIds = await vaultAdapter.upsertPhiEntries(entriesToUpsert);

    const references = vaultIds.map(generatePhiReference);
    const sanitizedValue = manualSanitize(originalValue, analyzerResults, references);
    _.set(sanitizedPayload, phiField.path, sanitizedValue);
  }

  return sanitizedPayload;
}
