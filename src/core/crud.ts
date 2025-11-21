import { getResourceDefinition, getAllResourceTypes, RESOURCE_REGISTRY } from './resource-registry.js';
import type { ResourceDefinition, ResourceType } from './resource-registry.js';
import { z, type ZodType } from 'zod';
import { zodToJsonSchemaForMCP } from './schema-utils.js';
import type { PersistenceAdapter } from './persistence.js';
import { HEALTH_SUMMARY_OUTLINE_URI, HEALTH_SUMMARY_OUTLINE_MARKDOWN } from './resources.js';
import {
  detectPhi,
  vaultAndSanitize,
} from './phi/index.js';
import { MongoPhiVaultAdapter } from '../persistence/mongo-phi-vault.js';
import { ObjectId } from 'mongodb';
import isEqual from 'lodash/isEqual.js';
import { 
  separatePhiPayload, 
  upsertStructuredPhiVault, 
  getStructuredPhiVault,
  getStructuredPhiVaults,
  getUnstructuredPhiVaultEntries
} from './phi/dependent.js';
import { computeDemographics, deidentifyString } from './phi/deidentify.js';

/**
 * Extract helpful schema hints from validation errors
 */
function extractSchemaHints(jsonSchema: any, error: z.ZodError, receivedData: any): string {
  const hints: string[] = [];
  
  // Extract object data for analysis (handle arrays)
  let dataForAnalysis = receivedData;
  if (Array.isArray(receivedData) && receivedData.length > 0) {
    dataForAnalysis = receivedData[0];
  }
  
  // Handle union types (single object vs array)
  if (jsonSchema.oneOf) {
    const objectSchema = jsonSchema.oneOf.find((s: any) => s.type === 'object');
    const arraySchema = jsonSchema.oneOf.find((s: any) => s.type === 'array');
    
    if (objectSchema && arraySchema) {
      hints.push('Schema accepts either:');
      hints.push('  1. A single object');
      hints.push('  2. An array of objects (for batch creation)');
      
      // Use the object schema for field hints
      if (objectSchema.properties) {
        const required = objectSchema.required || [];
        const receivedKeys = dataForAnalysis && typeof dataForAnalysis === 'object' && !Array.isArray(dataForAnalysis)
          ? Object.keys(dataForAnalysis)
          : [];
        
        if (required.length > 0) {
          const missing = required.filter((key: string) => !receivedKeys.includes(key));
          if (missing.length > 0) {
            hints.push(`\nMissing required fields: ${missing.join(', ')}`);
          }
        }
        
        // Show expected top-level fields
        const expectedFields = Object.keys(objectSchema.properties);
        const unexpected = receivedKeys.filter((key: string) => !expectedFields.includes(key));
        if (unexpected.length > 0) {
          hints.push(`\nUnexpected fields received: ${unexpected.join(', ')}`);
          hints.push(`Expected top-level fields: ${expectedFields.join(', ')}`);
        } else if (receivedKeys.length === 0 && required.length > 0) {
          hints.push(`\nExpected top-level fields: ${expectedFields.join(', ')}`);
        }
      }
    } else {
      // Fallback: try first schema in oneOf
      const firstSchema = jsonSchema.oneOf[0];
      if (firstSchema && firstSchema.properties) {
        const required = firstSchema.required || [];
        const receivedKeys = dataForAnalysis && typeof dataForAnalysis === 'object' && !Array.isArray(dataForAnalysis)
          ? Object.keys(dataForAnalysis)
          : [];
        
        if (required.length > 0) {
          const missing = required.filter((key: string) => !receivedKeys.includes(key));
          if (missing.length > 0) {
            hints.push(`Missing required fields: ${missing.join(', ')}`);
          }
        }
      }
    }
  } else if (jsonSchema.type === 'object' && jsonSchema.properties) {
    // Single object schema
    const required = jsonSchema.required || [];
    const receivedKeys = dataForAnalysis && typeof dataForAnalysis === 'object' && !Array.isArray(dataForAnalysis)
      ? Object.keys(dataForAnalysis)
      : [];
    
    if (required.length > 0) {
      const missing = required.filter((key: string) => !receivedKeys.includes(key));
      if (missing.length > 0) {
        hints.push(`Missing required fields: ${missing.join(', ')}`);
      }
    }
    
    // Show expected fields
    const expectedFields = Object.keys(jsonSchema.properties);
    const unexpected = receivedKeys.filter((key: string) => !expectedFields.includes(key));
    if (unexpected.length > 0) {
      hints.push(`Unexpected fields: ${unexpected.join(', ')}`);
      hints.push(`Expected fields: ${expectedFields.join(', ')}`);
    } else if (receivedKeys.length === 0) {
      hints.push(`Expected fields: ${expectedFields.join(', ')}`);
    }
  }
  
  // Add specific field type hints for common errors
  const missingRequiredIssues = error.issues.filter(issue => 
    issue.code === 'invalid_type' && issue.message.includes('Required')
  );
  
  if (missingRequiredIssues.length > 0) {
    const missingFields = missingRequiredIssues.map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return path;
    });
    
    if (hints.length === 0) {
      hints.push(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }
  
  // Provide example structure for complex nested objects and arrays
  const nestedObjectIssues = error.issues.filter(issue => 
    issue.path.length > 0 && 
    (issue.code === 'invalid_type' || issue.code === 'invalid_union')
  );
  
  if (nestedObjectIssues.length > 0) {
    // Group errors by field path to identify problematic nested structures
    const pathGroups = new Map<string, z.ZodIssue[]>();
    nestedObjectIssues.forEach(issue => {
      if (issue.path.length > 0) {
        const firstLevel = issue.path[0].toString();
        if (!pathGroups.has(firstLevel)) {
          pathGroups.set(firstLevel, []);
        }
        pathGroups.get(firstLevel)!.push(issue);
      }
    });
    
    // Extract object schema for nested field analysis
    let objectSchemaForNested = jsonSchema;
    if (jsonSchema.oneOf) {
      const objSchema = jsonSchema.oneOf.find((s: any) => s.type === 'object');
      if (objSchema) objectSchemaForNested = objSchema;
    }
    
    pathGroups.forEach((issues, fieldName) => {
      // Check if this is a results array issue
      if (fieldName === 'results' || issues.some(i => i.path.includes('results'))) {
        const resultsIssues = issues.filter(i => i.path.includes('results'));
        if (resultsIssues.length > 0) {
          const resultsSchema = objectSchemaForNested.properties?.results;
          if (resultsSchema && resultsSchema.type === 'array' && resultsSchema.items) {
            const itemProps = resultsSchema.items.properties || {};
            const requiredFields = resultsSchema.items.required || [];
            const allFields = Object.keys(itemProps);
            
            // Check what fields are missing
            const missingFields = resultsIssues
              .filter(i => i.code === 'invalid_type' && i.message.includes('Required'))
              .map(i => i.path[i.path.length - 1]?.toString())
              .filter(Boolean);
            
            if (missingFields.length > 0) {
              hints.push(`\nIn 'results' array: Missing required field(s): ${[...new Set(missingFields)].join(', ')}`);
              hints.push(`Each item in 'results' array must have: ${allFields.join(', ')}`);
              if (requiredFields.length > 0) {
                hints.push(`Required fields in each 'results' item: ${requiredFields.join(', ')}`);
              }
            } else {
              hints.push(`\nField 'results' expects an array. Each item should have: ${allFields.join(', ')}`);
            }
          }
        }
      } else if (objectSchemaForNested.properties && objectSchemaForNested.properties[fieldName]) {
        const fieldSchema = objectSchemaForNested.properties[fieldName];
        if (fieldSchema.type === 'array' && fieldSchema.items) {
          const itemProps = fieldSchema.items.properties || {};
          hints.push(`\nField '${fieldName}' expects an array. Each item should have: ${Object.keys(itemProps).join(', ')}`);
        }
      }
    });
  }
  
  return hints.length > 0 
    ? `Schema hints:\n${hints.join('\n')}`
    : 'Check the schema resource for the exact structure required.';
}

