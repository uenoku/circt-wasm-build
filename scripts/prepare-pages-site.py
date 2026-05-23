#!/usr/bin/env python3
import argparse
import json
import re
import shutil
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urljoin


def sanitize_id(value):
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    value = value.strip("-._")
    return value or "current"


def load_previous_manifest(base_url):
    if not base_url:
        return None
    if not base_url.endswith("/"):
        base_url += "/"
    try:
        with urllib.request.urlopen(urljoin(base_url, "wasm/manifest.json"), timeout=20) as response:
            return json.load(response)
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return None


def copy_tree(src, dst):
    if dst.exists():
        shutil.rmtree(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst)


def copy_current_tools(bin_dir, dst_dir):
    dst_dir.mkdir(parents=True, exist_ok=True)
    tools = []
    for js_file in sorted(bin_dir.glob("*.js")):
        wasm_file = js_file.with_suffix(".wasm")
        if not wasm_file.exists():
            continue
        tools.append(js_file.stem)
        shutil.copy2(js_file, dst_dir / js_file.name)
        shutil.copy2(wasm_file, dst_dir / wasm_file.name)
    return tools


def download_previous_tools(base_url, version, site_dir):
    if not base_url.endswith("/"):
        base_url += "/"
    tools = version.get("tools") or []
    path = version.get("path")
    if not tools or not path:
        return False

    dst_dir = site_dir / path
    dst_dir.mkdir(parents=True, exist_ok=True)
    for tool in tools:
        for suffix in (".js", ".wasm"):
            source = urljoin(base_url, f"{path}{tool}{suffix}")
            try:
                with urllib.request.urlopen(source, timeout=30) as response:
                    (dst_dir / f"{tool}{suffix}").write_bytes(response.read())
            except (OSError, urllib.error.URLError):
                return False
    return True


def write_root_redirect(site_dir):
    (site_dir / "index.html").write_text(
        """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=examples/web/">
    <title>CIRCT WASM Runner</title>
    <link rel="canonical" href="examples/web/">
  </head>
  <body>
    <p><a href="examples/web/">Open CIRCT WASM Runner</a></p>
  </body>
</html>
""",
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", required=True)
    parser.add_argument("--web-dir", required=True)
    parser.add_argument("--bin-dir", required=True)
    parser.add_argument("--version-label", required=True)
    parser.add_argument("--circt-ref", required=True)
    parser.add_argument("--previous-base-url", default="")
    args = parser.parse_args()

    site_dir = Path(args.site_dir)
    web_dir = Path(args.web_dir)
    bin_dir = Path(args.bin_dir)
    version_id = sanitize_id(args.version_label)
    version_path = f"wasm/{version_id}/bin/"

    if site_dir.exists():
        shutil.rmtree(site_dir)
    site_dir.mkdir(parents=True)

    copy_tree(web_dir, site_dir / "examples" / "web")
    (site_dir / ".nojekyll").touch()
    write_root_redirect(site_dir)

    previous_manifest = load_previous_manifest(args.previous_base_url)
    versions = []
    if previous_manifest:
        for version in previous_manifest.get("versions", []):
            if version.get("id") == version_id:
                continue
            if download_previous_tools(args.previous_base_url, version, site_dir):
                versions.append(version)

    tools = copy_current_tools(bin_dir, site_dir / version_path)
    current_version = {
        "id": version_id,
        "label": args.version_label,
        "circtRef": args.circt_ref,
        "path": version_path,
        "tools": tools,
    }
    versions.insert(0, current_version)

    manifest = {
        "default": version_id,
        "versions": versions,
    }
    manifest_dir = site_dir / "wasm"
    manifest_dir.mkdir(exist_ok=True)
    (manifest_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
