import { PhiVaultEntry } from '../types.js';
import { PhiEntry } from './types.js';

export interface DeidentifiedProfile {
  age?: number;
  birth_year?: number;
  sex?: string;
  location?: string; // e.g. "State, Country" or just "State"
}

function calculateAge(dob?: string, birthYear?: number): number | undefined {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (dob) {
    const birthDate = new Date(dob);
    if (!isNaN(birthDate.getTime())) {
      let age = currentYear - birthDate.getFullYear();
      const m = now.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }
  }

  if (birthYear) {
    return currentYear - birthYear;
  }

  return undefined;
}

export function computeDemographics(entry: PhiVaultEntry): DeidentifiedProfile {
  const profile: DeidentifiedProfile = {};

  // Age
  const age = calculateAge(entry.full_dob, entry.birth_year);
  if (age !== undefined) {
    profile.age = age;
  }
  if (entry.birth_year) {
    profile.birth_year = entry.birth_year;
  }

  // Sex
  if (entry.sex) {
    profile.sex = entry.sex;
  }

  // Location (State/Country only)
  const parts = [];
  if (entry.address?.state) {
    parts.push(entry.address.state);
  }
  if (entry.address?.country) {
    parts.push(entry.address.country);
  }
  
  if (parts.length > 0) {
    profile.location = parts.join(', ');
  }

  return profile;
}

function deidentifyValue(value: string, type: string | null | undefined): string {
  if (type === 'PERSON') {
    return '[Name]';
  }
  if (type === 'DATE_TIME') {
    // Try to parse as date and return year
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.getFullYear().toString();
    }
    return '[Date]';
  }
  // Default fallback
  return '[Redacted]';
}

export function deidentifyString(text: string, entries: PhiEntry[]): string {
  if (!entries || entries.length === 0) {
    return text;
  }

  // Sort entries to handle replacements (maybe longest first? or by vault ID?)
  // The text contains tokens like phi:vault:TYPE:ID.
  // We can regex match the tokens and look them up in the entries list.
  
  // Regex for tokens: phi:vault:[A-Z_]+:[a-f0-9]{24} or phi:vault:[a-f0-9]{24}
  // Based on vault.ts: `phi:vault${typePart}:${vaultId.toHexString()}`
  const tokenRegex = /phi:vault(?::([A-Z_]+))?:([a-f0-9]{24})/g;

  return text.replace(tokenRegex, (match, type, id) => {
    const entry = entries.find(e => e._id === id);
    if (entry) {
      return deidentifyValue(entry.value, entry.phi_type || type);
    }
    // If we can't find the entry, keep the token (or replace with [Redacted]?)
    // Keeping the token is safer for debugging but worse for LLM readability.
    // Let's return [Redacted] if we can't find it, assuming it's sensitive.
    // Actually, if we return the token, the LLM stays confused.
    // If we return [Unknown Redacted], it's better.
    return '[Redacted]';
  });
}
