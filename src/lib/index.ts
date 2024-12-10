import { lang, defaultLang } from '.lang';
import { createSubscriber } from 'svelte/reactivity';

export type Tranlations = (typeof lang)[typeof defaultLang];

export type AvailableLang = keyof typeof lang;

export const availableLangs = Object.keys(lang) as AvailableLang[];

export { defaultLang };

type TFunc = {
	<K extends keyof Tranlations>(
		key: K,
		params: undefined extends Parameters<Tranlations[K]>[0] ? never : Parameters<Tranlations[K]>[0]
	): ReturnType<Tranlations[K]>;
	<K extends keyof Tranlations>(
		key: undefined extends Parameters<Tranlations[K]>[0] ? K : never
	): ReturnType<Tranlations[K]>;
};

export class Lang {
	#lang: string = defaultLang;

	#tryLangs: [AvailableLang, ...AvailableLang[]] = [defaultLang];

	#langNotifiers = new Set<() => void>();

	#translationSubscriber = new Map<string, () => void>();

	#subscribeLang = createSubscriber((notify) => {
		this.#langNotifiers.add(notify);
		return () => {
			this.#langNotifiers.delete(notify);
		};
	});

	#translationProxy = this.#createProxy() as Tranlations;

	#resolveLang: (lang: string) => [AvailableLang, ...AvailableLang[]] = (str) => {
		if (str in lang) {
			return [str as any, defaultLang];
		}
		return [defaultLang];
	};

	#notifyLangChange() {
		this.#langNotifiers.forEach((notify) => notify());
	}

	get translations() {
		return this.#translationProxy;
	}

	get t() {
		return this.#translationProxy;
	}

	get lang() {
		this.#subscribeLang();
		return this.#lang;
	}

	get _(): TFunc {
		this.#subscribeLang();
		return this.#get;
	}

	set lang(lang: string) {
		if (this.#lang === lang) return;
		this.#lang = lang;
		this.#tryLangs = this.#resolveLang(lang);
		this.#notifyLangChange();
	}

	resolve(resolver: (lang: string) => [AvailableLang, ...AvailableLang[]]) {
		this.#resolveLang = resolver;
		this.#tryLangs = resolver(this.#lang);
		this.#notifyLangChange();
	}

	guess() {
		const lang = navigator.language;
		this.lang = lang;
	}

	changed(listener: (lang: string) => void) {
		const notify = () => listener(this.lang);
		this.#langNotifiers.add(notify);
		return () => this.#langNotifiers.delete(notify);
	}

	#get = function (this: Lang, key: string, params: any = {}) {
		return (this.translations as any)[key](params);
	}.bind(this);

	#createProxy(): any {
		const self = this;
		return new Proxy(
			{},
			{
				get(_, prop) {
					if (typeof prop !== 'string') return;
					let subs = self.#translationSubscriber.get(prop as string);
					if (!subs) {
						subs = createSubscriber((notify) => {
							self.#langNotifiers.add(notify);
							return () => {
								self.#langNotifiers.delete(notify);
							};
						});
						self.#translationSubscriber.set(prop, subs);
					}
					subs();
					for (const l of self.#tryLangs) {
						if (prop in lang[l]) {
							return (lang as any)[l][prop];
						}
					}
					return () => {
						throw new Error(`Translation for ${prop} not found in ${self.#tryLangs.join(', ')}`);
					};
				}
			}
		);
	}
}
