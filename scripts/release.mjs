#!/usr/bin/env node
// Бампает версию пакета, коммитит package.json и создаёт git-тег
// "<пакет>-v<версия>", который запускает publish.yml.
//
// Использование: npm run release -- <пакет> <patch|minor|major|версия>
// Пример:        npm run release -- json-highlighters patch

import { execFileSync } from "node:child_process";

const [pkgName, bump] = process.argv.slice(2);
const allowedPackages = ["json-highlighters"];

if (!pkgName || !bump || !allowedPackages.includes(pkgName)) {
	console.error(`Использование: npm run release -- <${allowedPackages.join("|")}> <patch|minor|major|версия>`);
	process.exit(1);
}

const cwd = `packages/${pkgName}`;

const run = (command, args, options = {}) =>
	execFileSync(command, args, { stdio: "inherit", encoding: "utf-8", ...options });

const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" });
if (status.trim()) {
	console.error("Рабочая директория не чистая. Закоммить или отмени изменения перед релизом.");
	process.exit(1);
}

run("npm", ["version", bump, "--no-git-tag-version"], { cwd });

const version = JSON.parse(execFileSync("npm", ["pkg", "get", "version"], { cwd, encoding: "utf-8" }));
const tag = `${pkgName}-v${version}`;

run("git", ["add", `${cwd}/package.json`]);
run("git", ["commit", "-m", `chore(${pkgName}): release ${tag}`]);
run("git", ["tag", tag]);

console.log(`\nГотово: ${tag}`);
console.log("Запушить релиз:");
console.log(`  git push origin main ${tag}`);
