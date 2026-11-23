/**
 * API keys in the window (decision of the owner, 23.11.2026): COSGRAL agents work through the CLIs and the
 * subscriptions of their accounts, not API keys. The API keys and own model endpoints sections of the Providers page
 * and the key pool of the provider catalog are hidden. Their code, tests and stories stay; true shows them again (the
 * W5 rows of scripts/sandbox-acceptance.ts about keys and endpoints need it).
 */
export const SHOW_API_KEYS = false;
