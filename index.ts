#!/usr/bin/env bun

import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import { parseArgs } from "util";
import { $ } from "bun";
import path from "path";

const gitignoreContent = `.DS_Store
**/.DS_Store
5.6/cache
5.6/cura.log
5.6/cura.log.*`;

function getOperatingSystem() {
  const platform = os.platform();
  switch (platform) {
    case "darwin":
      return "MacOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      throw new Error("Unknown OS");
  }
}

function getDefaultCuraDirectory() {
  const currentUser = os.userInfo().username;
  const osType = getOperatingSystem();

  let curaDirectory;
  switch (osType) {
    case "MacOS":
      curaDirectory = `/Users/${currentUser}/Library/Application Support/cura`;
      break;
    case "Windows":
      curaDirectory = `C:\\Users\\${currentUser}\\AppData\\Roaming\\cura`;
      break;
    case "Linux":
      curaDirectory = `/home/${currentUser}/.local/share/cura`;
      break;
    default:
      throw new Error("Unknown OS");
  }

  return curaDirectory;
}

function checkCuraDirectory() {
  const curaDirectory = getDefaultCuraDirectory();
  return fs.existsSync(curaDirectory);
}

if (!checkCuraDirectory()) {
  throw new Error(
    "curasync did not find a cura directory. Try running cura and try again?"
  );
}

const curaDirectory = getDefaultCuraDirectory();

function checkGitInstallation() {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

if (!checkGitInstallation()) {
  throw new Error(
    "Git is not installed on this system. Please install Git and try again."
  );
}

function checkCuraVersionDirectory() {
  const curaVersionDirectory = `${curaDirectory}/5.6`;
  return fs.existsSync(curaVersionDirectory);
}

if (!checkCuraVersionDirectory()) {
  throw new Error(
    "curasync did not find a cura/5.6 directory. curasync only supports 5.6 (you may need to upgrade curasync)"
  );
}

function checkGitInitialization() {
  try {
    execSync("git status", { cwd: curaDirectory, stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

const isGitInitialized = checkGitInitialization();

// print some info

function printInfo() {
  console.log(`curasync (v0) — lunaroyster
    OS: ${getOperatingSystem()}
    Cura Directory: ${curaDirectory}
    isInitialized?: ${isGitInitialized}`);
}

function printHelp() {
  console.log(`curasync
\thelp\tprint help screen
\tinit\tinitialize curasync in your cura folder
\tpull\tgrab changes from remote
\tpush\tpush local changes to remote`);
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

async function ask(
  q: string,
  defaultAnswer?: "y" | "n" | undefined
): Promise<"y" | "n" | null> {
  const qPrompts = {
    y: "(Y/n)",
    n: "(y/N)",
  };
  process.stdout.write(`${q} ${qPrompts[defaultAnswer] ?? "(y/n)"} `);
  for await (const line of console) {
    const l = line.trim().toLowerCase();
    if (l === "y" || l === "n") {
      return l;
    }
    if (l === "") {
      return defaultAnswer ?? null;
    }
    console.log(`${q} ${qPrompts[defaultAnswer] ?? "(y/n)"}`);
  }
  throw new Error("unreachable code");
}

async function initializeRepo() {
  const res = await ask(
    "This command will turn your cura configuration folder into a git repo and push it into a blank repository. Use this if you want to share your config with others. Proceed?",
    "n"
  );

  if (res !== "y") {
    process.exit(1);
  }

  await confirmAndKillCura();

  console.log("Enter a git repo origin");
  let url;
  for await (const line of console) {
    if (!isValidUrl(line)) {
      console.error("Invalid URL. Please enter a valid URL.");
      continue;
    }
    url = line;
  }

  // create repo
  execSync("git init", { cwd: curaDirectory });

  // add origin
  execSync(`git remote add origin ${url}`, { cwd: curaDirectory });

  // create init commit
  execSync(`git add .`, { cwd: curaDirectory });
  execSync(`git commit -m "[curasync] init"`, { cwd: curaDirectory });

  // push
  execSync(`git push -u origin main"`, { cwd: curaDirectory });

  fs.writeFileSync(path.join(curaDirectory, ".gitignore"), gitignoreContent);
}

async function getCuraPid() {
  // there is also a CuraEngine process started by UltiMaker-Cura but it's a child process
  const res = await $`pgrep UltiMaker-Cura`.quiet();
  if (
    res.exitCode === 1 &&
    res.stderr.length === 0 &&
    res.stdout.length === 0
  ) {
    return null;
  } else if (res.exitCode === 0) {
    const num = Number(res.stdout.toString().trim());

    if (isNaN(num)) {
      throw new Error("No process number returned");
    }

    return num;
  } else {
    console.log(res);
    throw new Error("pgrep Cura returned something weird");
  }
}

async function killProcess(pid: number) {
  const res = await $`kill ${pid}`;

  if (res.exitCode !== 0) {
    throw res.stderr;
  }
}

async function confirmAndKillCura() {
  const curaPid = await getCuraPid();

  if (curaPid === null) {
    return;
  }

  const res = await ask(
    "Cura is running. To proceed safely, you need to exit out of cura. Kill cura?",
    "y"
  );

  if (res !== "y") {
    process.exit(1);
  }

  await killProcess(curaPid);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv,
    strict: true,
    allowPositionals: true,
  });

  if (positionals.length === 2) {
    printInfo();
    printHelp();
    process.exit(0);
  }

  if (positionals[2] === "help") {
    printHelp();
    process.exit(0);
  }

  if (positionals[2] === "init") {
    if (isGitInitialized) {
      console.error("looks like the cura folder is already initialized");
      process.exit(1);
    }

    await initializeRepo();

    process.exit(0);
  }

  if (positionals[2] === "clone") {
    const url = positionals[3];

    if (!url) {
      console.error("No URL provided for clone operation");
      process.exit(1);
    }

    if (!isValidUrl(url)) {
      console.error("Invalid URL provided for clone operation");
      process.exit(1);
    }

    const askRes = await ask(
      "This will clone the configuration from a given, existing repo into your cura directory. (Your current configuration will be backed up). Proceed?",
      "n"
    );

    if (askRes !== "y") {
      process.exit(1);
    }

    console.log("Backing up your current cura configuration...");
    const curaDirectory = getDefaultCuraDirectory();
    const backupDirectory = path.join(
      curaDirectory,
      "../cura_backup_" + Date.now()
    );
    execSync(`cp -r ${curaDirectory} ${backupDirectory}`);
    console.log("Cura folder has been backed up successfully.");

    console.log("Clearing out the cura folder...");
    execSync(`rm -rf ${curaDirectory}/*`);
    console.log("Cura folder has been cleared.");

    console.log(`Cloning from ${url}...`);
    execSync(`git clone ${url} .`, { cwd: curaDirectory });
    console.log("Clone operation completed successfully. Try opening cura");

    process.exit(0);
  }

  if (positionals[2] === "pull") {
    console.log("pulling config from origin...");
    execSync(`git pull`, { cwd: curaDirectory, stdio: "inherit" });
    console.log("pulled config from origin!");

    process.exit(0);
  }

  if (positionals[2] === "push") {
    console.log("pushing config to origin");
    execSync(`git push`, { cwd: curaDirectory, stdio: "inherit" });
    console.log("pushed config to origin!");

    process.exit(0);
  }

  console.error(`unrecognized command ${positionals[2]}`);
  printHelp();
  process.exit(1);
}

main();