function parseWithEnhancedErrors<T>(
  schema: ZodType<T>,
  data: unknown,
  resourceType: string,
  schemaKind: 'create' | 'update' | 'list'
): T {
  try {
    return schema.parse(data);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      let errorToUse: z.ZodError = error;
      if (error.issues.length === 1 && error.issues[0].code === 'invalid_union') {
        const unionIssue: any = error.issues[0];
        if (Array.isArray(unionIssue.unionErrors)) {
          const isArray = Array.isArray(data);
          const matchingError = unionIssue.unionErrors.find((err: z.ZodError) => {
            if (isArray) {
              return err.issues.some((issue: any) =>
                issue.path.length > 0 || issue.message.includes('array')
              );
            }
            return err.issues.some((issue: any) =>
              issue.code === 'invalid_type' && issue.expected === 'object'
            );
          }) || unionIssue.unionErrors[isArray ? 1 : 0];

          if (matchingError) {
            errorToUse = matchingError;
          }
        }
      }

      const jsonSchema = zodToJsonSchemaForMCP(schema);
      const schemaHint = extractSchemaHints(jsonSchema, errorToUse, data);
      const issues = errorToUse.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `  - ${path}: ${issue.message}`;
      }).join('\n');

      const heading = schemaKind === 'create'
        ? `Validation failed for ${resourceType}`
        : `Validation failed for ${resourceType} (${schemaKind})`;

      throw new Error(
        `${heading}:\n${issues}\n\n` +
        `${schemaHint}\n\n` +
        `For complete schema details, read: schema://${resourceType}/${schemaKind}`
      );
    }
    throw error;
  }
}

// Generic schemas for CRUD operations
const CreateResourceSchema = z.object({
  resource_type: z.string(),
  data: z.any(), // Will be validated by resource-specific schema
  duplicate_check_confirmed: z.boolean().optional(),
});

function coerceDuplicateCheckFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  return undefined;
}

function stripNestedDuplicateFlag(record: unknown): { cleaned: unknown; flag: boolean | undefined } {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { cleaned: record, flag: undefined };
  }

  if (!Object.prototype.hasOwnProperty.call(record, 'duplicate_check_confirmed')) {
    return { cleaned: record, flag: undefined };
  }

  const cloned = { ...(record as Record<string, unknown>) };
  const nestedValue = cloned.duplicate_check_confirmed;
  delete cloned.duplicate_check_confirmed;

  return {
    cleaned: cloned,
    flag: coerceDuplicateCheckFlag(nestedValue),
  };
}

function normalizeCreateResourceArgs(args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return args;
  }

  const normalized: Record<string, unknown> = { ...(args as Record<string, unknown>) };

  const coercedTopLevel = coerceDuplicateCheckFlag(normalized.duplicate_check_confirmed);
  if (coercedTopLevel !== undefined) {
    normalized.duplicate_check_confirmed = coercedTopLevel;
  }

  const data = normalized.data;
  if (Array.isArray(data)) {
    let mutated = false;
    const cleanedArray = data.map((entry) => {
      const { cleaned, flag } = stripNestedDuplicateFlag(entry);
      if (flag !== undefined && normalized.duplicate_check_confirmed === undefined) {
        normalized.duplicate_check_confirmed = flag;
      }
      if (cleaned !== entry) {
        mutated = true;
      }
      return cleaned;
    });

    if (mutated) {
      normalized.data = cleanedArray;
    }
  } else {
    const { cleaned, flag } = stripNestedDuplicateFlag(data);
    if (flag !== undefined && normalized.duplicate_check_confirmed === undefined) {
      normalized.duplicate_check_confirmed = flag;
    }
    if (cleaned !== data) {
      normalized.data = cleaned;
    }
  }

  return normalized;
}

