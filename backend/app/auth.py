"""Authentication boundary. Mock identities are shared demo profiles, not credentials.

A Clerk adapter should verify the JWT (issuer, audience, signature and expiry),
then map its subject to a stable application user ID before returning Identity.
Solve handlers depend only on Identity and do not know about the provider.
"""
from dataclasses import dataclass
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


@dataclass(frozen=True)
class Identity:
    id: str
    name: str
    email: str


class AuthProvider(Protocol):
    async def authenticate(self, token: str) -> Identity | None: ...


DEMO_USERS = (
    Identity("demo-andy", "Andy", "andy@example.com"),
    Identity("demo-alex", "Alex", "alex@example.com"),
    Identity("demo-sam", "Sam", "sam@example.com"),
)


class MockAuthProvider:
    async def authenticate(self, token: str) -> Identity | None:
        return next((user for user in DEMO_USERS if token == f"mock:{user.id}"), None)


_provider: AuthProvider = MockAuthProvider()
_bearer = HTTPBearer(auto_error=False)


def get_auth_provider() -> AuthProvider:
    return _provider


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    provider: AuthProvider = Depends(get_auth_provider),
) -> Identity:
    user = await provider.authenticate(credentials.credentials) if credentials else None
    if user is None:
        raise HTTPException(401, "Choose a demo user to continue")
    return user


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/users")
async def demo_users():
    """Mock-only account picker. Remove this route when enabling real auth."""
    return DEMO_USERS


@router.get("/me")
async def me(user: Identity = Depends(current_user)):
    return user
