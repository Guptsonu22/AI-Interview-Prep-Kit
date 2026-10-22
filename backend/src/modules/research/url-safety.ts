import { URL } from 'url';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { URLValidationResult, CrawlerOptions } from './types';

const PRIVATE_IP_RANGES = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0x64400000, 0x647fffff], // 100.64.0.0/10
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24
  [0xc0586300, 0xc05863ff], // 192.88.99.0/24
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24
  [0xe0000000, 0xffffffff], // multicast and reserved
];

const BLOCKED_TLDS = ['.local', '.internal', '.corp', '.home', '.lan'];
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc * 256) + Number(octet), 0);
}

async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.map(({ address }) => address);
  } catch {
    return [];
  }
}

function expandIpv6(ip: string): bigint | null {
  let address = ip.toLowerCase();
  if (address.includes('%')) return null;

  const ipv4Tail = address.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Tail) {
    const octets = ipv4Tail[1]!.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => part < 0 || part > 255)) return null;
    const first = ((octets[0]! << 8) | octets[1]!).toString(16);
    const second = ((octets[2]! << 8) | octets[3]!).toString(16);
    address = address.slice(0, -ipv4Tail[1]!.length) + `${first}:${second}`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] => half ? half.split(':').map((group) => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) throw new Error('Invalid IPv6 group');
    return parseInt(group, 16);
  }) : [];

  try {
    const left = parseHalf(halves[0] || '');
    const right = parseHalf(halves[1] || '');
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
    const groups = [...left, ...Array(missing).fill(0), ...right];
    return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
  } catch {
    return null;
  }
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const value = ipv4ToInt(ip);
    return PRIVATE_IP_RANGES.some(([start, end]) => value >= start! && value <= end!);
  }
  if (version !== 6) return false;

  const value = expandIpv6(ip);
  if (value === null) return true;
  const loopback = 1n;
  const uniqueLocalStart = 0xfc000000000000000000000000000000n;
  const uniqueLocalEnd = 0xfdffffffffffffffffffffffffffffffn;
  const linkLocalStart = 0xfe800000000000000000000000000000n;
  const linkLocalEnd = 0xfebfffffffffffffffffffffffffffffn;
  const multicastStart = 0xff000000000000000000000000000000n;
  const multicastEnd = 0xffffffffffffffffffffffffffffffffn;
  const ipv4MappedPrefix = value >> 32n;
  const ipv4CompatiblePrefix = value >> 32n;

  if (value === 0n || value === loopback) return true;
  if (value >= uniqueLocalStart && value <= uniqueLocalEnd) return true;
  if (value >= linkLocalStart && value <= linkLocalEnd) return true;
  if (value >= multicastStart && value <= multicastEnd) return true;
  if (ipv4MappedPrefix === 0xffffn) return isBlockedIp(intToIpv4(Number(value & 0xffffffffn)));
  if (ipv4CompatiblePrefix === 0n) return true;
  return false;
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function normalizeUrl(url: string, baseUrl?: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = '';
    parsed.search = parsed.searchParams.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}

export function validateUrl(url: string, options: CrawlerOptions = {}): URLValidationResult {
  let parsed: URL;
  
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { valid: false, error: `Protocol ${parsed.protocol} not allowed` };
  }

  const normalized = normalizeUrl(url);
  const hostname = parsed.hostname.toLowerCase();
  
  const unbracketedHostname = hostname.replace(/^\[|\]$/g, '');
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost') || unbracketedHostname === '127.0.0.1' || unbracketedHostname === '::1';
  const isPrivateTld = BLOCKED_TLDS.some(tld => hostname.endsWith(tld));
  const allowLocalhost = options.enableLocalhost === true || process.env['ALLOW_LOCALHOST'] === 'true';
  const blockedPorts = ['21', '22', '23', '25', '110', '143', '3306', '5432', '6379', '27017'];
  
  if (parsed.port && blockedPorts.includes(parsed.port)) {
    return { valid: false, error: `Unsafe port blocked: ${parsed.port}`, isPublic: false };
  }

  if (isLocalhost && !allowLocalhost) {
    return { valid: false, error: 'Localhost not allowed in production', isPublic: false };
  }

  if (isPrivateTld) {
    return { valid: false, error: 'Private TLD not allowed', isPublic: false };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs containing credentials are not allowed', isPublic: false };
  }

  if (isIP(unbracketedHostname) && isBlockedIp(unbracketedHostname) && !(allowLocalhost && isLocalhost)) {
    return { valid: false, error: `Private or reserved IP destination is not allowed: ${unbracketedHostname}`, isPublic: false };
  }

  return { 
    valid: true, 
    normalized, 
    isPublic: !isLocalhost && !isPrivateTld 
  };
}

export async function validateDestinationUrl(url: string, options: CrawlerOptions = {}): Promise<URLValidationResult> {
  const initialValidation = validateUrl(url, options);
  if (!initialValidation.valid) {
    return initialValidation;
  }

  const parsed = new URL(initialValidation.normalized!);
  const hostname = parsed.hostname;
  
  const unbracketedHostname = hostname.replace(/^\[|\]$/g, '');
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost') || unbracketedHostname === '127.0.0.1' || unbracketedHostname === '::1';
  const allowLocalhost = options.enableLocalhost === true || process.env['ALLOW_LOCALHOST'] === 'true';
  
  const ips = await resolveHostname(hostname);
  
  for (const ip of ips) {
    if (isBlockedIp(ip) && !(isLocalhost && allowLocalhost)) {
      return {
        valid: false,
        error: `Destination resolves to private or reserved IP: ${ip}`,
        isPublic: false,
      };
    }
  }

  return { 
    valid: true, 
    normalized: initialValidation.normalized, 
    isPublic: !isLocalhost || options.enableLocalhost
  };
}

export function validateRedirectChain(urls: string[], options: CrawlerOptions): URLValidationResult {
  const seen = new Set<string>();
  
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) {
      return { valid: false, error: 'Redirect loop detected', isPublic: false };
    }
    seen.add(normalized);
    
    const validation = validateUrl(normalized, options);
    if (!validation.valid) {
      return validation;
    }
  }
  
  return { valid: true, normalized: urls[urls.length - 1], isPublic: true };
}

export function isSameScope(url: string, baseUrl: string): boolean {
  try {
    const urlObj = new URL(url);
    const baseObj = new URL(baseUrl);
    return urlObj.hostname === baseObj.hostname;
  } catch {
    return false;
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function getUrlDepth(url: string, baseUrl: string): number {
  try {
    const urlObj = new URL(url);
    const baseObj = new URL(baseUrl);
    const urlPath = urlObj.pathname.split('/').filter(Boolean);
    const basePath = baseObj.pathname.split('/').filter(Boolean);
    return Math.max(0, urlPath.length - basePath.length);
  } catch {
    return 0;
  }
}