function ensureArchiveFlag(record: Record<string, unknown>): Record<string, unknown> {
  if (!record || typeof record !== 'object') {
    return record;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'archived')) {
    return record;
  }
  return {
    ...record,
    archived: false,
  };
}

function isArchivedRecord(record: unknown): boolean {
  if (!record || typeof record !== 'object') {
    return false;
  }
  return (record as Record<string, unknown>).archived === true;
}

const GetResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
});

const UpdateResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
  data: z.any(), // Update fields - can be object or JSON string
});

const DeleteResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
});

const ListResourceSchema = z.object({
  resource_type: z.string(),
  filters: z.any().optional(), // Can be object or JSON string
  limit: z.number().optional(),
});

export type HealthSummaryAction = 'create' | 'update';

type SamplingTextContent = {
  type: 'text';
  text: string;
};

type SamplingMessage = {
  role: 'user' | 'assistant';
  content: SamplingTextContent[];
};

export interface HealthSummarySamplingPrompt {
  systemPrompt?: string;
  messages: SamplingMessage[];
  maxTokens: number;
  temperature?: number;
}

export interface HealthSummarySamplingPlan {
  dependentId: string;
  dependentName?: string;
  action: HealthSummaryAction;
  resourceType: ResourceType;
  reason: string;
  prompt: HealthSummarySamplingPrompt;
  previousSummary?: string | null;
}

export interface CrudRuntimeOptions {
  onHealthSummaryPlan?: (plans: HealthSummarySamplingPlan[]) => Promise<void> | void;
}

interface DependentSnapshot {
  dependent: Record<string, unknown> | null;
  summaryText: string | null;
  resources: Record<string, Record<string, unknown>[]>;
}

const DEPENDENT_SUMMARY_RESOURCE_TYPES: ResourceType[] = [
  'condition',
  'prescription',
  'lab',
  'visit',
  'treatment',
  'allergy',
  'immunization',
  'vital_signs',
  'procedure',
  'imaging',
  'insurance',
];

const MAX_RECORDS_PER_RESOURCE_FOR_SUMMARY = 25;

interface SuggestedAction {
  tool: string;
  reason: string;
  params: {
    dependent_id: string;
    summary_text: string;
  };
}

type SuggestionCopy = Record<HealthSummaryAction, { reason: string; summaryText: string }>;

const HEALTH_SUMMARY_SUGGESTION_COPY: Partial<Record<ResourceType, SuggestionCopy>> = {
  dependent: {
    create: {
      reason: 'New dependent record created',
      summaryText:
        'Draft an initial health summary covering demographics, history, medications, and current goals.',
    },
    update: {
      reason: 'Dependent record updated',
      summaryText:
        'Refresh the summary to reflect the latest demographic or contact updates for this dependent.',
    },
  },
  condition: {
    create: {
      reason: 'New active condition added',
      summaryText:
        'Describe the new condition, its severity, and the plan for monitoring or treatment.',
    },
    update: {
      reason: 'Condition details changed',
      summaryText:
        'Update the summary to reflect the revised condition status, severity, or timeline.',
    },
  },
  prescription: {
    create: {
      reason: 'Medication list changed',
      summaryText:
        'Explain how the new medication affects the treatment plan, dosage, and adherence considerations.',
    },
    update: {
      reason: 'Medication details changed',
      summaryText:
        'Capture the updated prescription details, including changes to dosing, status, or stop dates.',
    },
  },
  lab: {
    create: {
      reason: 'New lab results recorded',
      summaryText:
        'Summarize the latest lab findings, notable values, and any clinical implications.',
    },
    update: {
      reason: 'Lab record updated',
      summaryText:
        'Revise the summary with the updated lab interpretations, trends, or corrected values.',
    },
  },
  visit: {
    create: {
      reason: 'New visit documented',
      summaryText:
        'Highlight the encounter reason, key findings, and follow-up items from the new visit.',
    },
    update: {
      reason: 'Visit details changed',
      summaryText:
        'Align the summary with the revised encounter details, plans, or diagnoses.',
    },
  },
  treatment: {
    create: {
      reason: 'Treatment plan updated',
      summaryText:
        'Document the new treatment objectives, steps, and responsible care team members.',
    },
    update: {
      reason: 'Treatment plan adjusted',
      summaryText:
        'Explain how the treatment plan has changed, including progress or new tasks.',
    },
  },
  allergy: {
    create: {
      reason: 'New allergy documented',
      summaryText:
        'Note the new allergy, reaction history, and precautions in the health summary.',
    },
    update: {
      reason: 'Allergy details changed',
      summaryText:
        'Update the summary to reflect revised allergy severity, reactions, or verification status.',
    },
  },
  immunization: {
    create: {
      reason: 'New immunization recorded',
      summaryText:
        'Add the vaccine details, dates, and any follow-up boosters to the summary.',
    },
    update: {
      reason: 'Immunization details updated',
      summaryText:
        'Revise the summary with the corrected immunization dates, lot numbers, or context.',
    },
  },
  vital_signs: {
    create: {
      reason: 'New vitals recorded',
      summaryText:
        'Summarize notable vital sign trends, ranges, and any deviations requiring attention.',
    },
    update: {
      reason: 'Vital sign measurements updated',
      summaryText:
        'Update the summary to capture the latest vital sign changes or clarifications.',
    },
  },
  procedure: {
    create: {
      reason: 'New procedure documented',
      summaryText:
        'Describe the procedure, outcomes, and recovery considerations in the summary.',
    },
    update: {
      reason: 'Procedure details changed',
      summaryText:
        'Revise the summary to incorporate updated procedure details or follow-up needs.',
    },
  },
  imaging: {
    create: {
      reason: 'New imaging study recorded',
      summaryText:
        'Summarize the imaging modality, findings, and diagnostic impact for the dependent.',
    },
    update: {
      reason: 'Imaging details updated',
      summaryText:
        'Update the summary with revised imaging interpretations or status changes.',
    },
  },
  insurance: {
    create: {
      reason: 'Insurance coverage changed',
      summaryText:
        'Explain how the new coverage affects care coordination, prior authorizations, or billing.',
    },
    update: {
      reason: 'Insurance record updated',
      summaryText:
        'Capture the latest insurance details so the summary reflects accurate coverage information.',
    },
  },
};

