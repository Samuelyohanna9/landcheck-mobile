const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const appConfigPath = path.join(rootDir, "app.config.ts");
const gradlePath = path.join(rootDir, "android", "app", "build.gradle");
const dryRun = process.argv.includes("--dry-run");

const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const writeText = (filePath, content) => fs.writeFileSync(filePath, content, "utf8");

const bumpPatchVersion = (version) => {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format "${version}". Expected x.y.z`);
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
};

const packageJson = JSON.parse(readText(packageJsonPath));
const appConfigSource = readText(appConfigPath);
const gradleSource = readText(gradlePath);

const packageVersion = String(packageJson.version || "").trim();
const appVersionMatch = appConfigSource.match(/version:\s*"([^"]+)"/);
const appVersionCodeMatch = appConfigSource.match(/versionCode:\s*(\d+)/);
const gradleVersionNameMatch = gradleSource.match(/versionName\s+"([^"]+)"/);
const gradleVersionCodeMatch = gradleSource.match(/versionCode\s+(\d+)/);

if (!appVersionMatch || !appVersionCodeMatch || !gradleVersionNameMatch || !gradleVersionCodeMatch) {
  throw new Error("Could not locate all version fields in app.config.ts and android/app/build.gradle");
}

const appVersion = appVersionMatch[1];
const appVersionCode = Number(appVersionCodeMatch[1]);
const gradleVersionName = gradleVersionNameMatch[1];
const gradleVersionCode = Number(gradleVersionCodeMatch[1]);

if (packageVersion !== appVersion || packageVersion !== gradleVersionName) {
  throw new Error(
    `Version mismatch detected. package.json=${packageVersion}, app.config.ts=${appVersion}, build.gradle=${gradleVersionName}`,
  );
}

if (appVersionCode !== gradleVersionCode) {
  throw new Error(`Version code mismatch detected. app.config.ts=${appVersionCode}, build.gradle=${gradleVersionCode}`);
}

const nextVersion = bumpPatchVersion(packageVersion);
const nextVersionCode = gradleVersionCode + 1;

const nextPackageJson = {
  ...packageJson,
  version: nextVersion,
};

const nextAppConfig = appConfigSource
  .replace(/version:\s*"[^"]+"/, `version: "${nextVersion}"`)
  .replace(/versionCode:\s*\d+/, `versionCode: ${nextVersionCode}`);

const nextGradle = gradleSource
  .replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${nextVersion}"`);

if (!dryRun) {
  writeText(packageJsonPath, `${JSON.stringify(nextPackageJson, null, 2)}\n`);
  writeText(appConfigPath, nextAppConfig);
  writeText(gradlePath, nextGradle);
}

console.log(
  JSON.stringify(
    {
      dryRun,
      from: {
        version: packageVersion,
        versionCode: gradleVersionCode,
      },
      to: {
        version: nextVersion,
        versionCode: nextVersionCode,
      },
    },
    null,
    2,
  ),
);
