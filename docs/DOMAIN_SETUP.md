# Arches Domain Setup

The first public scaffold uses static hosting for both the marketing site and
the installer endpoint. This repo deploys `site/` to GitHub Pages from
`.github/workflows/deploy-site.yml`.

Current live URLs:

```text
https://arches.lat/
https://install.arches.lat/
https://jpfraneto.github.io/arches/
```

`arches.lat` is active in Cloudflare DNS and configured as the GitHub Pages
custom domain for this repo.
`install.arches.lat` is a proxied Cloudflare hostname with a Single Redirect to
`https://arches.lat/install`.

## DNS Targets

- `arches.lat`: landing page for Arches.
- `install.arches.lat`: raw installer script endpoint.
- `*.arches.lat`: future Arch hostnames routed through Cloudflare Tunnel.

The domain uses Cloudflare nameservers:

```text
chase.ns.cloudflare.com
desi.ns.cloudflare.com
```

For `arches.lat`, keep the GitHub Pages apex records:

```text
A     @    185.199.108.153
A     @    185.199.109.153
A     @    185.199.110.153
A     @    185.199.111.153
AAAA  @    2606:50c0:8000::153
AAAA  @    2606:50c0:8001::153
AAAA  @    2606:50c0:8002::153
AAAA  @    2606:50c0:8003::153
```

GitHub Pages supports one custom domain per Pages site, with `www` as the
special redirect exception. That is enough for the temporary static landing
page, but not enough for programmable `*.arches.lat` hostnames.

For the zero-info install product, use Cloudflare Tunnel for Arch hostnames. The
intended shape is:

```text
arches.lat          landing/control surface
install.arches.lat  installer endpoint
*.arches.lat        per-Arch tunnel hostnames
```

To keep the public one-liner as `https://install.arches.lat` before the full
control plane exists, Cloudflare DNS has:

```text
CNAME install.arches.lat arches.lat proxied
```

and a Single Redirect rule:

```text
install.arches.lat/* -> https://arches.lat/install
```

## Static Paths

- `site/index.html` is the `arches.lat` homepage.
- `site/install` is the raw installer script.

`install.arches.lat` redirects to `https://arches.lat/install`, which serves the
raw contents of `site/install`.

The installer is static. It validates the requested Arch config, renders the
Docker Compose appliance files, and optionally starts Docker services when the
caller passes `--yes`.

## Local Hosting Check

From the repo root:

```bash
python3 -m http.server 8080 --directory site
```

Then open:

- `http://localhost:8080/` for the landing page.
- `http://localhost:8080/install` for the raw installer script.

Use the raw script locally with:

```bash
curl -fsSL http://localhost:8080/install | \
  ARCHES_INSTALL_DIR=/tmp/arches-site-local bash -s -- \
  --arch anky \
  --mode local \
  --admin-fid 123 \
  --email support@example.com
```
