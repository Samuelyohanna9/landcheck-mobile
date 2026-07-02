const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const androidDir = path.join(projectRoot, "android");
const gradleWrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const requestedTasks = process.argv.slice(2);
const gradleTasks = requestedTasks.length ? requestedTasks : ["assembleRelease"];

const staleBuildDirs = [
  path.join(androidDir, "build"),
  path.join(androidDir, "app", "build"),
  path.join(projectRoot, "node_modules", "expo", "android", "build"),
  path.join(projectRoot, "node_modules", "expo-constants", "android", "build"),
  path.join(projectRoot, "node_modules", "expo-log-box", "android", "build"),
  path.join(projectRoot, "node_modules", "expo-modules-core", "android", "build"),
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd: androidDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });
  if (options.allowFailure) {
    return result.status ?? 0;
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 0;
}

function removeDirWithRetry(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return;
  }
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      log(`Retrying cleanup for ${targetDir} (${attempt}/5)`);
      sleep(attempt * 400);
    }
  }
}

log("Stopping existing Gradle daemons...");
run(gradleWrapper, ["--stop"], { allowFailure: true });
sleep(3000);

log("Clearing stale Android build folders...");
for (const buildDir of staleBuildDirs) {
  removeDirWithRetry(buildDir);
}

log(`Running Gradle release tasks: ${gradleTasks.join(" ")}`);
run(gradleWrapper, ["--no-daemon", "--max-workers=2", ...gradleTasks]);
