import destr from 'destr'
import { withBase, withQuery } from 'ufo'
import type { Fetch, RequestInfo, RequestInit, Response } from './types'
import { createFetchError } from './error'
import { isPayloadMethod, isJSONSerializable, detectResponseType, ResponseType, MappedType } from './utils'

export interface CreateFetchOptions {
  fetch: Fetch
  Headers: typeof Headers
}

export type FetchRequest = RequestInfo
export interface FetchResponse<T> extends Response { data?: T }
export interface SearchParams { [key: string]: any }

export interface FetchContext<T = any, R extends ResponseType = ResponseType> {
  request: FetchRequest
  // eslint-disable-next-line no-use-before-define
  options: FetchOptions<R>,
  response?: FetchResponse<T>
  error?: Error
}

export interface FetchOptions<R extends ResponseType = ResponseType> extends Omit<RequestInit, 'body'> {
  baseURL?: string
  body?: RequestInit['body'] | Record<string, any>
  params?: SearchParams
  parseResponse?: (responseText: string) => any
  responseType?: R
  response?: boolean
  retry?: number | false

  onRequest?(ctx: FetchContext): Promise<void>
  onResponse?(ctx: FetchContext): Promise<void>
  onError?(ctx: FetchContext): Promise<void>
}

export interface $Fetch {
  <T = any, R extends ResponseType = 'json'>(request: FetchRequest, opts?: FetchOptions<R>): Promise<MappedType<R, T>>
  raw<T = any, R extends ResponseType = 'json'>(request: FetchRequest, opts?: FetchOptions<R>): Promise<FetchResponse<MappedType<R, T>>>
}

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
const retryStatusCodes = new Set([
  408, // Request Timeout
  409, // Conflict
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504 //  Gateway Timeout
])

export function createFetch ({ fetch, Headers }: CreateFetchOptions): $Fetch {
  async function onError (ctx: FetchContext): Promise<FetchResponse<any>> {
    // Use user-defined handler
    if (ctx.options.onError) {
      await ctx.options.onError(ctx)
    }

    // Retry
    if (ctx.options.retry !== false) {
      const retries = typeof ctx.options.retry === 'number'
        ? ctx.options.retry
        : (isPayloadMethod(ctx.options.method) ? 0 : 1)

      const responseCode = (ctx.response && ctx.response.status) || 500
      if (retries > 0 && retryStatusCodes.has(responseCode)) {
        return $fetchRaw(ctx.request, {
          ...ctx.options,
          retry: retries - 1
        })
      }
    }

    // Throw normalized error
    const err = createFetchError(ctx.request, ctx.error, ctx.response)

    // Only available on V8 based runtimes (https://v8.dev/docs/stack-trace-api)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, $fetchRaw)
    }
    throw err
  }

  const $fetchRaw: $Fetch['raw'] = async function $fetchRaw (_request, _opts = {}) {
    const ctx: FetchContext = {
      request: _request,
      options: _opts,
      response: undefined,
      error: undefined
    }

    if (ctx.options.onRequest) {
      await ctx.options.onRequest(ctx)
    }

    if (typeof ctx.request === 'string') {
      if (ctx.options.baseURL) {
        ctx.request = withBase(ctx.request, ctx.options.baseURL)
      }
      if (ctx.options.params) {
        ctx.request = withQuery(ctx.request, ctx.options.params)
      }
      if (ctx.options.body && isPayloadMethod(ctx.options.method)) {
        if (isJSONSerializable(ctx.options.body)) {
          ctx.options.body = JSON.stringify(ctx.options.body)
          ctx.options.headers = new Headers(ctx.options.headers)
          if (!ctx.options.headers.has('content-type')) {
            ctx.options.headers.set('content-type', 'application/json')
          }
          if (!ctx.options.headers.has('accept')) {
            ctx.options.headers.set('accept', 'application/json')
          }
        }
      }
    }

    ctx.response = await fetch(ctx.request, ctx.options as RequestInit).catch((error) => {
      ctx.error = error
      return onError(ctx)
    })

    const responseType =
      (ctx.options.parseResponse ? 'json' : ctx.options.responseType) ||
      detectResponseType(ctx.response.headers.get('content-type') || '')

    // We override the `.json()` method to parse the body more securely with `destr`
    if (responseType === 'json') {
      const data = await ctx.response.text()
      const parseFn = ctx.options.parseResponse || destr
      ctx.response.data = parseFn(data)
    } else {
      ctx.response.data = await ctx.response[responseType]()
    }

    if (ctx.options.onResponse) {
      await ctx.options.onResponse(ctx)
    }

    if (!ctx.response.ok || ctx.error) {
      await onError(ctx)
    }

    return ctx.response.ok ? ctx.response : onError(ctx)
  }

  const $fetch = function $fetch (request, opts) {
    return $fetchRaw(request, opts).then(r => r.data)
  } as $Fetch

  $fetch.raw = $fetchRaw

  return $fetch
}
