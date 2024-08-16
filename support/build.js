import { copyFile } from 'copy-file';
import { globby } from 'globby';
import { execSync } from 'node:child_process';

console.log('Listing backend deps');

// get backend deps from NPM
const { dependencies: { backend: { dependencies: backendDependencies } } } = JSON.parse(execSync('npm list -a --json', {
    encoding: 'utf-8'
}));

// recurse deps
function getSubDependencies(deps) {
    const currentLevel = Object.keys(deps);
    const lowerLevels = Object.values(deps).filter(dep => dep.dependencies).flatMap(dep => getSubDependencies(dep.dependencies));

    return lowerLevels.reduce((res, cur) => {
        if (!res.includes(cur)) {
            res.push(cur);
        }

        return res;
    }, currentLevel);
}
const flatDependencies = getSubDependencies(backendDependencies);

// time to copy into ./dist
console.log(`Building dist`);

const pathes = await globby([
    'backend/dist',
    ...flatDependencies.map(f => `node_modules/${f}/**/*.{js,json}`),
    'backend/package.json',
    'frontend/dist',
    'frontend/package.json',
    'package.json'
]);

console.log(`${pathes.length + 2} files to copy...`);

for (const path of pathes) {
    await copyFile(path, 'dist/' + path);
}

await copyFile('backend/host.json', 'dist/host.json');
await copyFile('backend/.env', 'dist/.env');

console.log(`Copy done 🆗`);

