import { compile } from '@eslym/tinybars';
import type { BunPlugin } from 'bun';

const tinybars: BunPlugin = {
    name: 'tinybars',
    setup(build) {
        build.onLoad({ filter: /\.hbs$/ }, async ({ path }) => {
            const src = await Bun.file(path).text();
            const { code } = compile(src);
            return { contents: code, loader: 'js' };
        });
    }
};

await Bun.$`rm -rf dist`;

await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    minify: {
        syntax: true,
        identifiers: true
    },
    plugins: [tinybars]
});

await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'cjs',
    naming: 'index.cjs',
    minify: {
        syntax: true,
        identifiers: true
    },
    plugins: [tinybars]
});

await Bun.$`cp src/types.d.ts dist/index.d.ts`;
await Bun.$`cp -r src/runtime dist/runtime`;
