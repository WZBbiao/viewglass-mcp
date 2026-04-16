import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../init.js";

describe("initProject", () => {
  it("installs skill and updates AGENTS.md", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-mcp-init-"));
    const home = path.join(tempRoot, "home");
    const project = path.join(tempRoot, "project");
    const skillsDir = path.join(tempRoot, "skills");
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const result = initProject({ dest: skillsDir, projectRoot: project, force: true });
      expect(result.installed[0]?.location).toContain(path.join("skills", "viewglassmcp", "SKILL.md"));
      expect(result.agentsStatus).toBe("created");
      const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
      expect(agents).toContain("If using ViewglassMCP, use the installed ViewglassMCP skill before calling Viewglass tools.");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
