import { readFile, writeFile } from 'node:fs/promises';

const files = ['src/App.tsx', 'src/PhaseThree.tsx', 'src/PhaseFour.tsx'];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const fixed = source
    .replaceAll("as T))),[path]);", "as T)))),[path]);")
    .replaceAll("as T))),[path]);return items}", "as T)))),[path]);return items}");

  if (fixed !== source) {
    await writeFile(file, fixed, 'utf8');
    console.log(`Repaired Firestore listener syntax in ${file}`);
  } else {
    console.log(`No syntax repair needed in ${file}`);
  }
}