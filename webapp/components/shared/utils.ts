const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const isLikelyDateKey = (key: string) => {
  const lower = key.toLowerCase();
  return lower.includes('date') || lower.endsWith('_at');
};

const isLikelyNameKey = (key: string) => {
  const lower = key.toLowerCase();
  return (
    lower === 'name' ||
    lower.endsWith('_name') ||
    lower.includes('patient_name') ||
    lower.includes('dependent_name') ||
    lower.includes('provider_name')
  );
};

const isLikelyGenderKey = (key: string) => {
  const lower = key.toLowerCase();
  return lower === 'sex' || lower === 'gender';
};

const titleCase = (value: string) => {
  if (!value) {
    return value;
  }
  return value
    .toLowerCase()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getDateFromValue = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const isoCandidate = new Date(trimmed);
    if (!Number.isNaN(isoCandidate.getTime())) {
      return isoCandidate;
    }

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        // Interpret digits >= 13 length as milliseconds, otherwise seconds.
        const millis = trimmed.length >= 13 ? numeric : numeric * 1000;
        const date = new Date(millis);
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;

    // Firestore Timestamp instances expose toDate()
    if (typeof candidate.toDate === 'function') {
      try {
        const date = candidate.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date;
        }
      } catch {
        // fall through to other detection paths
      }
    }

    // Check for Firestore timestamp patterns - be very permissive
    const hasSecondsField = 
      '_seconds' in candidate || 
      'seconds' in candidate || 
      'secondsValue' in candidate ||
      'timestamp' in candidate;
    
    if (hasSecondsField) {
      const secondsRaw =
        candidate._seconds ?? 
        candidate.seconds ?? 
        candidate.secondsValue ??
        (typeof candidate.timestamp === 'object' && candidate.timestamp !== null 
          ? (candidate.timestamp as Record<string, unknown>).seconds ?? null
          : null) ??
        null;

      const secondsField =
        typeof secondsRaw === 'number' && !Number.isNaN(secondsRaw)
          ? secondsRaw
          : typeof secondsRaw === 'string'
          ? Number(secondsRaw)
          : null;

      if (secondsField !== null && secondsField > 0) {
        const nanosRaw =
          candidate._nanoseconds ??
          candidate.nanoseconds ??
          candidate.nanos ??
          (typeof candidate.timestamp === 'object' && candidate.timestamp !== null
            ? (candidate.timestamp as Record<string, unknown>).nanoseconds ?? null
            : null) ??
          0;

        const nanosField =
          typeof nanosRaw === 'number' && !Number.isNaN(nanosRaw)
            ? nanosRaw
            : typeof nanosRaw === 'string'
            ? Number(nanosRaw)
            : 0;

        const millis =
          secondsField * 1000 + Math.floor((nanosField || 0) / 1_000_000);
        const date = new Date(millis);
        if (!Number.isNaN(date.getTime()) && date.getTime() > 0) {
          return date;
        }
      }
    }
  }

  return null;
};

export const formatDateValue = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const date = getDateFromValue(value);

  if (!date) {
    return null;
  }

  return DATE_FORMATTER.format(date);
};

export const humanNameToString = (name: any): string | null => {
  if (!name) return null;
  if (typeof name === 'string') return name;
  if (Array.isArray(name)) {
    const parts = name
      .map(part => humanNameToString(part))
      .filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  if (typeof name === 'object') {
    if (typeof name.text === 'string' && name.text.trim()) {
      return name.text.trim();
    }
    const given = Array.isArray(name.given) ? name.given.join(' ') : name.given ?? '';
    const family = Array.isArray(name.family) ? name.family.join(' ') : name.family ?? '';
    const full = [given, family].filter(Boolean).join(' ').trim();
    return full || null;
  }
  return String(name);
};

const toLabel = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const MAX_OBJECT_DEPTH = 3;
const MAX_OBJECT_ENTRIES = 12;

export const formatFieldValue = (
  key: string,
  value: unknown,
  depth = 0,
): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (value instanceof Date) {
    return formatDateValue(value) ?? 'N/A';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'N/A';
    }

    const primitiveItems = value.every(
      item =>
        item === null ||
        item === undefined ||
        ['string', 'number', 'boolean'].includes(typeof item),
    );

    if (primitiveItems) {
      return value
        .map(item =>
          item === null || item === undefined ? 'N/A' : String(item).trim(),
        )
        .filter(item => item.length > 0)
        .join(', ');
    }

    const formattedItems = value
      .map(item => formatFieldValue(key, item, depth + 1))
      .filter(item => item && item !== 'N/A');

    if (formattedItems.length === 0) {
      return 'N/A';
    }

    return formattedItems.map(item => `• ${item}`).join('\n');
  }

  if (typeof value === 'object') {
    const formattedDate = formatDateValue(value);
    if (formattedDate) {
      return formattedDate;
    }

    if (isLikelyNameKey(key)) {
      const humanName = humanNameToString(value);
      if (humanName) {
        return humanName;
      }
    }

    const humanName = humanNameToString(value);
    if (humanName) {
      return humanName;
    }

    if (depth < MAX_OBJECT_DEPTH) {
      const candidate = value as Record<string, unknown>;
      const entries = Object.entries(candidate).slice(0, MAX_OBJECT_ENTRIES);

      if (entries.length > 0) {
        const formattedEntries = entries
          .map(([childKey, childValue]) => {
            const formatted = formatFieldValue(childKey, childValue, depth + 1);
            if (!formatted || formatted === 'N/A') {
              return null;
            }
            return `${toLabel(childKey)}: ${formatted}`;
          })
          .filter((entry): entry is string => Boolean(entry));

        if (formattedEntries.length > 0) {
          return formattedEntries.join('\n');
        }
      }
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      if (isLikelyGenderKey(key)) {
        return titleCase(trimmed);
      }

      if (isLikelyNameKey(key)) {
        return titleCase(trimmed);
      }

      if (ISO_DATE_REGEX.test(trimmed) || isLikelyDateKey(key)) {
        const formatted = formatDateValue(trimmed);
        if (formatted) {
          return formatted;
        }
      }

      if (isLikelyDateKey(key) && /^\d+$/.test(trimmed)) {
        const numeric = Number(trimmed);
        if (!Number.isNaN(numeric)) {
          const millis = trimmed.length >= 13 ? numeric : numeric * 1000;
          const formatted = formatDateValue(millis);
          if (formatted) {
            return formatted;
          }
        }
      }
    }
    return value;
  }

  if (typeof value === 'number' && isLikelyDateKey(key)) {
    const formatted = formatDateValue(value);
    if (formatted) {
      return formatted;
    }
    if (value < 1_000_000_000_000) {
      const secondsFormatted = formatDateValue(value * 1000);
      if (secondsFormatted) {
        return secondsFormatted;
      }
    }
  }

  const formatted = formatDateValue(value);
  if (formatted && isLikelyDateKey(key)) {
    return formatted;
  }

  return String(value);
};

export const formatTitleCandidate = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  const humanName = humanNameToString(value);
  if (humanName) {
    return humanName;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(part => formatTitleCandidate(part))
      .filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  return String(value);
};
