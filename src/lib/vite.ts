import type { Plugin } from 'vite';
import { glob, CommentJSON } from './lib.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { parseTemplate, compileTemplate } from './template.js';
import { dirname, join, relative } from 'path';

export type Options = {
	defaultLang: string;
	langDir?: string;
	outFile?: string;
};

const defaultSrcDir = './lang';
const defaultOutFile = './.svelte-kit/lang.ts';

function* travelJson(
	jsonFile: string,
	object: any,
	path: string = '$'
): Generator<[key: string, code: string]> {
	if (typeof object === 'string') {
		try {
			const res = compileTemplate(parseTemplate(object));
			const args = res.vars.length
				? `params: {${res.vars.map((v) => `${v}: string`).join(', ')}}`
				: '';
			yield [path, `(${args}) => ${res.code} as const`];
		} catch (e: any) {
			console.warn(e.message);
			const err = JSON.stringify(`Error in ${jsonFile}(${path}): ${e.message}`);
			yield [path, `() => { throw new Error(${err}) }`];
		}
		return;
	}
	if (typeof object === 'object') {
		if (Array.isArray(object)) {
			for (const [i, item] of object.entries()) {
				yield* travelJson(jsonFile, item, `${path}.${i}`);
			}
			return;
		}
		for (const [key, value] of Object.entries(object)) {
			yield* travelJson(jsonFile, value, `${path}.${key}`);
		}
		return;
	}
	const err = JSON.stringify(`Error in ${jsonFile}(${path}): Invalid type`);
	yield [path, `() => { throw new Error(${err}) }`];
}

async function compileLang(rootDir: string, srcDir: string, outFile: string, defaultLang: string) {
	const files = await glob(`*.json`, { cwd: srcDir, absolute: false });
	const lang: Record<string, Record<string, string>> = {};
	await Promise.all(
		files.map(async (file) => {
			const jsonFile = `${srcDir}/${file}`;
			const json = CommentJSON.parse(await readFile(jsonFile, 'utf8'));
			const name = file.replace(/\.json$/, '');
			lang[name] = Object.fromEntries(
				[...travelJson(jsonFile, json, '$')].map((pair) => {
					return [pair[0].replace('$.', ''), pair[1]];
				})
			);
		})
	);
	let code = 'export const lang = {\n';
	for (const [name, langs] of Object.entries(lang)) {
		code += `  ${JSON.stringify(name)}: {\n`;
		for (const [lang, fn] of Object.entries(langs)) {
			code += `    ${JSON.stringify(lang)}: ${fn},\n`;
		}
		code += '  },\n';
	}
	code += '};\n';
	code += `export const defaultLang = ${JSON.stringify(defaultLang)} as const satisfies keyof typeof lang;\n`;
	const dir = dirname(outFile);
	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}
	await writeFile(outFile, code);
	const virtualPackage = join(rootDir, './node_modules/.lang');
	if (!existsSync(virtualPackage)) {
		await mkdir(virtualPackage, { recursive: true });
	}
	let relPath = relative(virtualPackage, outFile).replace(/\.ts$/, '');
	if (!relPath.match(/^\.+[\/\\]/)) {
		relPath = './' + relPath;
	}
	await writeFile(join(virtualPackage, 'index.js'), `export * from ${JSON.stringify(relPath)};`);
	await writeFile(
		join(virtualPackage, 'index.d.ts'),
		`export * from ${JSON.stringify(relPath + '.ts')};`
	);
	await writeFile(
		join(virtualPackage, 'package.json'),
		JSON.stringify({ name: '.lang', type: 'module', main: 'index.js', types: 'index.d.ts' })
	);
}

function debounce(func: () => void, wait: number) {
	let timeout: NodeJS.Timeout;
	return () => {
		clearTimeout(timeout);
		timeout = setTimeout(func, wait);
	};
}

export default function sveltekitLang(opts: Options): Plugin {
	return {
		name: 'sveltekit-lang',
		configureServer(server) {
			const root = server.config.root ?? process.cwd();
			const langDir = join(root, opts.langDir ?? defaultSrcDir);
			const outFile = join(root, opts.outFile ?? defaultOutFile);
			const debounced = debounce(() => compileLang(root, langDir, outFile, opts.defaultLang), 100);
			const onChange = (file: string) => {
				if (file.startsWith(langDir)) {
					debounced();
				}
			};
			server.watcher.add(langDir);
			server.watcher.on('change', onChange);
			server.watcher.on('add', onChange);
			server.watcher.on('unlink', onChange);
		},
		async config(cfg) {
			const root = cfg.root ?? process.cwd();
			const langDir = join(root, opts.langDir ?? defaultSrcDir);
			const outFile = join(root, opts.outFile ?? defaultOutFile);
			await compileLang(root, langDir, outFile, opts.defaultLang);
			return {
				resolve: {
					alias: {
						'.lang': outFile
					}
				}
			};
		}
	};
}