const OUTLINE_REFERENCE_HINT = `Refer to ${HEALTH_SUMMARY_OUTLINE_URI} for the standard outline.`;

const HIGH_RISK_DUPLICATE_RESOURCE_TYPES = new Set<ResourceType>([
  'prescription',
  'condition',
  'lab',
  'visit',
]);

const DUPLICATE_FILTER_HINTS: Partial<Record<ResourceType, string[]>> = {
  prescription: ['dependent_id', 'medication_name', 'status'],
  condition: ['dependent_id', 'name', 'status'],
  lab: ['dependent_id', 'test_name', 'result_date'],
  visit: ['dependent_id', 'date', 'type'],
};

function normalizeDependentId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'object' && typeof (value as any)?.toString === 'function') {
    const stringValue = (value as any).toString();
    if (typeof stringValue === 'string' && stringValue !== '[object Object]') {
      return stringValue;
    }
  }

  return null;
}

function extractDependentIdFromRecord(
  resourceType: ResourceType,
  resourceDef: ResourceDefinition,
  record: Record<string, unknown>
): string | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  if ('dependent_id' in record) {
    const dependentId = normalizeDependentId((record as Record<string, unknown>).dependent_id);
    if (dependentId) {
      return dependentId;
    }
  }

  if (resourceType === 'dependent') {
    const dependentId = normalizeDependentId(record[resourceDef.idField]);
    if (dependentId) {
      return dependentId;
    }
  }

  return null;
}

function extractDependentIds(
  resourceType: ResourceType,
  resourceDef: ResourceDefinition,
  records: Record<string, unknown> | Record<string, unknown>[]
): string[] {
  const array = Array.isArray(records) ? records : [records];
  const ids = new Set<string>();
  array.forEach((record) => {
    const dependentId = extractDependentIdFromRecord(resourceType, resourceDef, record);
    if (dependentId) {
      ids.add(dependentId);
    }
  });
  return Array.from(ids);
}

function buildHealthSummaryMeta(
  resourceType: ResourceType,
  action: HealthSummaryAction,
  resourceDef: ResourceDefinition,
  records: Record<string, unknown> | Record<string, unknown>[]
): Record<string, unknown> | null {
  const copy = HEALTH_SUMMARY_SUGGESTION_COPY[resourceType];
  if (!copy) {
    return null;
  }

  const dependentIds = extractDependentIds(resourceType, resourceDef, records);
  if (dependentIds.length === 0) {
    return null;
  }

  const actionCopy = copy[action];
  if (!actionCopy) {
    return null;
  }

  const suggestedActions: SuggestedAction[] = dependentIds.map((dependentId) => ({
    tool: 'update_health_summary',
    reason: `${actionCopy.reason}. ${OUTLINE_REFERENCE_HINT}`,
    params: {
      dependent_id: dependentId,
      summary_text: actionCopy.summaryText,
    },
  }));

  if (suggestedActions.length === 0) {
    return null;
  }

  return {
    suggested_actions: suggestedActions,
    reference_resources: [HEALTH_SUMMARY_OUTLINE_URI],
  };
}

function getDependentDisplayName(dependent: Record<string, unknown> | null): string {
  if (!dependent || typeof dependent !== 'object') {
    return 'Unknown dependent';
  }

  const recordIdentifier = (dependent as Record<string, unknown>).record_identifier;
  if (typeof recordIdentifier === 'string' && recordIdentifier.trim().length > 0) {
    return recordIdentifier;
  }

  const externalRefValue = (dependent as Record<string, unknown>).external_ref;
  if (typeof externalRefValue === 'string' && externalRefValue.trim().length > 0) {
    return externalRefValue;
  }

  const dependentIdValue = (dependent as Record<string, unknown>).dependent_id;
  if (typeof dependentIdValue === 'string' && dependentIdValue.trim().length > 0) {
    return dependentIdValue;
  }

  return 'Unknown dependent';
}

function stringifyForPrompt(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (val instanceof Date) {
          return val.toISOString();
        }
        return val;
      },
      2
    );
  } catch (error) {
    return `<<Failed to serialize context: ${error instanceof Error ? error.message : String(error)}>>`;
  }
}

async function buildDependentSnapshot(
  adapter: PersistenceAdapter,
  dependentId: string
): Promise<DependentSnapshot> {
  const dependentDef = RESOURCE_REGISTRY.dependent;
  const dependentPersistence = adapter.forCollection(dependentDef.collectionName);
  const dependentRecord = await dependentPersistence.findById(dependentId);
  const dependent = dependentRecord
    ? dependentPersistence.toExternal(dependentRecord, dependentDef.idField)
    : null;

  const summaryPersistence = adapter.forCollection('active_summaries');
  const summaryRecord = await summaryPersistence.findOne({ dependent_id: dependentId });
  const summaryText =
    summaryRecord && typeof summaryRecord.summary_text === 'string'
      ? summaryRecord.summary_text
      : null;

  const resources: Record<string, Record<string, unknown>[]> = {};
  await Promise.all(
    DEPENDENT_SUMMARY_RESOURCE_TYPES.map(async (relatedType) => {
      const relatedDef = RESOURCE_REGISTRY[relatedType];
      const persistence = adapter.forCollection(relatedDef.collectionName);
      const docs = await persistence.find({ dependent_id: dependentId }, MAX_RECORDS_PER_RESOURCE_FOR_SUMMARY);
      resources[relatedType] = docs.map((doc) => persistence.toExternal(doc, relatedDef.idField));
    })
  );

  return {
    dependent,
    summaryText,
    resources,
  };
}

