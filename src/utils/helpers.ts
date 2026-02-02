import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

/**
 * String manipulation helpers
 */
export function camelize(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase());
}

export function underscore(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

export function pluralize(str: string): string {
  const irregulars: Record<string, string> = {
    person: 'people',
    child: 'children',
    man: 'men',
    woman: 'women',
    tooth: 'teeth',
    foot: 'feet',
    mouse: 'mice',
    goose: 'geese',
  };

  const lower = str.toLowerCase();
  if (irregulars[lower]) {
    return str[0] === str[0].toUpperCase()
      ? camelize(irregulars[lower])
      : irregulars[lower];
  }

  if (str.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].some(v => str.endsWith(v))) {
    return str.slice(0, -1) + 'ies';
  }
  if (str.endsWith('s') || str.endsWith('x') || str.endsWith('ch') || str.endsWith('sh')) {
    return str + 'es';
  }
  return str + 's';
}

export function singularize(str: string): string {
  const irregulars: Record<string, string> = {
    people: 'person',
    children: 'child',
    men: 'man',
    women: 'woman',
    teeth: 'tooth',
    feet: 'foot',
    mice: 'mouse',
    geese: 'goose',
  };

  const lower = str.toLowerCase();
  if (irregulars[lower]) {
    return str[0] === str[0].toUpperCase()
      ? camelize(irregulars[lower])
      : irregulars[lower];
  }

  if (str.endsWith('ies')) {
    return str.slice(0, -3) + 'y';
  }
  if (str.endsWith('es') && (str.endsWith('ses') || str.endsWith('xes') || str.endsWith('ches') || str.endsWith('shes'))) {
    return str.slice(0, -2);
  }
  if (str.endsWith('s') && !str.endsWith('ss')) {
    return str.slice(0, -1);
  }
  return str;
}

export function tableize(str: string): string {
  return pluralize(underscore(str));
}

export function classify(str: string): string {
  return camelize(singularize(str));
}

export function humanize(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * File system helpers
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, 'utf-8');
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf-8');
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function findFiles(pattern: string, cwd: string): Promise<string[]> {
  return glob(pattern, { cwd, absolute: true });
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * Path helpers
 */
export function getLibraryPath(basePath: string, ...segments: string[]): string {
  return path.join(basePath, 'library', ...segments);
}

export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Code helpers
 */
export function extractClassName(code: string, language: 'ruby' | 'typescript'): string | null {
  if (language === 'ruby') {
    const match = code.match(/class\s+(\w+)/);
    return match ? match[1] : null;
  }
  if (language === 'typescript') {
    const funcMatch = code.match(/(?:export\s+)?(?:default\s+)?function\s+(\w+)/);
    if (funcMatch) return funcMatch[1];

    const classMatch = code.match(/(?:export\s+)?(?:default\s+)?class\s+(\w+)/);
    if (classMatch) return classMatch[1];

    const constMatch = code.match(/(?:export\s+)?const\s+(\w+)\s*[=:]/);
    return constMatch ? constMatch[1] : null;
  }
  return null;
}

export function indentCode(code: string, spaces: number): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? indent + line : line))
    .join('\n');
}

export function stripIndent(code: string): string {
  const lines = code.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim());
  if (nonEmptyLines.length === 0) return code;

  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    })
  );

  return lines.map((line) => line.slice(minIndent)).join('\n');
}

/**
 * Matching and scoring helpers
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);

  const commonWords = words1.filter((w) => words2.includes(w));
  const totalWords = new Set([...words1, ...words2]).size;

  return commonWords.length / totalWords;
}

export function matchTriggers(input: string, triggers: string[]): number {
  const inputLower = input.toLowerCase();
  const inputWords = inputLower.split(/\s+/);

  let maxScore = 0;

  for (const trigger of triggers) {
    const triggerLower = trigger.toLowerCase();
    const triggerWords = triggerLower.split(/\s+/);

    // Exact match
    if (inputLower.includes(triggerLower)) {
      maxScore = Math.max(maxScore, 1);
      continue;
    }

    // Word overlap
    const commonWords = triggerWords.filter((w) => inputWords.includes(w));
    const score = commonWords.length / triggerWords.length;
    maxScore = Math.max(maxScore, score);
  }

  return maxScore;
}

/**
 * ID generation
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Validation helpers
 */
export function isValidRubyClassName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

export function isValidTypeScriptComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

export function isValidTableName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

/**
 * Safe JSON operations
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Async utilities
 */
export async function mapAsync<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  return Promise.all(items.map(fn));
}

export async function filterAsync<T>(
  items: T[],
  fn: (item: T) => Promise<boolean>
): Promise<T[]> {
  const results = await Promise.all(items.map(fn));
  return items.filter((_, index) => results[index]);
}
