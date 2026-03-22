const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { execFileSync } = require('node:child_process');
const { deleteFoldersRecursive, copyFiles, patchHtmlFile } = require('@iobroker/build-tools');

const srcAdmin = `${__dirname}/src-admin`;
const admin = `${__dirname}/admin`;

function cleanAdmin() {
	// keep the adapter icon
	deleteFoldersRecursive(admin, ['influxdb-prologger.png']);
}

function buildVite() {
	const viteBin = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
	console.log(`[${new Date().toISOString()}] Building admin UI with Vite...`);
	execFileSync(process.execPath, [viteBin, 'build'], {
		cwd: srcAdmin,
		stdio: 'inherit',
	});
	console.log(`[${new Date().toISOString()}] Admin UI build complete.`);
}

async function copyAllFiles() {
	if (!existsSync(admin)) {
		mkdirSync(admin, { recursive: true });
	}
	copyFiles([`${srcAdmin}/build/**/*`, `!${srcAdmin}/build/index.html`], 'admin/');
	copyFileSync(`${srcAdmin}/build/index.html`, `${admin}/index_m.html`);
	await patchHtmlFile(`${admin}/index_m.html`);
}

async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--0-clean')) {
		cleanAdmin();
		return;
	}
	if (args.includes('--3-build')) {
		buildVite();
		return;
	}
	if (args.includes('--4-copy')) {
		await copyAllFiles();
		return;
	}

	// Default: full build
	cleanAdmin();
	deleteFoldersRecursive(`${srcAdmin}/build`);
	buildVite();
	await copyAllFiles();
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
