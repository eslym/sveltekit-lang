export function* concat(...args: Iterable<string>[]) {
    for (const a of args) {
        yield* a;
    }
}

function* indent(iter: Iterable<string>) {
    for (const s of iter) {
        for (const c of s) {
            yield c;
            if (c === '\n') {
                yield* '  ';
            }
        }
    }
}

const ESCAPES = {
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\\': '\\\\',
    '`': '\\`',
    $: '\\$'
} as Record<string, string>;

const RAW = Symbol('raw');

export namespace T {
    export function* map<T, U>(iter: Iterable<T>, fn: (t: T) => U): Iterable<U> {
        for (const t of iter) {
            yield fn(t);
        }
    }

    export function* flat<T>(iter: Iterable<Iterable<T>>): Iterable<T> {
        for (const i of iter) {
            yield* i;
        }
    }

    export function* obj(
        pairs: Iterable<[Iterable<string> | { [RAW]: Iterable<string> }, Iterable<string>]>,
        replace: Record<string, Iterable<string>> = {}
    ) {
        yield* '{\n  ';
        yield* join(
            map(pairs, ([name, value]) => {
                if (typeof name === 'object' && RAW in name) {
                    return concat(name[RAW], ': ', indent(value));
                }
                const key = str(name);
                return concat(replace[key] ?? key, ': ', indent(value));
            }),
            ',\n  '
        );
        yield* '\n}';
    }

    export function* indent(iter: Iterable<string>, level: number = 1) {
        for (const s of iter) {
            for (const c of s) {
                yield c;
                if (c === '\n') {
                    yield* '  '.repeat(level);
                }
            }
        }
    }

    export function lf(lines: Iterable<Iterable<string>>) {
        return join(lines, '\n');
    }

    export function str(iter: Iterable<string>) {
        let result = '';
        for (const s of iter) {
            result += s;
        }
        return result;
    }

    export function raw(strings: TemplateStringsArray, ...args: Iterable<string>[]) {
        return { [RAW]: code(strings, ...args) };
    }

    export function* join(iter: Iterable<Iterable<string>>, sep: Iterable<string>) {
        let last: Iterable<string> | undefined = undefined;
        for (const s of iter) {
            if (last !== undefined) {
                yield* last;
                yield* sep;
                last = s;
                continue;
            }
            last = s;
        }
        if (last !== undefined) {
            yield* last;
        }
    }

    export function* code(strings: TemplateStringsArray, ...args: Iterable<string>[]) {
        for (let i = 0; i < args.length; i++) {
            yield* strings[i];
            yield* args[i];
        }
        yield* strings[strings.length - 1];
    }

    export function fn(arr: TemplateStringsArray, ...args: any[]) {
        const fn = str(code(arr, ...args));
        return function* (...args: (string | Iterable<string>)[]) {
            yield* fn;
            yield* '(';
            yield* join(args, ', ');
            yield* ')';
        };
    }

    export function* tl(arr: TemplateStringsArray, ...args: Iterable<string>[]) {
        yield '`';
        for (let i = 0; i < args.length; i++) {
            for (const c of arr[i]) {
                if (ESCAPES[c]) {
                    yield* ESCAPES[c];
                } else {
                    yield c;
                }
            }
            yield* '${ ';
            yield* args[i];
            yield* ' }';
        }
        for (const c of arr[arr.length - 1]) {
            if (ESCAPES[c]) {
                yield* ESCAPES[c];
            } else {
                yield c;
            }
        }
        yield '`';
    }

    export function* stringify(
        value: any,
        replace: Record<string, Iterable<string>> = {}
    ): Iterable<string> {
        if (typeof value === null) {
            yield* 'null';
            return;
        }
        if (typeof value === 'object' && value[RAW]) {
            yield* value[RAW];
            return;
        }
        if (Array.isArray(value)) {
            yield* '[\n  ';
            yield* join(
                map(value, (v) => stringify(v, replace)),
                ', '
            );
            yield* '\n]';
            return;
        }
        switch (typeof value) {
            case 'string':
                yield* JSON.stringify(value);
                return;
            case 'object':
                yield* obj(
                    Object.entries(value).map(([key, value]) => [stringify(key), stringify(value, replace)]),
                    replace
                );
                return;
            default:
                yield* String(value);
        }
    }
}
