export interface SharedResourceMetadata {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface SharedResourceContent extends SharedResourceMetadata {
  text: string;
}

export const HEALTH_SUMMARY_OUTLINE_URI = 'guide://health_summary/outline';

export const HEALTH_SUMMARY_OUTLINE_MARKDOWN = `# Health Summary Outline

Use this structure whenever you generate or refresh a patient's health summary. Keep the tone clinical but approachable, write in short paragraphs or bullet points, and highlight the most actionable details first.

## 1. Patient Snapshot
- Name (or initials) and age
- Sex/gender, pronouns if given
- Key demographics or social context (caregiver, living situation, support system)
- Primary care team or specialists involved

## 2. Current Status
- One-sentence status headline (e.g., "Stable chronic conditions, monitoring blood pressure")
- Chief concerns or goals in the current period

## 3. Active Conditions
- Bullet list ordered by severity or recency
- For each: condition name, status (active/resolved/chronic), notable dates, current management plan

## 4. Medications & Treatments
- Active medications with dose, frequency, and indication
- Pending medication changes or adherence issues
- Key therapies, procedures, or home health tasks in flight

## 5. Key Findings & Labs
- Most recent vitals trends (BP, weight, etc.) if relevant
- Significant lab or imaging results with interpretation
- Any follow-up diagnostics ordered or pending

## 6. Care Plan & Follow-ups
- Upcoming appointments or monitoring checkpoints
- Education provided to patient/caregiver
- Action items for the care team (with owners when possible)

## 7. Risks & Watch Items
- Acute risks (e.g., readmission, worsening symptoms)
- Precautions, barriers to care, or social determinants affecting the plan

## Writing Guidance
- Focus on clinically meaningful facts; omit boilerplate.
- Surface changes since the last summary.
- Use numerals for dates (MM/DD/YYYY) and standardized units.
- Prefer short clauses and bullets instead of long prose.
- If information is unknown or pending, state that explicitly rather than leaving gaps.
`;

const SHARED_RESOURCES: SharedResourceContent[] = [
  {
    uri: HEALTH_SUMMARY_OUTLINE_URI,
    name: 'Health Summary Outline',
    description: 'Standard outline and writing guidance for patient health summaries.',
    mimeType: 'text/markdown',
    text: HEALTH_SUMMARY_OUTLINE_MARKDOWN,
  },
];

export function getSharedResourceMetadata(): SharedResourceMetadata[] {
  return SHARED_RESOURCES.map(({ text, ...rest }) => rest);
}

export function readSharedResource(uri: string): SharedResourceContent | null {
  const resource = SHARED_RESOURCES.find((res) => res.uri === uri);
  return resource ?? null;
}
