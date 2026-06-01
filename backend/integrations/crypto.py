"""Symmetric encryption for stored integration secrets.

The Fernet key is derived from the app's ``jwt_secret`` so there's no new key
material to manage — rotating the JWT secret rotates this key too (and would
make existing ciphertext undecryptable, which is acceptable: the admin re-enters
the credential). The derivation salt/info is fixed so the key is stable across
restarts.
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from config import get_jwt_secret

_KDF_INFO = b"card-slam-integrations"
_KDF_ITERATIONS = 100_000


def _fernet() -> Fernet:
    key = hashlib.pbkdf2_hmac(
        "sha256", get_jwt_secret().encode(), _KDF_INFO, _KDF_ITERATIONS
    )
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
