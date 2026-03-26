import { readFileSync, writeFileSync } from 'fs';

const SETTINGS_PATH = '/root/projects/cc-gateway/content/settings.json';

export function readSettings() {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return { guestVisibility: { '/': false, '/ideas': true } };
  }
}

export function writeSettings(data) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

const defaultCriteria = [
  { id: 'interest',       label: 'Interest',       weight: 1, invert: false },
  { id: 'feasibility',    label: 'Feasibility',    weight: 1, invert: false },
  { id: 'time_to_build',  label: 'Time to Build',  weight: 1, invert: true  },
  { id: 'learning_value', label: 'Learning Value', weight: 1, invert: false },
  { id: 'impact',         label: 'Impact',         weight: 1, invert: false },
  { id: 'originality',    label: 'Originality',    weight: 1, invert: false },
];

export function readCriteria() {
  const s = readSettings();
  return s.ranker?.criteria ?? defaultCriteria;
}

export function writeCriteria(criteria) {
  const s = readSettings();
  s.ranker = { ...s.ranker, criteria };
  writeSettings(s);
}
