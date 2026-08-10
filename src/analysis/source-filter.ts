export interface SourceFilterDecision {
  allowed: boolean;
  reason?: string;
}

export interface SourceFilter {
  evaluate(filePath: string, sourceCode: string): SourceFilterDecision;
}

const SUPPORTED_SOURCE_EXTENSION = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i;
const EXCLUDED_SEGMENT = /(^|\/)(?:node_modules|bower_components|vendor|dist|build|out|coverage|\.git|\.next|\.nuxt|generated)(?:\/|$)/;
const SECRET_FILE = /(^|\/)(?:\.env(?:\.[^/]*)?|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx|crt|cer))$/;
const GENERATED_FILE = /(?:\.min\.[cm]?js|\.generated\.[^/]+|\.gen\.[^/]+)$/;

export class DefaultSourceFilter implements SourceFilter {
  constructor(private readonly maxBytes: number) {}

  evaluate(filePath: string, sourceCode: string): SourceFilterDecision {
    const normalized = filePath.replaceAll("\\", "/").toLowerCase();
    if (!SUPPORTED_SOURCE_EXTENSION.test(normalized)) {
      return blocked("Only JavaScript and TypeScript source files are supported.");
    }
    if (EXCLUDED_SEGMENT.test(normalized)) {
      return blocked("Dependencies, generated output, and build directories are excluded.");
    }
    if (SECRET_FILE.test(normalized)) {
      return blocked("Environment, credential, certificate, and key files are excluded.");
    }
    if (GENERATED_FILE.test(normalized) || /@generated|auto-generated|do not edit/i.test(sourceCode.slice(0, 500))) {
      return blocked("Generated and minified sources are excluded.");
    }
    if (Buffer.byteLength(sourceCode, "utf8") > this.maxBytes) {
      return blocked(`This file exceeds the configured ${Math.round(this.maxBytes / 1024)} KB limit.`);
    }
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(sourceCode) ||
      /\bAKIA[0-9A-Z]{16}\b/.test(sourceCode) ||
      /\bsk-[A-Za-z0-9_-]{20,}\b/.test(sourceCode)
    ) {
      return blocked("The file appears to contain a private key or credential value.");
    }
    return { allowed: true };
  }
}

function blocked(reason: string): SourceFilterDecision {
  return { allowed: false, reason };
}

