export type AutoLinkingScope = "private_only" | "public_recommendation";
export type AutoLinkingMode = "suggestion";

export type AutoLinkingPreference = {
  enabled: boolean;
  scope: AutoLinkingScope;
  mode: AutoLinkingMode;
  consentedAt: string | null;
};

type AutoLinkingRow = {
  auto_linking_enabled: boolean;
  auto_linking_scope: AutoLinkingScope;
  auto_linking_mode: AutoLinkingMode;
  auto_linking_consented_at: string | null;
};

export function defaultAutoLinkingPreference(): AutoLinkingPreference {
  return {
    enabled: false,
    scope: "private_only",
    mode: "suggestion",
    consentedAt: null,
  };
}

export function resolveAutoLinkingPreference(row: AutoLinkingRow | null | undefined): AutoLinkingPreference {
  if (!row) {
    return defaultAutoLinkingPreference();
  }

  return {
    enabled: row.auto_linking_enabled,
    scope: row.auto_linking_scope,
    mode: row.auto_linking_mode,
    consentedAt: row.auto_linking_consented_at,
  };
}
