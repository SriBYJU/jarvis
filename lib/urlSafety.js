import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIpv6(ip) {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (x === "::" || x === "::1") return true;
  if (x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) return true;
  if (x.startsWith("::ffff:")) {
    const mapped = x.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export async function validatePublicHttpUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || "")); }
  catch { throw new Error("Invalid URL"); }

  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are allowed");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed");

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Local/private network URLs are not allowed");
  }

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Local/private network URLs are not allowed");
  } else {
    let records;
    try { records = await lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error("Could not resolve URL host"); }
    if (!records.length || records.some(r => isPrivateAddress(r.address))) {
      throw new Error("Local/private network URLs are not allowed");
    }
  }

  return url;
}

export async function safeHttpFetch(rawUrl, options = {}, maxRedirects = 4) {
  let current = await validatePublicHttpUrl(rawUrl);
  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetch(current.toString(), { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (i === maxRedirects) throw new Error("Too many redirects");
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect response did not include a location");
    current = await validatePublicHttpUrl(new URL(location, current).toString());
  }
  throw new Error("Unable to fetch URL");
}
