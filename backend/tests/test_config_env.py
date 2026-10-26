"""Hosting dashboards hand list settings over as plain text, so they must not need to be JSON."""
import pytest

from app.config import Settings


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("https://a.vercel.app", ["https://a.vercel.app"]),
        ("https://a.vercel.app, https://b.example.com", ["https://a.vercel.app", "https://b.example.com"]),
        ('["https://a.vercel.app"]', ["https://a.vercel.app"]),
        ("", []),
    ],
)
def test_cors_origins_accepts_plain_comma_json_and_empty(monkeypatch, raw, expected):
    monkeypatch.setenv("CORS_ORIGINS", raw)
    assert Settings(_env_file=None).CORS_ORIGINS == expected


def test_supported_currencies_accepts_plain_comma_list(monkeypatch):
    monkeypatch.setenv("SUPPORTED_CURRENCIES", "INR, USD")
    assert Settings(_env_file=None).SUPPORTED_CURRENCIES == ["INR", "USD"]
