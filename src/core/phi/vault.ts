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

const MEDICAL_TERMS = new Set([
  'diabetes', 'cancer', 'polymyalgia', 'rheumatica', 'syndrome', 'disease', 'disorder', 
  'hypertension', 'asthma', 'arthritis', 'infection', 'fracture', 'injury', 'pmr', 'copd', 'chf',
  'anemia', 'depression', 'anxiety', 'alzheimer', 'dementia', 'epilepsy', 'seizure', 'stroke',
  'migraine', 'obesity', 'osteoporosis', 'fibromyalgia', 'lupus', 'sclerosis', 'hepatitis',
  'hiv', 'aids', 'influenza', 'pneumonia', 'bronchitis', 'tuberculosis', 'malaria', 'measles',
  'autism', 'adhd', 'schizophrenia', 'bipolar', 'paranoia', 'insomnia', 'apnea', 'narcolepsy',
  'glaucoma', 'cataract', 'conjunctivitis', 'blindness', 'deafness', 'tinnitus', 'vertigo',
  'psoriasis', 'eczema', 'acne', 'rosacea', 'hives', 'melanoma', 'leukemia', 'lymphoma',
  'sarcoma', 'carcinoma', 'tumor', 'cyst', 'polyp', 'nodule', 'lesion', 'ulcer', 'abscess',
  'hemorrhage', 'thrombosis', 'embolism', 'infarction', 'aneurysm', 'stenosis', 'ischemia',
  'arrhythmia', 'fibrillation', 'tachycardia', 'bradycardia', 'palpitation', 'murmur', 'angina',
  'cardiomyopathy', 'myocarditis', 'pericarditis', 'endocarditis', 'valvulopathy', 'stenosis',
  'regurgitation', 'prolapse', 'sclerosis', 'atherosclerosis', 'arteriosclerosis', 'thrombophlebitis',
  'varicose', 'aneurysm', 'dissection', 'embolism', 'thrombosis', 'infarction', 'ischemia',
  'shock', 'arrest', 'failure', 'insufficiency', 'dysfunction', 'deficiency', 'syndrome',
]);

const FREQUENCY_TERMS = new Set([
  'daily', 'weekly', 'monthly', 'yearly', 'hourly', 'bid', 'tid', 'qid', 'prn', 'ac', 'pc', 'hs', 'po', 'iv', 'im', 'sc',
]);

function isMedicalTerm(text: string): boolean {
  const words = text.toLowerCase().split(/[\s-]+/);
  return words.some(word => MEDICAL_TERMS.has(word));
}

function isFrequencyTerm(text: string): boolean {
  const words = text.toLowerCase().split(/[\s-]+/);
  return words.every(word => FREQUENCY_TERMS.has(word) || !isNaN(Number(word)));
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

export async function vaultAndSanitizeFields(
  vaultAdapter: PhiVaultAdapter,
  resourceType: string,
  resourceId: ObjectId,
  dependentId: ObjectId,
  payload: Record<string, any>,
  phiFields: { path: string; strategy: 'whole-field' | 'substring' }[],
  knownIdentifiers?: string[]
): Promise<Record<string, any>> {
  const sanitizedPayload = { ...payload };

  for (const phiField of phiFields) {
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

    // Filter out MEDICAL_CONDITION type and known medical terms to keep them visible
    const allowedPhi = detectedPhi.filter(phi => {
      if (phi.phi_type === 'MEDICAL_CONDITION') return false;
      if (phi.phi_type === 'PERSON' && isMedicalTerm(phi.value)) return false;
      if (phi.phi_type === 'DATE_TIME' && isFrequencyTerm(phi.value)) return false;

      // If knownIdentifiers are provided, strictly filter PERSON entities
      if (phi.phi_type === 'PERSON' && knownIdentifiers && knownIdentifiers.length > 0) {
        const normalizedValue = phi.value.toLowerCase();
        const isMatch = knownIdentifiers.some(id => {
          const normalizedId = id.toLowerCase();
          // Check for containment in either direction (e.g. "John" in "John Doe" or "John Doe" contains "John")
          return normalizedValue.includes(normalizedId) || normalizedId.includes(normalizedValue);
        });
        if (!isMatch) return false;
      }

      return true;
    });

    if (allowedPhi.length === 0) {
      continue;
    }

    // Re-filter analyzer results based on the allowed findings
    const allowedAnalyzerResults = analyzerResults.filter(result => {
      const value = originalValue.substring(result.start, result.end);
      if (result.entity_type === 'MEDICAL_CONDITION') return false;
      if (result.entity_type === 'PERSON' && isMedicalTerm(value)) return false;
      if (result.entity_type === 'DATE_TIME' && isFrequencyTerm(value)) return false;

      if (result.entity_type === 'PERSON' && knownIdentifiers && knownIdentifiers.length > 0) {
        const normalizedValue = value.toLowerCase();
        const isMatch = knownIdentifiers.some(id => {
          const normalizedId = id.toLowerCase();
          return normalizedValue.includes(normalizedId) || normalizedId.includes(normalizedValue);
        });
        if (!isMatch) return false;
      }

      return true;
    });

    const entriesToUpsert: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[] = allowedPhi.map(
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
    const sanitizedValue = manualSanitize(originalValue, allowedAnalyzerResults, references);
    _.set(sanitizedPayload, phiField.path, sanitizedValue);
  }

  return sanitizedPayload;
}

export async function vaultAndSanitize(
  vaultAdapter: PhiVaultAdapter,
  resourceType: string,
  resourceId: ObjectId,
  dependentId: ObjectId,
  payload: Record<string, any>,
  knownIdentifiers?: string[]
): Promise<Record<string, any>> {
  const resourceDef = getResourceDefinition(resourceType);
  if (!resourceDef || !resourceDef.phiFields) {
    return payload;
  }

  return vaultAndSanitizeFields(
    vaultAdapter,
    resourceType,
    resourceId,
    dependentId,
    payload,
    resourceDef.phiFields,
    knownIdentifiers
  );
}
