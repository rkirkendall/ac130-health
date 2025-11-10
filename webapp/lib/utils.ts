import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: '2-digit',
  month: 'numeric',
  day: 'numeric',
});

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const isLikelyDateKey = (key: string) => {
  const lower = key.toLowerCase();
  return lower.includes('date') || lower.endsWith('_at');
};

export const formatDateValue = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value as string | number);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return DATE_FORMATTER.format(date);
};

export const formatFieldValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (value instanceof Date) {
    return formatDateValue(value) ?? 'N/A';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const formatted = formatDateValue(trimmed);
      if (formatted && (ISO_DATE_REGEX.test(trimmed) || isLikelyDateKey(key))) {
        return formatted;
      }
    }
    return value;
  }

  return String(value);
};
