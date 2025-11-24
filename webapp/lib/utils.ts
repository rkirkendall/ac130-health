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
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isLikelyDateKey = (key: string) => {
  const lower = key.toLowerCase();
  return lower.includes('date') || lower.endsWith('_at');
};

const toDate = (value: unknown): Date | null => {
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

    if (DATE_ONLY_REGEX.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(part => Number.parseInt(part, 10));
      if ([year, month, day].every(num => Number.isInteger(num))) {
        return new Date(year, month - 1, day);
      }
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

export const formatDateValue = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const date = toDate(value);
  if (!date) {
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

  if (typeof value === 'object' && !(value instanceof Date)) {
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
