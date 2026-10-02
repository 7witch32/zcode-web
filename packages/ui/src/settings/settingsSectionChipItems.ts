import type { SettingsSectionId } from "@/lib/settingsNavigation.js";

export type SettingsChipNavItem =
  | { kind: "section"; id: SettingsSectionId; titleId: string }
  | { kind: "onboarding" };

/**
 * Flattens the grouped sidebar config into the phone chip-bar order:
 * groups in config order (basics → agent capabilities → data & stats), sections in
 * config order within each group, then the Onboard entry last. Pure so the phone
 * navigation can be unit-tested against the same ordering the desktop sidebar renders
 * (both must consume createSettingsPageConfig output — never a hardcoded list).
 */
export function buildSettingsSectionChipItems(
  groups: ReadonlyArray<{
    sections: ReadonlyArray<{ id: SettingsSectionId; titleId: string }>;
  }>,
): SettingsChipNavItem[] {
  return [
    ...groups.flatMap((group) =>
      group.sections.map((section) => ({
        kind: "section" as const,
        id: section.id,
        titleId: section.titleId,
      })),
    ),
    { kind: "onboarding" },
  ];
}
