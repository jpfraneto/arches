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

  test("locks the composer from the API publishing state", () => {
    expect(html).toContain("function setComposerAvailability()");
    expect(html).toContain("state.arch?.publishing?.farcaster?.enabled");
    expect(html).toContain('control.disabled = !enabled');
    expect(html).toContain('submit.textContent = "Farcaster publishing not connected"');
    expect(html).toContain("Posting is disabled until this Arch can publish to Farcaster.");
  });
});
