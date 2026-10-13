// Keep credentials in backend memory; expose neither values nor identities to UI.
export function configuredChatKeys(env: Record<string, string | undefined>): string[] {
  return [...new Set([
    env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY_1,
    env.OPENROUTER_API_KEY_2,
    env.OPENROUTER_API_KEY_3,
  ].map(value => value?.trim()).filter((value): value is string => !!value))];
}
