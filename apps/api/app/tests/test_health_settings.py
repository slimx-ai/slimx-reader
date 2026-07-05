from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.redaction import redact_sensitive


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_settings_get_is_redacted(client: TestClient) -> None:
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    body = resp.json()
    # Cloud is off by default; no raw token is ever exposed.
    assert body["allow_cloud_providers"] is False
    assert "slimx_rag_auth_token" not in body
    assert body["slimx_rag_auth_token_set"] is False
    assert body["default_provider"] == "ollama"


def test_settings_patch_non_secret(client: TestClient) -> None:
    resp = client.patch("/api/settings", json={"rag_default_top_k": 12, "default_model": "qwen"})
    assert resp.status_code == 200
    assert resp.json()["rag_default_top_k"] == 12
    assert resp.json()["default_model"] == "qwen"


def test_redaction_masks_secrets() -> None:
    payload = {
        "authorization": "Bearer sk-abcdefghijklmnop1234",
        "note": "curl -H 'api_key=supersecretvalue' https://x",
        "usage": {"input_tokens": 10},
    }
    out = redact_sensitive(payload)
    assert out["authorization"] == "[REDACTED]"
    assert "supersecretvalue" not in out["note"]
    # Usage counters survive redaction.
    assert out["usage"]["input_tokens"] == 10