function buildHealthSummaryPrompt(params: {
  dependentId: string;
  dependentName: string;
  action: HealthSummaryAction;
  resourceType: ResourceType;
  reason: string;
  relevantRecords: Record<string, unknown>[];
  snapshot: DependentSnapshot;
}): HealthSummarySamplingPrompt {
  const {
    dependentId,
    dependentName,
    action,
    resourceType,
    reason,
    relevantRecords,
    snapshot,
  } = params;

  const actionDescription = action === 'create'
    ? 'New clinical data was recorded'
    : 'Existing clinical data was updated';

  const existingSummary = snapshot.summaryText ?? 'No active health summary recorded yet.';
  const newRecordsBlock = relevantRecords.length > 0
    ? stringifyForPrompt(relevantRecords)
    : 'No direct record payload was returned for this dependent in this request.';

  const snapshotBlock = stringifyForPrompt({
    dependent: snapshot.dependent,
    resources: snapshot.resources,
  });

  const promptSections = [
    [
      '## Task',
      `Regenerate the active health summary for dependent ${dependentName} (${dependentId}).`,
      `Reason: ${reason}. ${actionDescription} in resource type "${resourceType}".`,
    ].join('\n'),
    [
      '## Writing Instructions',
      '- Follow the outline exactly as written below.',
      '- Preserve previously documented clinical context unless superseded by new information.',
      '- Use the full dependent snapshot to ensure every major domain stays populated (conditions, medications, labs/imaging, care plan, risks).',
      '- Call out when data is unchanged, unknown, or pending instead of omitting sections.',
    ].join('\n'),
    [
      '## Health Summary Outline',
      HEALTH_SUMMARY_OUTLINE_MARKDOWN,
    ].join('\n'),
    [
      '## Existing Active Summary',
      existingSummary,
    ].join('\n'),
    [
      `## Newly ${action === 'create' ? 'Captured' : 'Updated'} Records`,
      newRecordsBlock,
    ].join('\n'),
    [
      '## Dependent Snapshot Data',
      snapshotBlock,
    ].join('\n'),
    [
      '## Response Requirements',
      '- Return only the updated health summary text.',
      '- Do not include commentary, code fences, or explanations.',
    ].join('\n'),
  ];

  const promptText = promptSections.join('\n\n');

  const systemPrompt = [
    'You are a clinical documentation specialist maintaining longitudinal health summaries.',
    'Write in a professional, concise tone appropriate for care teams.',
    'Highlight clinically meaningful updates first, organize information by the provided outline, and keep sections easy to scan.',
  ].join(' ');

  return {
    systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: promptText,
          },
        ],
      },
    ],
    maxTokens: 900,
    temperature: 0.2,
  };
}

async function buildHealthSummarySamplingPlans(
  adapter: PersistenceAdapter,
  resourceType: ResourceType,
  action: HealthSummaryAction,
  resourceDef: ResourceDefinition,
  records: Record<string, unknown> | Record<string, unknown>[],
  actionCopy?: { reason: string; summaryText: string }
): Promise<HealthSummarySamplingPlan[]> {
  if (!actionCopy) {
    return [];
  }

  const dependentIds = extractDependentIds(resourceType, resourceDef, records);
  if (dependentIds.length === 0) {
    return [];
  }

  const arrayRecords = Array.isArray(records) ? records : [records];
  const plans: HealthSummarySamplingPlan[] = [];

  for (const dependentId of dependentIds) {
    const relevantRecords = arrayRecords.filter((record) => {
      const recordDependentId = extractDependentIdFromRecord(resourceType, resourceDef, record);
      return recordDependentId === dependentId;
    });

    const snapshot = await buildDependentSnapshot(adapter, dependentId);
    const dependentName = getDependentDisplayName(snapshot.dependent);
    const prompt = buildHealthSummaryPrompt({
      dependentId,
      dependentName,
      action,
      resourceType,
      reason: actionCopy.reason,
      relevantRecords,
      snapshot,
    });

    plans.push({
      dependentId,
      dependentName,
      action,
      resourceType,
      reason: actionCopy.reason,
      prompt,
      previousSummary: snapshot.summaryText,
    });
  }

  return plans;
}

function buildDuplicateCheckError(resourceType: ResourceType): string {
  const hints = DUPLICATE_FILTER_HINTS[resourceType];
  const hintText = hints && hints.length > 0
    ? `Recommended filters when checking for duplicates: ${hints.join(', ')}`
    : '';
  return [
    `Duplicate check required for ${resourceType} records.`,
    `Call list_resource first to confirm an identical record does not already exist, then retry create_resource with duplicate_check_confirmed=true.`,
    hintText,
  ].filter(Boolean).join('\n');
}

