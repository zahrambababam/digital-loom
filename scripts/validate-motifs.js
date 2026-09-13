#!/usr/bin/env node
/*
 * Validates every motif grid in digital-loom-2.html.
 *
 * Guards against the exact bug class this file is prone to: a motif is a
 * square NxN grid of characters, and both stampMotif() and
 * renderMotifToCanvas() derive both width and height from rows.length alone
 * (they never check individual row widths). A row that's one character too
 * short or too long doesn't throw — it silently reads past the end of the
 * string (undefined) or truncates, so a hand-typed grid with an off-by-one
 * renders wrong with no error anywhere. This script is the check that would
 * have caught that before it shipped.
 *
 * Checks per motif:
 *   1. rows is a non-empty array
 *   2. every row's length equals rows.length (square grid)
 *   3. every character is one of '.', '1', '2', '3'
 *
 * Also cross-checks that every motif id referenced by a region's `motifs`
 * list actually exists in MOTIFS, and flags MOTIFS entries no region uses.
 *
 * Usage: node scripts/validate-motifs.js [path-to-html]
 */
const fs = require('fs');
const path = process.argv[2] || path_default();
function path_default(){
  return require('path').join(__dirname, '..', 'digital-loom-2.html');
}

const html = fs.readFileSync(path, 'utf8');

function extractArray(varName){
  const marker = 'const ' + varName + ' = [';
  const start = html.indexOf(marker);
  if(start === -1) throw new Error('Could not find `const ' + varName + ' = [` in ' + path);
  const arrayStart = start + marker.length - 1; // position of the opening [
  let depth = 0, i = arrayStart, inStr = false, strCh = null, esc = false;
  for(; i < html.length; i++){
    const ch = html[i];
    if(inStr){
      if(esc){ esc = false; }
      else if(ch === '\\'){ esc = true; }
      else if(ch === strCh){ inStr = false; }
      continue;
    }
    if(ch === "'" || ch === '"'){ inStr = true; strCh = ch; continue; }
    if(ch === '[') depth++;
    else if(ch === ']'){
      depth--;
      if(depth === 0){ i++; break; }
    }
  }
  const text = html.slice(arrayStart, i);
  // eslint-disable-next-line no-eval
  return (0, eval)(text);
}

let MOTIFS, REGIONS;
try{
  MOTIFS = extractArray('MOTIFS');
  REGIONS = extractArray('REGIONS');
}catch(e){
  console.error('FAILED to parse arrays out of ' + path + ':', e.message);
  process.exit(1);
}

let failures = 0;
const seenIds = new Set();
const validChars = new Set(['.', '1', '2', '3']);

console.log('Validating ' + MOTIFS.length + ' motifs in ' + path + '\n');

for(const m of MOTIFS){
  const problems = [];

  if(seenIds.has(m.id)) problems.push('duplicate motif id');
  seenIds.add(m.id);

  if(!Array.isArray(m.rows) || m.rows.length === 0){
    problems.push('rows is not a non-empty array');
  } else {
    const n = m.rows.length;
    m.rows.forEach((row, idx) => {
      if(typeof row !== 'string'){
        problems.push('row ' + idx + ' is not a string');
        return;
      }
      if(row.length !== n){
        problems.push('row ' + idx + ' has length ' + row.length + ', expected ' + n + ' (rows.length)');
      }
      for(const ch of row){
        if(!validChars.has(ch)){
          problems.push('row ' + idx + ' contains invalid character ' + JSON.stringify(ch));
          break;
        }
      }
    });
  }

  const status = problems.length === 0 ? 'PASS' : 'FAIL';
  const size = Array.isArray(m.rows) ? m.rows.length : '?';
  console.log('  [' + status + '] ' + m.id.padEnd(28) + ' ' + size + 'x' + size + '  ' + m.name);
  if(problems.length){
    failures += problems.length;
    problems.forEach(p => console.log('         - ' + p));
  }
}

// cross-check region -> motif id references
console.log('\nCross-checking region motif references...');
const motifIds = new Set(MOTIFS.map(m => m.id));
let refProblems = 0;
for(const r of REGIONS){
  for(const mid of (r.motifs || [])){
    if(!motifIds.has(mid)){
      console.log('  [FAIL] region "' + r.id + '" references unknown motif id "' + mid + '"');
      refProblems++;
    }
  }
}
if(refProblems === 0) console.log('  [PASS] every region motif reference resolves to a defined motif');

const usedIds = new Set(REGIONS.flatMap(r => r.motifs || []));
const unused = [...motifIds].filter(id => !usedIds.has(id));
if(unused.length){
  console.log('\n  (info) motifs defined but not referenced by any region: ' + unused.join(', '));
}

console.log('\n' + (failures === 0 && refProblems === 0
  ? 'ALL CHECKS PASSED (' + MOTIFS.length + ' motifs, ' + REGIONS.length + ' regions)'
  : 'FAILED: ' + failures + ' grid problem(s), ' + refProblems + ' bad reference(s)'));

process.exit(failures === 0 && refProblems === 0 ? 0 : 1);
