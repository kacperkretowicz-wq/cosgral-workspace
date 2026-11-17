// The sandbox app must never see the owner's real sign-ins. A shell that runs these scripts may carry Claude, OpenBot,
// Anthropic, OpenAI, Git or token variables; this returns the inherited environment without them.
const BLOCKED = /^(CLAUDE|CLAUDECODE|OPENBOT|ANTHROPIC|OPENAI|CODEX|GIT_CONFIG|GITHUB|GH_)/i;
const SECRET = /(TOKEN|SECRET|API_?KEY|PASSWORD|CREDENTIAL)/i;

export function cleanEnvironment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || BLOCKED.test(name) || SECRET.test(name)) continue;
    clean[name] = value;
  }
  return clean;
}
