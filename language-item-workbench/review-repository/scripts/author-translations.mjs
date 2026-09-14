import { requireRule, unique } from './registry-checks.mjs';

const chinese = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{3134f}]/u;

export function validateAuthorTranslations(pkg) {
  const translations = pkg.authoringPackage?.englishTranslations;
  if (translations === undefined) return;
  requireRule(Array.isArray(translations), 'English translations must be an array');
  const paths = [];
  for (const entry of translations) {
    requireRule(entry && typeof entry === 'object' && !Array.isArray(entry), 'English translation must be an object');
    requireRule(Object.keys(entry).sort().join(',') === 'englishText,path,sourceText', 'Invalid English translation fields');
    requireRule(typeof entry.path === 'string' && /^\/(?:[^~]|~[01])+$/.test(entry.path), 'English translation needs a valid source pointer');
    requireRule(typeof entry.sourceText === 'string' && entry.sourceText.trim(), 'English translation needs its source text');
    requireRule(typeof entry.englishText === 'string' && /[a-z]/i.test(entry.englishText)
      && !chinese.test(entry.englishText), 'Provide an English translation without Chinese text');
    paths.push(entry.path);
  }
  unique(paths, 'English translation paths');
}

export function packageForPinnedSchema(pkg, schema) {
  validateAuthorTranslations(pkg);
  if (pkg.content?.language !== undefined) requireRule(['zh', 'en', 'es'].includes(pkg.content.language), 'Item language must be Chinese, English or Spanish');
  const projectTranslations = pkg.authoringPackage?.englishTranslations !== undefined
    && schema.properties?.authoringPackage?.properties?.englishTranslations === undefined;
  const projectLanguage = pkg.content?.language !== undefined && schema.properties?.content?.properties?.language === undefined;
  if (!projectTranslations && !projectLanguage) return pkg;
  // Published schemas stay immutable. Optional extensions have independent business validation.
  const projected = structuredClone(pkg);
  if (projectTranslations) delete projected.authoringPackage.englishTranslations;
  if (projectLanguage) delete projected.content.language;
  return projected;
}
