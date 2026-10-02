import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSettingsSectionChipItems } from "../src/settings/settingsSectionChipItems.js";

test("flattens groups in config order and appends onboarding last", () => {
  const items = buildSettingsSectionChipItems([
    {
      sections: [
        { id: "general", titleId: "settings.systemTitle" },
        { id: "appearance", titleId: "settings.appearanceTitle" },
      ],
    },
    { sections: [{ id: "memory", titleId: "settings.memory" }] },
  ]);

  assert.deepEqual(
    items.map((item) => (item.kind === "onboarding" ? item.kind : item.id)),
    ["general", "appearance", "memory", "onboarding"],
  );
});

test("preserves title ids and marks every non-last item as a section", () => {
  const items = buildSettingsSectionChipItems([
    { sections: [{ id: "usage", titleId: "settings.usageTitle" }] },
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    kind: "section",
    id: "usage",
    titleId: "settings.usageTitle",
  });
  assert.deepEqual(items[1], { kind: "onboarding" });
});

test("empty groups contribute nothing and onboarding is still present", () => {
  const items = buildSettingsSectionChipItems([{ sections: [] }]);

  assert.deepEqual(items, [{ kind: "onboarding" }]);
});
