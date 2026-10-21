import { URL } from 'url';
import { URLValidationResult, CrawlerOptions } from './types';

const PRIVATE_IP_RANGES = [
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255') },
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255') },
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255') },
  { start: ipToInt('127.0.0.0'), end: ipToInt('127.255.255.255') },
  { start: ipToInt('169.254.0.0'), end: ipToInt('169.254.255.255') },
  { start: ipToInt('::1'), end: ipToInt('::1') },
  { start: ipToInt('fe80::'), end: ipToInt('febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff') },
  { start: ipToInt('fc00::'), end: ipToInt('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') },
];

const BLOCKED_TLDS = ['.local', '.internal', '.corp', '.home', '.lan'];
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function ipToInt(ip: string): number {
  if (ip.includes(':')) {
    return 0;
  }
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const { Resolver } = await import('dns/promises');
    const resolver = new Resolver();
    return await resolver.resolve4(hostname);
  } catch {
    return [];
  }
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
  
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
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
  
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const allowLocalhost = options.enableLocalhost === true || process.env['ALLOW_LOCALHOST'] === 'true';
  
  const ips = await resolveHostname(hostname);
  
  for (const ip of ips) {
    const ipInt = ipToInt(ip);
    for (const range of PRIVATE_IP_RANGES) {
      if (ipInt >= range.start && ipInt <= range.end) {
        if (isLocalhost && allowLocalhost) {
          continue;
        }
        return { 
          valid: false, 
          error: `Destination resolves to private IP: ${ip}`, 
          isPublic: false 
        };
      }
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