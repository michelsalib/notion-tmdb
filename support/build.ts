import { copyFile } from "copy-file";
import { globby } from "globby";

// time to copy into ./dist
console.log(`Building dist`);

const pathes = await globby([
  "backend/dist",
  "node_modules",
  "backend/package.json",
  "frontend/dist",
  "frontend/package.json",
  "package.json",
]);

console.log(`${pathes.length + 2} files to copy...`);

for (const path of pathes) {
  await copyFile(path, "dist/" + path);
}

await copyFile("backend/host.json", "dist/host.json");

try {
  await copyFile("backend/.env", "dist/.env");
} catch {
  console.warn(".env file not available");
}

console.log(`Copy done 🆗`);
