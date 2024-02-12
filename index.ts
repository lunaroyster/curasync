#!/usr/bin/env bun

import fs from "fs";
import os from "os";
import { execFileSync } from "child_process";
import { parseArgs } from "util";
import { $, sleep } from "bun";
import path from "path";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
    execFileSync("git", ["--version"], { stdio: "ignore" });
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
    execFileSync("git", ["status"], { cwd: curaDirectory, stdio: "ignore" });
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
\tinit <repo_url>\tinitialize curasync in your cura folder and push to <repo_url>
\tclone <repo_url>\tclone a curasync remote into your cura directory
\tpull\tgrab changes from remote
\tpush\tpush local changes to remote
\tcwd\tprint the cura directory`);
}

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

async function confirm(
  q: string,
  defaultAnswer?: "y" | "n" | undefined
): Promise<"y" | "n" | null> {
  const qPrompts = {
    y: "(Y/n)",
    n: "(y/N)",
  };
  while (true) {
    const line: string = await new Promise((resolve) =>
      rl.question(
        `${q} ${defaultAnswer ? qPrompts[defaultAnswer] : "(y/n)"} `,
        (r) => resolve(r)
      )
    );
    const l = line.trim().toLowerCase();
    if (l === "y" || l === "n") {
      return l;
    }
    if (l === "") {
      return defaultAnswer ?? null;
    }
  }
  throw new Error("unreachable code");
}

async function ask(q: string, defaultAnswer?: string): Promise<string> {
  while (true) {
    const line: string = await new Promise((resolve) =>
      rl.question(`${q}${defaultAnswer ? ` (${defaultAnswer})` : ""} `, (r) =>
        resolve(r)
      )
    );
    if (line === "" && !defaultAnswer) {
      continue;
    } else if (line === "" && defaultAnswer) {
      return defaultAnswer;
    }

    return line;
  }

  throw new Error("unreachable");
}

async function initializeRepo(url: string) {
  const killRes = await confirmAndKillCura();

  if (!killRes) {
    throw new Error("Exiting: cura is still running");
  }

  if (isGitInitialized) {
    execFileSync("rm", ["-rf", ".git"], { cwd: curaDirectory });
  }

  // create repo
  execFileSync("git", ["init"], { cwd: curaDirectory });

  // add origin
  execFileSync("git", ["remote", "add", "origin", url], { cwd: curaDirectory });

  // create init commit
  execFileSync("git", ["add", "."], { cwd: curaDirectory });
  execFileSync("git", ["commit", "-m", "[curasync] init"], {
    cwd: curaDirectory,
  });

  // push
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: curaDirectory });

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

async function confirmAndKillCura(): Promise<boolean> {
  const curaPid = await getCuraPid();

  if (curaPid === null) {
    return true;
  }

  const res = await confirm(
    "Cura is running. To proceed safely, you need to exit out of cura. Kill cura?",
    "y"
  );

  if (res !== "y") {
    return false;
  }

  await killProcess(curaPid);
  return true;
}

async function printDiff() {
  const diffRes = execFileSync("git", ["diff", "--staged", "--stat"], {
    env: { GIT_PAGER: "cat" },
    cwd: curaDirectory,
    stdio: "pipe",
  });

  const diffOutput = diffRes.toString().trim();

  console.log(diffOutput);
}

async function isCuraDirty() {
  return (
    (await $`git -C ${curaDirectory} diff-index --exit-code HEAD > /dev/null`)
      .exitCode === 1
  );
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
    const res = await confirm(
      "This command will turn your cura configuration folder into a git repo and push it into a blank repository. Use this if you want to share your config with others. Proceed?",
      "n"
    );

    if (res !== "y") {
      process.exit(1);
    }

    if (isGitInitialized) {
      const alreadyInitAsk = await confirm(
        "Looks like the cura folder is already initialized as a repo. Do you want to go ahead anyway? This will overwrite the repo",
        "n"
      );

      if (alreadyInitAsk !== "y") {
        process.exit(1);
      }
    }

    const url = positionals[3];

    if (!isValidUrl(url)) {
      console.error("Invalid URL. Please enter a valid URL.");
      process.exit(1);
    }

    await initializeRepo(url);

    process.exit(0);
  }

  if (positionals[2] === "clone") {
    const url = positionals[3];

    if (!url) {
      console.error("No URL provided. Invocation: `curasync clone [repo url]`");
      process.exit(1);
    }

    if (!isValidUrl(url)) {
      console.error(`Invalid URL provided for clone operation: ${url}`);
      process.exit(1);
    }

    const askRes = await confirm(
      "This will clone the configuration from a given, existing repo into your cura directory. (Your current configuration will be backed up). Proceed?",
      "n"
    );

    if (askRes !== "y") {
      process.exit(1);
    }

    const killRes = await confirmAndKillCura();

    if (!killRes) {
      throw new Error("Exiting: cura is still running");
    }

    console.log("Backing up your current cura configuration...");
    const curaDirectory = getDefaultCuraDirectory();
    const backupDirectory = path.join(
      curaDirectory,
      "../cura_backup_" + Date.now()
    );
    execFileSync("mv", [curaDirectory, backupDirectory]);
    execFileSync("mkdir", [curaDirectory]);
    console.log("Cura folder has been backed up successfully.");

    console.log(`Cloning from ${url}...`);
    execFileSync(`git`, ["clone", url, `.`], { cwd: curaDirectory });
    console.log("Clone operation completed successfully. Try opening cura");

    process.exit(0);
  }

  if (positionals[2] === "pull") {
    console.log("pulling config from origin...");
    execFileSync("git", ["pull"], { cwd: curaDirectory, stdio: "inherit" });
    console.log("pulled config from origin!");

    process.exit(0);
  }

  if (positionals[2] === "push") {
    const curaPid = await getCuraPid();

    if (curaPid) {
      const quitCura = await confirm(
        "Cura is currently running. Cura often saves configuration on exit. Would you like to quit Cura?",
        "y"
      );

      if (quitCura === "y") {
        await killProcess(curaPid);
        await sleep(1000);
      }
    }

    const isDirty = await isCuraDirty();

    if (!isDirty) {
      console.error("Looks like there are no changes to push");
      process.exit(1);
    }

    console.log("pushing config to origin");

    execFileSync("git", ["add", "."], { cwd: curaDirectory, stdio: "inherit" });

    await printDiff();

    const commitMessage = await ask(
      "Enter a message describing what you changed:"
    );

    execFileSync("git", ["commit", "-m", `[curasync] ${commitMessage}`], {
      cwd: curaDirectory,
      stdio: "inherit",
    });

    execFileSync("git", ["push"], { cwd: curaDirectory, stdio: "inherit" });
    console.log("pushed config to origin!");

    process.exit(0);
  }

  if (positionals[2] === "cwd") {
    console.log(curaDirectory);

    process.exit(0);
  }

  console.error(`unrecognized command ${positionals[2]}`);
  printHelp();
  process.exit(1);
}

main();