export async function createResource(
  adapter: PersistenceAdapter,
  args: unknown,
  options?: CrudRuntimeOptions
) {
  const normalizedArgs = normalizeCreateResourceArgs(args);
  const validated = CreateResourceSchema.parse(normalizedArgs);
  let { resource_type, data, duplicate_check_confirmed } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}. Available types: ${getAllResourceTypes().join(', ')}`);
  }

  const typedResourceType = resource_type as ResourceType;
  if (
    HIGH_RISK_DUPLICATE_RESOURCE_TYPES.has(typedResourceType) &&
    duplicate_check_confirmed !== true
  ) {
    throw new Error(buildDuplicateCheckError(typedResourceType));
  }

  // Handle case where data arrives as a JSON string (common with some MCP clients)
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      throw new Error(`Invalid JSON in data parameter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const validatedData = parseWithEnhancedErrors(
    resourceDef.createSchema,
    data,
    resource_type,
    'create'
  );
  const persistence = adapter.forCollection(resourceDef.collectionName);
  const now = new Date();
  const resourceType = typedResourceType;

  // Handle batch creation
  if (Array.isArray(validatedData)) {
    if (!resourceDef.supportsBatch) {
      throw new Error(`Resource type ${resource_type} does not support batch creation`);
    }

    // This is a simplified implementation for batch PHI handling.
    // A more robust solution would handle per-record PHI.
    const detectedInBatch = validatedData
      .map((item: any) => detectPhi(item, resource_type))
      .flat();

    if (detectedInBatch.length > 0) {
      console.log(`PHI DETECTED in ${resource_type} (batch):`, detectedInBatch);
      // NOTE: Vaulting and sanitization are not yet implemented for batch operations.
      // This would require a more complex implementation to map vaulted entries
      // back to the correct records.
    }

    const records = validatedData.map((item: any) => {
      const normalized = ensureArchiveFlag(item as Record<string, unknown>);
      return {
        ...normalized,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const insertedRecords = await persistence.createMany(records);
    const formatted = insertedRecords.map((record) =>
      persistence.toExternal(record, resourceDef.idField)
    );

    let meta = buildHealthSummaryMeta(resourceType, 'create', resourceDef, formatted);
    const copy = HEALTH_SUMMARY_SUGGESTION_COPY[resourceType];
    const plans = copy
      ? await buildHealthSummarySamplingPlans(
          adapter,
          resourceType,
          'create',
          resourceDef,
          formatted,
          copy.create
        )
      : [];

    if (plans.length > 0) {
      await options?.onHealthSummaryPlan?.(plans);
      meta = meta ?? {};
      meta.health_summary_sampling = {
        status: 'requested',
        action: 'create',
        dependents: plans.map((plan) => ({
          dependent_id: plan.dependentId,
          reason: plan.reason,
        })),
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: formatted.length,
            [resourceDef.collectionName]: formatted,
          }, null, 2),
        },
      ],
      ...(meta ? { _meta: meta } : {}),
    };
  }

  // Handle single creation
  let normalizedData =
    validatedData && typeof validatedData === 'object'
      ? ensureArchiveFlag(validatedData as Record<string, unknown>)
      : (validatedData as Record<string, unknown>);

  let dependentPhiPayload: Record<string, unknown> | undefined;
  if (resourceType === 'dependent' && normalizedData && typeof normalizedData === 'object') {
    const separation = separatePhiPayload(normalizedData as Record<string, unknown>);
    normalizedData = separation.sanitized;
    dependentPhiPayload = separation.phiPayload;
  }

  const record = {
    ...normalizedData,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };

  const inserted = await persistence.create(record);
  const formatted = persistence.toExternal(inserted, resourceDef.idField);

  const resourceId = new ObjectId(formatted[resourceDef.idField] as string);
  const pendingUpdates: Record<string, unknown> = {};

  if (resourceType === 'dependent' && dependentPhiPayload) {
    if (typeof adapter.getDb === 'function') {
      const phiVaultId = await upsertStructuredPhiVault(
        adapter.getDb(),
        resourceId,
        dependentPhiPayload
      );
      pendingUpdates.phi_vault_id = phiVaultId;
    }
    
    // Compute and inject de-identified profile
    const deidentified = computeDemographics(dependentPhiPayload as any);
    (formatted as any).deidentified_profile = deidentified;
  }

  const phiFields = resourceDef.phiFields ?? [];
  if (phiFields.length > 0) {
    const dependentIdString = extractDependentIds(resourceType, resourceDef, formatted)[0];
    if (!dependentIdString) {
      console.warn(
        `Skipping PHI vaulting for ${resourceType} ${resourceId.toHexString()} - dependent_id not found`
      );
    } else {
      const dependentId = new ObjectId(dependentIdString);
      if (typeof adapter.getDb === 'function') {
        const sanitizedForUpdate = await vaultAndSanitize(
          new MongoPhiVaultAdapter(adapter.getDb()),
          resourceType,
          resourceId,
          dependentId,
          normalizedData
        );

        if (!isEqual(sanitizedForUpdate, normalizedData)) {
          Object.assign(pendingUpdates, sanitizedForUpdate);
        }
      }
    }
  }

  if (Object.keys(pendingUpdates).length > 0) {
    await persistence.updateById(resourceId.toHexString(), { set: pendingUpdates });
    Object.assign(formatted, pendingUpdates);
    if (pendingUpdates.phi_vault_id instanceof ObjectId) {
      formatted.phi_vault_id = pendingUpdates.phi_vault_id.toHexString();
    }
  }

  let meta = buildHealthSummaryMeta(resourceType, 'create', resourceDef, formatted);
  const copy = HEALTH_SUMMARY_SUGGESTION_COPY[resourceType];
  const plans = copy
    ? await buildHealthSummarySamplingPlans(
        adapter,
        resourceType,
        'create',
        resourceDef,
        formatted,
        copy.create
      )
    : [];

  if (plans.length > 0) {
    await options?.onHealthSummaryPlan?.(plans);
    meta = meta ?? {};
    meta.health_summary_sampling = {
      status: 'requested',
      action: 'create',
      dependents: plans.map((plan) => ({
        dependent_id: plan.dependentId,
        reason: plan.reason,
      })),
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...formatted,
        }, null, 2),
      },
    ],
    ...(meta ? { _meta: meta } : {}),
  };
}

