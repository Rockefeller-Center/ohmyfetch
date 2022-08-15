import { createFetch } from "./base";

export * from "./base";

export const fetch =
    globalThis.fetch ||
    (() =>
        Promise.reject(
            new Error("[ohmyfetch] global.fetch is not supported!"),
        ));

export const Headers = globalThis.Headers;

export const $fetch = createFetch({ fetch, Headers });
