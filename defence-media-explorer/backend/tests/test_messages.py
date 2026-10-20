import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_frontend_message_parity_and_locale_formats():
    script = ROOT / "frontend" / "scripts" / "check-messages.mjs"
    completed = subprocess.run(["node", str(script)], check=True, capture_output=True, text=True)
    assert "key parity ok" in completed.stdout
    assert "formats:" in completed.stdout
