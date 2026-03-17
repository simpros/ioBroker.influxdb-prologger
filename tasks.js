const { copyFileSync, existsSync, mkdirSync } = require('node:fs');
const { deleteFoldersRecursive, npmInstall, buildReact, copyFiles, patchHtmlFile } = require('@iobroker/build-tools');

const srcAdmin = `${__dirname}/src-admin`;
const admin = `${__dirname}/admin`;

function cleanAdmin() {
	// keep the adapter icon
	deleteFoldersRecursive(admin, ['influxdb-prologger.png']);
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
	if (args.includes('--1-npm')) {
		await npmInstall(srcAdmin);
		return;
	}
	if (args.includes('--3-build')) {
		await buildReact(srcAdmin, { rootDir: srcAdmin, vite: true });
		return;
	}
	if (args.includes('--4-copy')) {
		await copyAllFiles();
		return;
	}

	// Default: full build
	cleanAdmin();
	deleteFoldersRecursive(`${srcAdmin}/build`);
	await npmInstall(srcAdmin);
	await buildReact(srcAdmin, { rootDir: srcAdmin, vite: true });
	await copyAllFiles();
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
