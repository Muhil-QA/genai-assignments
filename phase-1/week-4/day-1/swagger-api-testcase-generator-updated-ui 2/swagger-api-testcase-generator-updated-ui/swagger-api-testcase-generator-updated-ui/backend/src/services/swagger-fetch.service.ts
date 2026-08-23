import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../config/environment.js";
import { AppError } from "../utils/errors.js";

const MAX_REDIRECTS = 3;

function isPrivateIp(address: string): boolean {
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  const octets = address.split(".").map(Number);
  return octets.length === 4 && (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254) ||
    octets[0] === 0
  );
}

async function assertSafeUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "INVALID_URL", "Enter a valid specification URL.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new AppError(400, "UNSUPPORTED_URL", "Only HTTP or HTTPS URLs without credentials or custom ports are supported.");
  }
  if (!url.hostname) throw new AppError(400, "INVALID_URL", "The specification URL must include a hostname.");

  try {
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
      throw new AppError(400, "BLOCKED_URL", "The specification URL resolves to a private or local network address.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "URL_LOOKUP_FAILED", "The specification hostname could not be resolved.");
  }
  return url;
}

function filenameFor(url: URL, contentType: string | null): string {
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".json") || contentType?.includes("json")) return "remote-swagger.json";
  return "remote-swagger.yaml";
}

export async function fetchSpecification(urlValue: string): Promise<{ fileName: string; content: Buffer }> {
  let url = await assertSafeUrl(urlValue);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SWAGGER_FETCH_TIMEOUT_MS);

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await fetch(url, { signal: controller.signal, redirect: "manual", headers: { Accept: "application/json, application/yaml, text/yaml, text/plain" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new AppError(400, "TOO_MANY_REDIRECTS", "The specification URL redirected too many times.");
        url = await assertSafeUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new AppError(502, "URL_FETCH_FAILED", `The specification URL returned HTTP ${response.status}.`);
      const length = Number(response.headers.get("content-length"));
      const maxBytes = env.MAX_REMOTE_FILE_SIZE_MB * 1024 * 1024;
      if (Number.isFinite(length) && length > maxBytes) throw new AppError(413, "REMOTE_FILE_TOO_LARGE", "The remote specification exceeds the permitted size.");
      if (!response.body) throw new AppError(502, "EMPTY_REMOTE_FILE", "The specification URL returned no content.");

      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > maxBytes) throw new AppError(413, "REMOTE_FILE_TOO_LARGE", "The remote specification exceeds the permitted size.");
        chunks.push(chunk);
      }
      if (!total) throw new AppError(400, "EMPTY_FILE", "The remote specification is empty.");
      return { fileName: filenameFor(url, response.headers.get("content-type")), content: Buffer.concat(chunks) };
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AppError(504, "URL_FETCH_TIMEOUT", "Fetching the specification URL timed out.");
    throw new AppError(502, "URL_FETCH_FAILED", "The specification URL could not be fetched.");
  } finally {
    clearTimeout(timeout);
  }
  throw new AppError(400, "TOO_MANY_REDIRECTS", "The specification URL redirected too many times.");
}
