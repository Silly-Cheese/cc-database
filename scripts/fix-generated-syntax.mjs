import { readFile, writeFile } from 'node:fs/promises';

const files = ['src/App.tsx', 'src/PhaseThree.tsx', 'src/PhaseFour.tsx'];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const fixed = source.replace(
    /Boolean\(([^\n;]*?permissions\?\.includes\(p\))\);/g,
    'Boolean($1));',
  );

  if (fixed !== source) {
    await writeFile(file, fixed, 'utf8');
    console.log(`Fixed generated syntax in ${file}`);
  }
}
