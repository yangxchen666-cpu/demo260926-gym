"""Round-trip check through the admin-frontend Vite proxy (:5174).

login -> create -> fetch -> update -> delete, all via the proxy, then cleans
up after itself. ASCII-only output. (Cross-app visibility with backend :8000
rests on both .env files pointing at the same demo001 database; verify that
manually when backend is running.)

Usage (from admin-backend/): .venv/Scripts/python scripts/cross_check.py
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values  # noqa: E402

PROXY = "http://localhost:5174"  # Vite -> admin-backend :9000


def request(method, path, body=None, token=None):
    req = urllib.request.Request(PROXY + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, data) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None)


def main() -> None:
    env = dotenv_values(Path(__file__).resolve().parent.parent / ".env")
    suffix = "proxychk"

    st, body = request("POST", "/api/auth/login", body={
        "email": env["ADMIN_INITIAL_EMAIL"],
        "password": env["ADMIN_INITIAL_PASSWORD"],
    })
    assert st == 200, f"login failed: {st} (is admin-frontend dev server up?)"
    token = body["token"]
    print("[ok] login via Vite proxy")

    fields = {
        "name": f"proxy_check_{suffix}",
        "type": "网球场",
        "location": "proxy check road",
        "image": "https://picsum.photos/seed/proxychk/400/260",
        "description": "temporary venue for proxy round-trip check",
        "opening_hours": "09:00-21:00",
        "contact": "010-99999999",
    }
    st, body = request("POST", "/api/venues", token=token, body=fields)
    assert st == 201, f"create failed: {st}"
    venue_id = body["id"]
    print(f"[ok] create via proxy (id={venue_id})")

    st, body = request("GET", f"/api/venues/{venue_id}", token=token)
    assert st == 200 and body["name"] == fields["name"], "fetch mismatch"
    print("[ok] fetch via proxy")

    st, body = request("PUT", f"/api/venues/{venue_id}", token=token,
                       body={**fields, "name": f"proxy_renamed_{suffix}"})
    assert st == 200 and body["name"] == f"proxy_renamed_{suffix}", "update mismatch"
    print("[ok] update via proxy")

    st, _ = request("DELETE", f"/api/venues/{venue_id}", token=token)
    assert st == 204, f"delete failed: {st}"
    print("[ok] delete via proxy (cleanup done)")

    print("\nPROXY ROUND-TRIP PASSED")


if __name__ == "__main__":
    main()
