#!/usr/bin/env bash
# Seeds App Configuration with one JSON document per Atlas project.
# Prints counts only. PROJECTS_JSON is identifiers, not credentials.
set -euo pipefail

: "${APPCONFIG_ENDPOINT:?}"
: "${PROJECTS_JSON:?}"

python3 - <<'PY'
import json, os, subprocess, sys, time

raw = os.environ["PROJECTS_JSON"]
lowered = raw.lower()
for banned in ("begin private key", "begin rsa private key", "client_secret=", "accountkey="):
    if banned in lowered:
        sys.exit("projects JSON contains secret material and was not written")

doc = json.loads(raw)
projects = doc["projects"] if isinstance(doc, dict) else doc
if not isinstance(projects, list) or not projects:
    sys.exit("projects JSON must contain a non-empty projects array")

endpoint = os.environ["APPCONFIG_ENDPOINT"]
want = {}
for project in projects:
    group = project["atlasGroupId"].lower()
    want[f"atlas-sentinel/project/{group}"] = json.dumps(project, separators=(",", ":"))

def az(*args):
    return subprocess.run(["az", *args], check=False, capture_output=True, text=True)

listed = None
for attempt in range(1, 13):
    listed = az(
        "appconfig", "kv", "list",
        "--endpoint", endpoint,
        "--auth-mode", "login",
        "--key", "atlas-sentinel/project/*",
        "--fields", "key",
        "-o", "json",
    )
    if listed.returncode == 0:
        break
    time.sleep(15)
if listed is None or listed.returncode != 0:
    sys.stderr.write((listed.stderr if listed else "list failed")[-500:])
    sys.exit(1)

existing = [row.get("key") for row in json.loads(listed.stdout or "[]")]
for key, value in want.items():
    result = az(
        "appconfig", "kv", "set",
        "--endpoint", endpoint,
        "--auth-mode", "login",
        "--key", key,
        "--value", value,
        "--yes",
        "-o", "none",
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr[-500:])
        sys.exit(result.returncode)
for key in existing:
    if key and key not in want:
        result = az(
            "appconfig", "kv", "delete",
            "--endpoint", endpoint,
            "--auth-mode", "login",
            "--key", key,
            "--yes",
        )
        if result.returncode != 0:
            sys.stderr.write(result.stderr[-500:])
            sys.exit(result.returncode)
print(f"seeded {len(want)} projects")
PY
