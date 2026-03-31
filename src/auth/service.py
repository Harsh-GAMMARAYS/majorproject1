from datetime import datetime, timezone
from typing import Any, Dict, Optional

from src.auth.security import (
    create_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    issue_refresh_token,
    verify_password,
)
from src.rooms.store import RoomStore


class AuthService:
    def __init__(
        self,
        store: RoomStore,
        *,
        jwt_secret: str,
        access_ttl_seconds: int,
        refresh_ttl_days: int,
    ) -> None:
        self.store = store
        self.jwt_secret = jwt_secret
        self.access_ttl_seconds = access_ttl_seconds
        self.refresh_ttl_days = refresh_ttl_days

    def _public_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": user["id"],
            "email": user.get("email"),
            "display_name": user["name"],
            "is_active": user.get("is_active", True),
            "is_admin": user.get("is_admin", False),
            "created_at": user.get("created_at"),
            "updated_at": user.get("updated_at"),
        }

    def _issue_access_token(self, user: Dict[str, Any]) -> str:
        return create_token(
            {
                "sub": user["id"],
                "email": user.get("email"),
                "display_name": user["name"],
                "is_admin": user.get("is_admin", False),
                "type": "access",
            },
            secret=self.jwt_secret,
            ttl_seconds=self.access_ttl_seconds,
        )

    def _issue_session(
        self,
        user: Dict[str, Any],
        *,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        refresh_token = issue_refresh_token()
        self.store.create_or_rotate_refresh_token(
            user_id=user["id"],
            token_hash=hash_refresh_token(refresh_token),
            ttl_days=self.refresh_ttl_days,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return {
            "access_token": self._issue_access_token(user),
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": self._public_user(user),
        }

    def register(
        self,
        *,
        email: str,
        display_name: str,
        password: str,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        user = self.store.create_authenticated_user(
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
        )
        return self._issue_session(user, user_agent=user_agent, ip_address=ip_address)

    def login(
        self,
        *,
        email: str,
        password: str,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        user = self.store.get_user_by_email(email)
        if not user or not user.get("password_hash"):
            raise ValueError("Invalid email or password.")
        if not verify_password(password, user["password_hash"]):
            raise ValueError("Invalid email or password.")
        if not user.get("is_active", True):
            raise ValueError("This account is disabled.")
        return self._issue_session(user, user_agent=user_agent, ip_address=ip_address)

    def refresh(
        self,
        refresh_token: str,
        *,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        refresh_record = self.store.get_refresh_token(hash_refresh_token(refresh_token))
        if not refresh_record:
            raise ValueError("Refresh token is invalid.")
        if refresh_record.get("revoked_at") is not None:
            raise ValueError("Refresh token has been revoked.")
        expires_at = refresh_record.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at is None or expires_at <= datetime.now(timezone.utc):
            raise ValueError("Refresh token has expired.")

        user = self.store.get_user_by_id(refresh_record["user_id"])
        if not user or not user.get("is_active", True):
            raise ValueError("User account is unavailable.")

        self.store.revoke_refresh_token(refresh_record["token_hash"])
        return self._issue_session(user, user_agent=user_agent, ip_address=ip_address)

    def logout(self, refresh_token: str) -> None:
        self.store.revoke_refresh_token(hash_refresh_token(refresh_token))

    def get_current_user(self, access_token: str) -> Dict[str, Any]:
        payload = decode_token(access_token, secret=self.jwt_secret)
        if payload.get("type") != "access":
            raise ValueError("Invalid token type.")
        user = self.store.get_user_by_id(payload["sub"])
        if not user or not user.get("is_active", True):
            raise ValueError("User account is unavailable.")
        return self._public_user(user)
