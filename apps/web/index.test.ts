import { describe, expect, test } from "bun:test";

const html = await Bun.file(new URL("./index.html", import.meta.url)).text();

describe("arches web shell", () => {
  test("keeps all runtime JavaScript inside the script tag", () => {
    const scriptClose = html.lastIndexOf("</script>");
    const bodyClose = html.lastIndexOf("</body>");
    const documentClose = html.lastIndexOf("</html>");

    expect(scriptClose).toBeGreaterThan(0);
    expect(bodyClose).toBeGreaterThan(scriptClose);
    expect(documentClose).toBeGreaterThan(bodyClose);
    expect(html.slice(scriptClose + "</script>".length, bodyClose)).not.toContain(
      "function setComposerAvailability",
    );
  });

  test("renders locked composer state when publishing is disabled", () => {
    expect(html).toContain("function setComposerAvailability()");
    expect(html).toContain("state.arch?.publishing?.farcaster?.enabled");
    expect(html).toContain('control.disabled = !enabled');
    expect(html).toContain('submit.textContent = "Farcaster publishing not connected"');
    expect(html).toContain("Arches will not create local-only fake casts");
    expect(html).toContain("pass publishing verification to unlock the composer");
  });

  test("renders unlocked composer state when publishing is enabled", () => {
    expect(html).toContain('submit.textContent = "Post to Farcaster"');
    expect(html).toContain(
      "Posting through this Arch. Casts stay Farcaster-native and appear in this scoped feed.",
    );
    expect(html).toContain("result.proof?.farcasterHash");
    expect(html).toContain("No casts have been published through this Arch yet.");
  });
});
