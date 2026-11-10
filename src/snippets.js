// The snippet library, stored in snippets.json.
// It starts with the default snippets from Step 3 (src/stabilize.js);
// everything you change or add in the dashboard is saved here.
import fs from 'node:fs';
import { SNIPPETS_FILE } from './paths.js';
import { DEFAULT_SNIPPETS } from './stabilize.js';

const problem = (message) => Object.assign(new Error(message), { friendly: true });

export function loadSnippets() {
  if (!fs.existsSync(SNIPPETS_FILE)) return DEFAULT_SNIPPETS;
  return JSON.parse(fs.readFileSync(SNIPPETS_FILE, 'utf8'));
}

function save(snippets) {
  fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2) + '\n');
  return snippets;
}

// Create or update one snippet. New ones go to the end of the library.
export function saveSnippet({ id, name, description = '', param = null, code = '' }) {
  if (!name || !String(name).trim()) throw problem('A snippet needs a name.');
  const snippets = loadSnippets();
  const slug = id || String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'snippet';
  const entry = { id: slug, name: String(name).trim(), description, param: param || null, code };
  const index = snippets.findIndex((s) => s.id === slug);
  if (index >= 0) snippets[index] = entry;
  else if (id) throw problem(`There is no snippet "${id}".`);
  else if (snippets.some((s) => s.id === slug)) throw problem('A snippet with this name already exists.');
  else snippets.push(entry);
  return save(snippets);
}

export function deleteSnippet(id) {
  return save(loadSnippets().filter((s) => s.id !== id));
}

// Puts the default snippets back. Your own snippets stay.
export function restoreDefaults() {
  const own = loadSnippets().filter((s) => !DEFAULT_SNIPPETS.some((d) => d.id === s.id));
  return save([...DEFAULT_SNIPPETS, ...own]);
}
