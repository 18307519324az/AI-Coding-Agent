export type CommandRisk = "read" | "low" | "medium" | "high" | "blocked";

export type CommandPolicyDecision = {
  command: string;
  allowed: boolean;
  risk: CommandRisk;
  requiresApproval: boolean;
  reason: string;
};

const blockedPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-rf\b/i, reason: "Recursive force deletion is forbidden." },
  { pattern: /\bcurl\b.+\|\s*(bash|sh)\b/i, reason: "Piping downloaded code into a shell is forbidden." },
  { pattern: /\bwget\b.+\|\s*(bash|sh)\b/i, reason: "Piping downloaded code into a shell is forbidden." },
  { pattern: /\bsudo\b/i, reason: "Privilege escalation is forbidden." },
  { pattern: /\bchmod\s+777\b/i, reason: "World-writable permissions are forbidden." },
  { pattern: /\bscp\b/i, reason: "Remote copy is outside the MVP execution boundary." },
  { pattern: /\bssh\b/i, reason: "Interactive remote shell access is forbidden." },
  { pattern: /\bdocker\s+run\b.+--privileged\b/i, reason: "Privileged containers are forbidden." },
  { pattern: /\beval\b/i, reason: "Dynamic shell evaluation is forbidden." },
  { pattern: /\bnode\s+-e\b/i, reason: "Inline Node execution is forbidden by the MVP allowlist." },
  { pattern: /\bpython\s+-c\b/i, reason: "Inline Python execution is forbidden by the MVP allowlist." }
];

const exactCommands = new Map<string, Omit<CommandPolicyDecision, "command">>([
  ["pnpm lint", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed lint command." }],
  ["pnpm typecheck", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed typecheck command." }],
  ["pnpm test", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed unit test command." }],
  ["pnpm test:e2e", { allowed: true, risk: "medium", requiresApproval: false, reason: "Allowed E2E test command." }],
  ["npm run lint", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed lint command." }],
  ["npm run typecheck", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed typecheck command." }],
  ["npm test", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed unit test command." }],
  ["npm run test:e2e", { allowed: true, risk: "medium", requiresApproval: false, reason: "Allowed E2E test command." }],
  ["yarn lint", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed lint command." }],
  ["yarn typecheck", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed typecheck command." }],
  ["yarn test", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed unit test command." }],
  ["npx playwright test", { allowed: true, risk: "medium", requiresApproval: false, reason: "Allowed Playwright test command." }],
  ["git status", { allowed: true, risk: "read", requiresApproval: false, reason: "Allowed git status command." }],
  ["git diff", { allowed: true, risk: "read", requiresApproval: false, reason: "Allowed git diff command." }],
  ["git add", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed staging command." }],
  ["git add .", { allowed: true, risk: "low", requiresApproval: false, reason: "Allowed staging command." }]
]);

const installCommands = new Set(["pnpm install", "npm install", "yarn install"]);

function normalize(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function isSafeRef(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..");
}

export function evaluateCommand(command: string): CommandPolicyDecision {
  const normalized = normalize(command);

  for (const blocked of blockedPatterns) {
    if (blocked.pattern.test(normalized)) {
      return {
        command: normalized,
        allowed: false,
        risk: "blocked",
        requiresApproval: false,
        reason: blocked.reason
      };
    }
  }

  if (installCommands.has(normalized)) {
    return {
      command: normalized,
      allowed: true,
      risk: "high",
      requiresApproval: true,
      reason: "Dependency installation requires explicit approval."
    };
  }

  const exact = exactCommands.get(normalized);
  if (exact) {
    return { command: normalized, ...exact };
  }

  const checkout = normalized.match(/^git checkout -b ([A-Za-z0-9._/-]+)$/);
  if (checkout && isSafeRef(checkout[1])) {
    return {
      command: normalized,
      allowed: true,
      risk: "low",
      requiresApproval: false,
      reason: "Allowed branch creation command."
    };
  }

  const commit = normalized.match(/^git commit -m "([^"]{3,200})"$/);
  if (commit) {
    return {
      command: normalized,
      allowed: true,
      risk: "medium",
      requiresApproval: false,
      reason: "Allowed commit command with a bounded message."
    };
  }

  if (/^git push( |$)/.test(normalized)) {
    return {
      command: normalized,
      allowed: true,
      risk: "high",
      requiresApproval: true,
      reason: "Pushing branches requires explicit approval."
    };
  }

  return {
    command: normalized,
    allowed: false,
    risk: "blocked",
    requiresApproval: false,
    reason: "Command is not in the MVP allowlist."
  };
}

