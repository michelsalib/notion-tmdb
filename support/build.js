import { copyFile } from 'copy-file';
import { globby } from 'globby';

console.log(`Building dist`);

const pathes = await globby([
    'backend/dist',
    'node_modules',
    'backend/package.json',
    'frontend/dist',
    'frontend/package.json',
    'frontend/legal.md',
    'package.json'
]);

console.log(`${pathes.length + 2} files to copy...`);

for (const path of pathes) {
    await copyFile(path, 'dist/' + path);
}

await copyFile('backend/host.json', 'dist/host.json');
await copyFile('backend/.env', 'dist/.env');

console.log(`Copy done 🆗`);

