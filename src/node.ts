import http from "node:http";
import https, { AgentOptions } from "node:https";

import nodeFetch, { Headers as _Headers } from "node-fetch-native";

import { createFetch } from "./base";

export function createNodeFetch() {
    const useKeepAlive = JSON.parse(process.env.FETCH_KEEP_ALIVE || "false");
    if (!useKeepAlive) {
        return nodeFetch;
    }

    // https://github.com/node-fetch/node-fetch#custom-agent
    const agentOpts: AgentOptions = { keepAlive: true };
    const httpAgent = new http.Agent(agentOpts);
    const httpsAgent = new https.Agent(agentOpts);
    const nodeFetchOptions = {
        agent(parsedURL: any) {
            return parsedURL.protocol === "http:" ? httpAgent : httpsAgent;
        },
    };

    return function nodeFetchWithKeepAlive(
        input: RequestInfo,
        init?: RequestInit,
    ) {
        return (nodeFetch as any)(input, { ...nodeFetchOptions, ...init });
    };
}

export const fetch = globalThis.fetch || createNodeFetch();

export const Headers = globalThis.Headers || _Headers;

export const $fetch = createFetch({ fetch, Headers });

export * from "./base";
