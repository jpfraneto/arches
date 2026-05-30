const form = document.querySelector("#install-form");
const output = document.querySelector("#command-output");
const copyButton = document.querySelector("#copy-command");
const modeNote = document.querySelector("#mode-note");
const domainInput = document.querySelector("#domain");

const field = (id, fallback) => {
  const value = document.querySelector(id).value.trim();
  return value || fallback;
};

const selectedMode = () => {
  return document.querySelector('input[name="mode"]:checked').value;
};

const buildCommand = () => {
  const arch = field("#arch", "<arch>");
  const mode = selectedMode();
  const domainValue = domainInput.value.trim();
  const domain = domainValue || (mode === "local" ? "" : "<domain>");
  const fid = field("#fid", "<fid>");
  const email = field("#email", mode === "tunnel-local" ? "support@arches.lat" : "<email>");
  const tunnelToken = field("#tunnel-token", "<cloudflare-tunnel-token>");

  const lines = [
    "curl -fsSL https://install.arches.lat | bash -s -- \\",
    `  --arch ${arch} \\`,
    `  --mode ${mode} \\`,
  ];

  if (domain) {
    lines.push(`  --domain ${domain} \\`);
  }

  lines.push(`  --admin-fid ${fid} \\`);
  lines.push(`  --email ${email}`);

  if (mode === "tunnel-local") {
    lines[lines.length - 1] = `${lines[lines.length - 1]} \\`;
    lines.push(`  --tunnel-token ${tunnelToken}`);
  }

  return lines.join("\n");
};

const updateModeState = () => {
  const mode = selectedMode();

  if (mode === "local") {
    domainInput.placeholder = "localhost";
    modeNote.textContent =
      "Local mode can omit --domain; the installer defaults it to localhost.";
    return;
  }

  domainInput.placeholder = "anky.arches.lat";
  if (mode === "tunnel-local") {
    modeNote.textContent =
      "Live local mode needs a Cloudflare Tunnel token from the Arches control plane.";
    return;
  }

  modeNote.textContent =
    mode === "vps"
      ? "VPS mode includes Caddy and requires DNS pointed at the server."
      : "Existing-proxy mode exposes local ports for a reverse proxy you manage.";
};

const render = () => {
  updateModeState();
  output.textContent = buildCommand();
};

form.addEventListener("input", render);
form.addEventListener("change", render);

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.textContent);
  copyButton.textContent = "Copied";
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1400);
});

render();
