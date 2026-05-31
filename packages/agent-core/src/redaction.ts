const secretPatterns: RegExp[] = [
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bOPENAI_API_KEY\s*=\s*[^\s]+/gi,
  /\bGITHUB_(?:TOKEN|PERSONAL_ACCESS_TOKEN)\s*=\s*[^\s]+/gi,
  /\b(?:token|api[_-]?key|secret)\s*[:=]\s*["']?[^"'\s]+/gi
];

export function redactSecrets(value: string): string {
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
}

export function redactMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === "string" ? redactSecrets(value) : value
    ])
  );
}