export async function getResource(adapter: PersistenceAdapter, args: unknown) {
  const validated = GetResourceSchema.parse(args);
  const { resource_type, id } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  const persistence = adapter.forCollection(resourceDef.collectionName);

  if (!persistence.validateId(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  const record = await persistence.findById(id);

    if (!record) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const formatted = persistence.toExternal(record, resourceDef.idField);
  if (isArchivedRecord(formatted)) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const db = typeof adapter.getDb === 'function' ? adapter.getDb() : null;

  if (resource_type === 'dependent' && formatted.phi_vault_id && db) {
    const vaultId = new ObjectId(formatted.phi_vault_id as string);
    const vaultEntry = await getStructuredPhiVault(db, vaultId);
    if (vaultEntry) {
      const deidentified = computeDemographics(vaultEntry);
      (formatted as any).deidentified_profile = deidentified;
    }
  }

  // Apply unstructured PHI de-identification to text fields
  if (db && resourceDef.phiFields && resourceDef.phiFields.length > 0) {
    const resourceId = new ObjectId(formatted[resourceDef.idField] as string);
    const unstructuredEntries = await getUnstructuredPhiVaultEntries(db, [resourceId]);
    
    if (unstructuredEntries.length > 0) {
      // We only need to check fields that are strings and might contain tokens
      // For now, simple approach: JSON stringify, replace, parse back?
      // Or specific fields. Let's use specific fields from definition.
      for (const fieldDef of resourceDef.phiFields) {
        // For now, we only handle top-level or simple nested string fields
        // Complex nesting traversal might be needed, but let's start simple.
        // Using lodash get/set would be ideal but we need to iterate.
        // The deidentifyString function handles the token replacement.
        
        // NOTE: _.get/set are not imported here, but we can import them or do simple access
        // Actually, resourceDef.phiFields has paths.
        // But wait, the formatted record might have the token in ANY string field if
        // it was caught by a "whole-field" or "substring" detector.
        // However, we only vault what matches phiFields configuration.
        // So we should iterate phiFields paths.
        // BUT: We don't have lodash here.
        
        // Let's do a quick string scan on the serialized record to be safe and comprehensive?
        // It might be safer to just stringify the whole record, replace tokens, and parse back.
        // This covers all fields and nested structures without complex traversal logic.
        const jsonStr = JSON.stringify(formatted);
        if (jsonStr.includes('phi:vault:')) {
           const deidentifiedStr = deidentifyString(jsonStr, unstructuredEntries);
           if (deidentifiedStr !== jsonStr) {
             const deidentifiedRecord = JSON.parse(deidentifiedStr);
             Object.assign(formatted, deidentifiedRecord);
           }
        }
      }
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...formatted,
        }, null, 2),
      },
    ],
  };
}

