import "@testing-library/jest-dom";

// jsdom lacks TextEncoder/TextDecoder/ReadableStream/MessagePort which undici
// needs at import time. Pull them from Node built-ins before importing undici.
import { TextEncoder, TextDecoder } from "node:util";
import { ReadableStream, TransformStream, WritableStream } from "node:stream/web";
import { MessagePort, MessageChannel } from "node:worker_threads";
import { Blob } from "node:buffer";

const nodePolyfills: Array<[string, unknown]> = [
  ["TextEncoder", TextEncoder],
  ["TextDecoder", TextDecoder],
  ["ReadableStream", ReadableStream],
  ["TransformStream", TransformStream],
  ["WritableStream", WritableStream],
  ["MessagePort", MessagePort],
  ["MessageChannel", MessageChannel],
  ["Blob", Blob],
];
for (const [name, value] of nodePolyfills) {
  if (typeof (globalThis as Record<string, unknown>)[name] === "undefined") {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const undici = require("undici") as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};
const undiciFetch = undici.fetch;
const UndiciHeaders = undici.Headers;
const UndiciRequest = undici.Request;
const UndiciResponse = undici.Response;

// jest-environment-jsdom does not ship fetch/Response/Request/Headers on its
// window. Bridge undici's web-standard implementations onto globalThis so
// tests can construct Response objects and spy on fetch.
const webGlobals: Array<[string, unknown]> = [
  ["fetch", undiciFetch],
  ["Headers", UndiciHeaders],
  ["Request", UndiciRequest],
  ["Response", UndiciResponse],
];
for (const [name, value] of webGlobals) {
  if (typeof (globalThis as Record<string, unknown>)[name] === "undefined") {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  }
}
