import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { validateOpenClawConfig } from "../src/config/validateOpenClawConfig";

describe("validateOpenClawConfig", () => {
  test("passes for current openclaw.yaml", async () => {
    const result = await validateOpenClawConfig(join(process.cwd(), "openclaw.yaml"));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("returns errors for broken config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openclaw-invalid-"));
    const invalidConfigPath = join(dir, "broken.yaml");

    await writeFile(invalidConfigPath, "version: 1\nname: broken\n", "utf8");

    const result = await validateOpenClawConfig(invalidConfigPath);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
