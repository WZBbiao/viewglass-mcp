import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { autoBootstrapForMcpStartup, initProject } from "../init.js";

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
      expect(agents).toContain("If using ViewglassMCP, use the installed ViewglassMCP skill before calling Viewglass tools, and after any reusable live task succeeds, update .viewglassmcp/recipes.yaml in the same session.");
      expect(fs.existsSync(path.join(project, ".viewglassmcp", "README.md"))).toBe(true);
      expect(fs.existsSync(path.join(project, ".viewglassmcp", "recipes.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(project, ".viewglassmcp", "config.yaml"))).toBe(true);
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


describe("autoBootstrapForMcpStartup", () => {
  it("creates project memory and AGENTS guidance without throwing", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-mcp-auto-"));
    const project = path.join(tempRoot, "project");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "AGENTS.md"), "# AGENTS.md\n", "utf8");
    const originalCwd = process.cwd();
    try {
      process.chdir(project);
      autoBootstrapForMcpStartup(project);
      expect(fs.existsSync(path.join(project, ".viewglassmcp", "config.yaml"))).toBe(true);
      const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
      expect(agents).toContain("If using ViewglassMCP, use the installed ViewglassMCP skill before calling Viewglass tools, and after any reusable live task succeeds, update .viewglassmcp/recipes.yaml in the same session.");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