export async function updateResource(
  adapter: PersistenceAdapter,
  args: unknown,
  options?: CrudRuntimeOptions
) {
  const validated = UpdateResourceSchema.parse(args);
  let { resource_type, id, data } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  const persistence = adapter.forCollection(resourceDef.collectionName);

  if (!persistence.validateId(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  // Handle case where data arrives as a JSON string (common with some MCP clients)
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      throw new Error(`Invalid JSON in data parameter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Validate update data against update schema (but merge with id field)
  // We also strip common immutable/system fields that LLMs might hallucinate/echo back
  const { _id, dependent_id, created_at, updated_at, created_by, updated_by, ...cleanData } = data;
  const updateData = { [resourceDef.idField]: id, ...cleanData };
  const validatedUpdate = parseWithEnhancedErrors(
    resourceDef.updateSchema,
    updateData,
    resource_type,
    'update'
  );
  
  // Remove the id field from updates (it's used for querying, not updating)
  const { [resourceDef.idField]: _, ...extractedUpdates } = validatedUpdate;

  let updates = extractedUpdates as Record<string, unknown>;
  let dependentPhiPayload: Record<string, unknown> | undefined;
  if (resource_type === 'dependent') {
    const separation = separatePhiPayload(updates);
    updates = separation.sanitized;
    dependentPhiPayload = separation.phiPayload;
  }

  const existingRecord = await persistence.findById(id);
  if (!existingRecord) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const resourceIdForVault = new ObjectId(id);
  const pendingUpdates: Record<string, unknown> = { ...updates };

  const phiFields = resourceDef.phiFields ?? [];
  if (phiFields.length > 0) {
    const dependentIdForVaultString = extractDependentIds(
      resource_type as ResourceType,
      resourceDef,
      existingRecord
    )[0];

    if (!dependentIdForVaultString) {
      console.warn(
        `Skipping PHI vaulting for ${resource_type} ${id} - dependent_id not found`
      );
    } else {
      const dependentIdForVault = new ObjectId(dependentIdForVaultString);
      if (typeof adapter.getDb === 'function') {
        const sanitizedUpdates = await vaultAndSanitize(
          new MongoPhiVaultAdapter(adapter.getDb()),
          resource_type,
          resourceIdForVault,
          dependentIdForVault,
          updates
        );

        if (!isEqual(sanitizedUpdates, updates)) {
          Object.assign(pendingUpdates, sanitizedUpdates);
        }
      }
    }
  }

  if (resource_type === 'dependent' && dependentPhiPayload) {
    if (typeof adapter.getDb === 'function') {
      const existingVaultId =
        existingRecord.phi_vault_id instanceof ObjectId
          ? existingRecord.phi_vault_id
          : typeof existingRecord.phi_vault_id === 'string' && ObjectId.isValid(existingRecord.phi_vault_id)
          ? new ObjectId(existingRecord.phi_vault_id)
          : undefined;

      const phiVaultId = await upsertStructuredPhiVault(
        adapter.getDb(),
        resourceIdForVault,
        dependentPhiPayload,
        existingVaultId
      );
      pendingUpdates.phi_vault_id = phiVaultId;
    }
  }

  const result = await persistence.updateById(
    id,
    {
      set: {
        ...pendingUpdates,
        updated_at: new Date(),
        updated_by: 'mcp',
      },
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const formatted = persistence.toExternal(result, resourceDef.idField);

  if (resource_type === 'dependent' && formatted.phi_vault_id) {
    if (typeof adapter.getDb === 'function') {
      const db = adapter.getDb();
      const vaultId = new ObjectId(formatted.phi_vault_id as string);
      const vaultEntry = await getStructuredPhiVault(db, vaultId);
      if (vaultEntry) {
        (formatted as any).deidentified_profile = computeDemographics(vaultEntry);
      }
    }
  }

  const resourceTypeForMeta = resourceDef.name as ResourceType;
  let meta = buildHealthSummaryMeta(resourceTypeForMeta, 'update', resourceDef, formatted);
  const copy = HEALTH_SUMMARY_SUGGESTION_COPY[resourceTypeForMeta];
  const plans = copy
    ? await buildHealthSummarySamplingPlans(
        adapter,
        resourceTypeForMeta,
        'update',
        resourceDef,
        formatted,
        copy.update
      )
    : [];

  if (plans.length > 0) {
    await options?.onHealthSummaryPlan?.(plans);
    meta = meta ?? {};
    meta.health_summary_sampling = {
      status: 'requested',
      action: 'update',
      dependents: plans.map((plan) => ({
        dependent_id: plan.dependentId,
        reason: plan.reason,
      })),
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...formatted,
        }, null, 2),
      },
    ],
    ...(meta ? { _meta: meta } : {}),
  };
}

export async function deleteResource(adapter: PersistenceAdapter, args: unknown) {
  const validated = DeleteResourceSchema.parse(args);
  const { resource_type, id } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  if (resource_type === 'dependent') {
    throw new Error(
      'Patient deletion is disabled via MCP. Use the AC130 dashboard to delete a profile so all related records are cleaned up safely.'
    );
  }

  const persistence = adapter.forCollection(resourceDef.collectionName);

  if (!persistence.validateId(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  const result = await persistence.deleteById(id);

  if (!result) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const formatted = persistence.toExternal(result, resourceDef.idField);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          status: 'deleted',
          [resourceDef.idField]: id,
          deleted: {
            ...formatted,
          },
        }, null, 2),
      },
    ],
  };
}

export async function listResource(adapter: PersistenceAdapter, args: unknown) {
  const validated = ListResourceSchema.parse(args);
  let { resource_type, filters = {}, limit = 50 } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  // Handle case where filters arrives as a JSON string (common with some MCP clients)
  if (typeof filters === 'string') {
    try {
      filters = JSON.parse(filters);
    } catch (e) {
      throw new Error(`Invalid JSON in filters parameter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Ensure filters is an object, not undefined or null
  if (!filters || typeof filters !== 'object') {
    filters = {};
  }

  // If resource has a list schema, validate filters by merging with limit
  let query: any = {};
  if (resourceDef.listSchema) {
    // Merge filters with limit for validation
    const filterData = { ...filters, limit };
    const validatedFilters = parseWithEnhancedErrors(
      resourceDef.listSchema,
      filterData,
      resource_type,
      'list'
    );
    query = { ...validatedFilters };
    // Remove limit from query (we'll use it separately for MongoDB)
    delete query.limit;
  } else {
    // Otherwise, use filters directly (with basic validation)
    query = filters;
  }

  const persistence = adapter.forCollection(resourceDef.collectionName);
  const records = await persistence.find(query, limit);
  const formattedRecords = records.map((record) =>
    persistence.toExternal(record, resourceDef.idField)
  );
  const hasArchivedFilter = Object.prototype.hasOwnProperty.call(query, 'archived');
  const visibleRecords = hasArchivedFilter
    ? formattedRecords
    : formattedRecords.filter((record) => !isArchivedRecord(record));

  const db = typeof adapter.getDb === 'function' ? adapter.getDb() : null;

  if (resource_type === 'dependent' && db) {
    const vaultIds: ObjectId[] = [];
    for (const rec of visibleRecords) {
      if (rec.phi_vault_id) {
        vaultIds.push(new ObjectId(rec.phi_vault_id as string));
      }
    }
    
    if (vaultIds.length > 0) {
      const vaultsMap = await getStructuredPhiVaults(db, vaultIds);
      for (const rec of visibleRecords) {
        if (rec.phi_vault_id) {
           const vaultEntry = vaultsMap.get(rec.phi_vault_id as string);
           if (vaultEntry) {
             (rec as any).deidentified_profile = computeDemographics(vaultEntry);
           }
        }
      }
    }
  }

  // Apply unstructured PHI de-identification
  if (db && resourceDef.phiFields && resourceDef.phiFields.length > 0 && visibleRecords.length > 0) {
    const resourceIds = visibleRecords.map(r => new ObjectId(r[resourceDef.idField] as string));
    const unstructuredEntries = await getUnstructuredPhiVaultEntries(db, resourceIds);
    
    if (unstructuredEntries.length > 0) {
      // Optimization: Check if any record string contains 'phi:vault:' before processing
      // But for list, stringifying array is expensive.
      // We can just loop records.
      for (const rec of visibleRecords) {
        const jsonStr = JSON.stringify(rec);
        if (jsonStr.includes('phi:vault:')) {
           // Filter entries for this resource only?
           // deidentifyString accepts all entries and finds matches by ID.
           // Passing all entries is fine, the map lookup is fast.
           const deidentifiedStr = deidentifyString(jsonStr, unstructuredEntries);
           if (deidentifiedStr !== jsonStr) {
             const deidentifiedRecord = JSON.parse(deidentifiedStr);
             Object.assign(rec, deidentifiedRecord);
           }
        }
      }
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: visibleRecords.length,
          [resourceDef.collectionName]: visibleRecords,
        }, null, 2),
      },
    ],
  };
}
