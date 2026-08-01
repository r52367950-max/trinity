import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bundles the game into one self-contained HTML file — no imports, no network,
 * nothing to serve. Handy for dropping the game somewhere that only takes a
 * single file, and it makes `file://` work.
 *
 *   node build.mjs [outfile]
 *
 * The transform is deliberately small rather than general. Every module here
 * uses only `import * as`, `import { … } from './x.js'`, and
 * `export const|function|class`, so each file can be wrapped in an IIFE that
 * returns its exports and imports become plain destructuring. three.js is
 * handled the same way: its cross-file import and its two export blocks are
 * rewritten into object literals.
 */

const root = new URL('.', import.meta.url).pathname;
const out = process.argv[2] || join(root, 'dist', 'leeward.html');

// dependency order — imports only ever point backwards in this list
const MODULES = [
  'layers', 'shared', 'utils', 'noise', 'atmosphere', 'materials', 'waves',
  'terrain', 'town', 'ocean', 'wake', 'boat', 'powerboat', 'skipper', 'post', 'hud',
  'input', 'main',
];

/** `export{a as B,c}` -> `{B: a, c: c}` */
function exportListToObject(list) {
  return '{' + list.split(',').map((entry) => {
    const m = entry.trim().match(/^([$\w]+)(?:\s+as\s+([$\w]+))?$/);
    if (!m) throw new Error(`unparsed export entry: ${entry}`);
    return `${JSON.stringify(m[2] || m[1])}:${m[1]}`;
  }).join(',') + '}';
}

/** `export{A,B as C}from"…"` -> `{A: src.A, C: src.B}` */
function reexportToObject(list, src) {
  return '{' + list.split(',').map((entry) => {
    const m = entry.trim().match(/^([$\w]+)(?:\s+as\s+([$\w]+))?$/);
    if (!m) throw new Error(`unparsed re-export entry: ${entry}`);
    return `${JSON.stringify(m[2] || m[1])}:${src}.${m[1]}`;
  }).join(',') + '}';
}

/** `import{X as a,Y}` -> `const {X: a, Y} = src;` */
function importListToDestructure(list, src) {
  return 'const {' + list.split(',').map((entry) => {
    const m = entry.trim().match(/^([$\w]+)(?:\s+as\s+([$\w]+))?$/);
    if (!m) throw new Error(`unparsed import entry: ${entry}`);
    return m[2] ? `${m[1]}:${m[2]}` : m[1];
  }).join(',') + `} = ${src};`;
}

function bundleThree() {
  let core = readFileSync(join(root, 'vendor/three/three.core.min.js'), 'utf8');
  let mod = readFileSync(join(root, 'vendor/three/three.module.min.js'), 'utf8');

  // core: the single trailing export block becomes the module object
  const coreExport = core.match(/export\{([^}]*)\};?\s*$/);
  if (!coreExport) throw new Error('three.core: export block not found');
  core = core.slice(0, coreExport.index) +
    `\nreturn ${exportListToObject(coreExport[1])};`;

  // module: one import from core, then a re-export block and a final export
  const modImport = mod.match(/import\{([^}]*)\}from"\.\/three\.core\.min\.js";/);
  if (!modImport) throw new Error('three.module: core import not found');
  mod = mod.slice(0, modImport.index) +
    importListToDestructure(modImport[1], '__CORE') +
    mod.slice(modImport.index + modImport[0].length);

  // two export blocks: a re-export of core's names (which carries its own
  // `from` clause) and the module's own aliased exports
  const blocks = [...mod.matchAll(/export\{([^}]*)\}\s*(from\s*"[^"]*"\s*;?|;?)/g)];
  if (blocks.length !== 2) throw new Error(`three.module: expected 2 export blocks, got ${blocks.length}`);
  // replace back to front so the earlier index stays valid
  for (const b of blocks.slice().reverse()) {
    const obj = b[2].startsWith('from')
      ? reexportToObject(b[1], '__CORE')
      : exportListToObject(b[1]);
    mod = mod.slice(0, b.index) + `__EXPORTS.push(${obj});` +
      mod.slice(b.index + b[0].length);
  }

  return `const __THREE = (function () {
  const __CORE = (function () {${core}
  })();
  const __EXPORTS = [];
  (function () {${mod}
  })();
  return Object.assign({}, __CORE, ...__EXPORTS);
})();
`;
}

function bundleModule(name) {
  const src = readFileSync(join(root, 'src', `${name}.js`), 'utf8');
  const exported = [];
  const lines = src.split('\n').map((line) => {
    let m = line.match(/^import \* as (\w+) from ['"]three['"];\s*$/);
    if (m) return `const ${m[1]} = __THREE;`;

    m = line.match(/^import \{([^}]*)\} from ['"]\.\/(\w+)\.js['"];\s*$/);
    if (m) return importListToDestructure(m[1], `__m_${m[2]}`);

    if (/^import\b/.test(line)) throw new Error(`${name}: unhandled import — ${line}`);

    m = line.match(/^export (const|let|function|class) ([$\w]+)/);
    if (m) {
      exported.push(m[2]);
      return line.slice('export '.length);
    }
    if (/^export\b/.test(line)) throw new Error(`${name}: unhandled export — ${line}`);
    return line;
  });

  return `const __m_${name} = (function () {
${lines.join('\n')}
return {${exported.join(',')}};
})();
`;
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<script type="importmap">/)[1];

const script = [bundleThree(), ...MODULES.map(bundleModule)].join('\n');

const page = `<title>Leeward — 第一人称帆船 / First-person sailing</title>
<style>${style}</style>
${body.trim()}
<script>
${script}
</script>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(out, page);
console.log(`${out}  ${(page.length / 1024 / 1024).toFixed(2)} MB`);
