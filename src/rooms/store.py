import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

import psycopg
from psycopg.rows import dict_row

from src.auth.security import hash_password


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_display_name(value: str) -> str:
    return value.strip().upper()


class RoomStore:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.init_db()

    @contextmanager
    def connect(self):
        conn = psycopg.connect(self.database_url, row_factory=dict_row)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_db(self) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    email TEXT,
                    password_hash TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ,
                    last_seen_at TIMESTAMPTZ
                )
                """
            )
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT")
            conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"
            )
            conn.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
            )
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ")
            conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ")
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
                ON users (LOWER(email))
                WHERE email IS NOT NULL
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS rooms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    password_hash TEXT,
                    max_members INTEGER NOT NULL DEFAULT 5,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ
                )
                """
            )
            conn.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password_hash TEXT")
            conn.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS room_members (
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    joined_at TIMESTAMPTZ NOT NULL,
                    PRIMARY KEY (room_id, user_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS room_messages (
                    id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    message_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata_json JSONB,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS room_context_files (
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    added_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    added_at TIMESTAMPTZ NOT NULL,
                    PRIMARY KEY (room_id, filename)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS room_artifacts (
                    id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    artifact_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    payload_json JSONB NOT NULL,
                    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS room_invites (
                    id TEXT PRIMARY KEY,
                    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                    inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    invitee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    status TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    responded_at TIMESTAMPTZ,
                    UNIQUE (room_id, invitee_user_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    revoked_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL,
                    user_agent TEXT,
                    ip_address TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS file_uploads (
                    filename TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    uploaded_at TIMESTAMPTZ NOT NULL,
                    deleted_at TIMESTAMPTZ
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages(room_id, created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_room_context_files_room_id ON room_context_files(room_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_room_artifacts_room_created ON room_artifacts(room_id, created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_room_invites_invitee_status ON room_invites(invitee_user_id, status, created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_room_invites_room_status ON room_invites(room_id, status, created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_uploads_owner_user_id ON file_uploads(owner_user_id)"
            )

    def ensure_admin_account(
        self,
        *,
        email: str,
        password: str,
        display_name: str = "Admin",
    ) -> Dict[str, Any]:
        clean_email = email.strip().lower()
        clean_name = normalize_display_name(display_name) or "ADMIN"
        timestamp = utc_now()
        password_hash = hash_password(password)

        with self.connect() as conn:
            existing = conn.execute(
                """
                SELECT id
                FROM users
                WHERE LOWER(email) = LOWER(%s)
                """,
                (clean_email,),
            ).fetchone()

            if existing:
                conn.execute(
                    """
                    UPDATE users
                    SET
                        name = %s,
                        password_hash = %s,
                        is_active = TRUE,
                        is_admin = TRUE,
                        updated_at = %s,
                        last_seen_at = %s
                    WHERE id = %s
                    """,
                    (clean_name, password_hash, timestamp, timestamp, existing["id"]),
                )
                return self.get_user_by_id(existing["id"]) or {}

            conflicting_name = conn.execute(
                "SELECT id FROM users WHERE name = %s",
                (clean_name,),
            ).fetchone()
            if conflicting_name:
                clean_name = f"{clean_name}-{uuid.uuid4().hex[:6]}"

            user_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO users (
                    id, name, email, password_hash, is_active, is_admin, created_at, updated_at, last_seen_at
                )
                VALUES (%s, %s, %s, %s, TRUE, TRUE, %s, %s, %s)
                """,
                (user_id, clean_name, clean_email, password_hash, timestamp, timestamp, timestamp),
            )

        return self.get_user_by_email(clean_email) or {}

    def _fetch_room(self, conn: psycopg.Connection, room_id: str) -> Optional[Dict[str, Any]]:
        row = conn.execute(
            """
            SELECT
                rooms.id,
                rooms.name,
                rooms.owner_user_id,
                owner.name AS owner_name,
                rooms.max_members,
                rooms.created_at,
                COUNT(room_members.user_id) AS member_count
            FROM rooms
            JOIN users AS owner ON owner.id = rooms.owner_user_id
            LEFT JOIN room_members ON room_members.room_id = rooms.id
            WHERE rooms.id = %s
            GROUP BY rooms.id, owner.name
            """,
            (room_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_or_create_user(self, name: str) -> Dict[str, Any]:
        clean_name = normalize_display_name(name)
        if not clean_name:
            raise ValueError("User name is required.")

        with self.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE name = %s", (clean_name,)).fetchone()
            if row:
                return dict(row)

            user = {"id": uuid.uuid4().hex, "name": clean_name, "created_at": utc_now()}
            conn.execute(
                "INSERT INTO users (id, name, created_at, updated_at, last_seen_at) VALUES (%s, %s, %s, %s, %s)",
                (user["id"], user["name"], user["created_at"], user["created_at"], user["created_at"]),
            )
            return user

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, name, email, is_active, is_admin, created_at, updated_at, last_seen_at
                FROM users
                WHERE id = %s
                """,
                (user_id,),
            ).fetchone()
            return dict(row) if row else None

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, name, email, password_hash, is_active, is_admin, created_at, updated_at, last_seen_at
                FROM users
                WHERE LOWER(email) = LOWER(%s)
                """,
                (email.strip(),),
            ).fetchone()
            return dict(row) if row else None

    def create_authenticated_user(
        self,
        *,
        email: str,
        display_name: str,
        password_hash: str,
    ) -> Dict[str, Any]:
        clean_email = email.strip().lower()
        clean_name = normalize_display_name(display_name)
        if not clean_email:
            raise ValueError("Email is required.")
        if not clean_name:
            raise ValueError("Display name is required.")

        if self.get_user_by_email(clean_email):
            raise ValueError("An account already exists for this email.")

        created_at = utc_now()
        user = {
            "id": uuid.uuid4().hex,
            "name": clean_name,
            "email": clean_email,
            "password_hash": password_hash,
            "is_active": True,
            "is_admin": False,
            "created_at": created_at,
            "updated_at": created_at,
            "last_seen_at": created_at,
        }

        with self.connect() as conn:
            existing_name = conn.execute(
                "SELECT 1 FROM users WHERE name = %s",
                (clean_name,),
            ).fetchone()
            if existing_name:
                raise ValueError("Display name is already in use.")

            conn.execute(
                """
                INSERT INTO users (id, name, email, password_hash, is_active, created_at, updated_at, last_seen_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user["id"],
                    user["name"],
                    user["email"],
                    user["password_hash"],
                    user["is_active"],
                    user["created_at"],
                    user["updated_at"],
                    user["last_seen_at"],
                ),
            )
        return self.get_user_by_id(user["id"]) or user

    def touch_user_activity(self, user_id: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE users
                SET last_seen_at = %s
                WHERE id = %s
                """,
                (utc_now(), user_id),
            )

    def list_users_admin(self) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    u.is_active,
                    u.is_admin,
                    u.created_at,
                    u.updated_at,
                    u.last_seen_at,
                    CASE
                        WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= NOW() - INTERVAL '5 minutes'
                        THEN TRUE
                        ELSE FALSE
                    END AS is_online,
                    COALESCE(created_rooms.created_room_count, 0) AS created_room_count,
                    COALESCE(created_rooms.created_rooms, '[]'::jsonb) AS created_rooms,
                    COALESCE(joined_rooms.joined_room_count, 0) AS joined_room_count,
                    COALESCE(context_usage.context_file_count, 0) AS context_file_count,
                    COALESCE(messages.message_count, 0) AS message_count,
                    COALESCE(artifacts.artifact_count, 0) AS artifact_count,
                    COALESCE(uploads.uploaded_file_count, 0) AS uploaded_file_count
                FROM users u
                LEFT JOIN (
                    SELECT
                        owner_user_id,
                        COUNT(*) AS created_room_count,
                        jsonb_agg(
                            jsonb_build_object('id', id, 'name', name)
                            ORDER BY created_at DESC
                        ) AS created_rooms
                    FROM rooms
                    GROUP BY owner_user_id
                ) AS created_rooms ON created_rooms.owner_user_id = u.id
                LEFT JOIN (
                    SELECT user_id, COUNT(*) AS joined_room_count
                    FROM room_members
                    GROUP BY user_id
                ) AS joined_rooms ON joined_rooms.user_id = u.id
                LEFT JOIN (
                    SELECT added_by, COUNT(*) AS context_file_count
                    FROM room_context_files
                    GROUP BY added_by
                ) AS context_usage ON context_usage.added_by = u.id
                LEFT JOIN (
                    SELECT user_id, COUNT(*) AS message_count
                    FROM room_messages
                    GROUP BY user_id
                ) AS messages ON messages.user_id = u.id
                LEFT JOIN (
                    SELECT created_by, COUNT(*) AS artifact_count
                    FROM room_artifacts
                    GROUP BY created_by
                ) AS artifacts ON artifacts.created_by = u.id
                LEFT JOIN (
                    SELECT owner_user_id, COUNT(*) AS uploaded_file_count
                    FROM file_uploads
                    WHERE deleted_at IS NULL
                    GROUP BY owner_user_id
                ) AS uploads ON uploads.owner_user_id = u.id
                ORDER BY u.is_admin DESC, u.created_at ASC
                """
            ).fetchall()
            return [dict(row) for row in rows]

    def register_uploaded_files(self, user_id: str, filenames: Iterable[str]) -> None:
        clean_filenames = [filename.strip() for filename in filenames if filename and filename.strip()]
        if not clean_filenames:
            return

        uploaded_at = utc_now()
        with self.connect() as conn:
            for filename in clean_filenames:
                existing = conn.execute(
                    """
                    SELECT owner_user_id, deleted_at
                    FROM file_uploads
                    WHERE filename = %s
                    """,
                    (filename,),
                ).fetchone()

                if existing and existing["deleted_at"] is None and existing["owner_user_id"] != user_id:
                    raise ValueError(f"File '{filename}' already exists under another account.")

                if existing:
                    conn.execute(
                        """
                        UPDATE file_uploads
                        SET owner_user_id = %s, uploaded_at = %s, deleted_at = NULL
                        WHERE filename = %s
                        """,
                        (user_id, uploaded_at, filename),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO file_uploads (filename, owner_user_id, uploaded_at, deleted_at)
                        VALUES (%s, %s, %s, NULL)
                        """,
                        (filename, user_id, uploaded_at),
                    )

    def list_uploaded_filenames_for_user(
        self,
        user_id: str,
        *,
        include_deleted: bool = False,
    ) -> List[str]:
        query = """
            SELECT filename
            FROM file_uploads
            WHERE owner_user_id = %s
        """
        params: tuple[Any, ...] = (user_id,)
        if not include_deleted:
            query += " AND deleted_at IS NULL"
        query += " ORDER BY uploaded_at ASC"

        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
            return [row["filename"] for row in rows]

    def assert_file_ownership(self, user_id: str, filenames: Iterable[str]) -> List[str]:
        clean_filenames = [filename.strip() for filename in filenames if filename and filename.strip()]
        if not clean_filenames:
            return []

        owned = set(self.list_uploaded_filenames_for_user(user_id))
        invalid = [filename for filename in clean_filenames if filename not in owned]
        if invalid:
            raise ValueError(
                "These files do not belong to the current user: " + ", ".join(sorted(invalid))
            )
        return clean_filenames

    def mark_uploaded_files_deleted(self, user_id: str, filenames: Iterable[str]) -> None:
        clean_filenames = self.assert_file_ownership(user_id, filenames)
        if not clean_filenames:
            return

        deleted_at = utc_now()
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE file_uploads
                SET deleted_at = %s
                WHERE owner_user_id = %s AND filename = ANY(%s)
                """,
                (deleted_at, user_id, clean_filenames),
            )

    def update_user_admin(
        self,
        user_id: str,
        *,
        display_name: Optional[str] = None,
        email: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        with self.connect() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
            if not user:
                raise ValueError("User not found.")
            user = dict(user)
            if user.get("is_admin"):
                raise ValueError("Admin account cannot be edited from this panel.")

            next_name = user["name"] if display_name is None else normalize_display_name(display_name)
            next_email = user.get("email") if email is None else email.strip().lower()
            next_active = user.get("is_active", True) if is_active is None else is_active

            if not next_name:
                raise ValueError("Display name is required.")
            if next_email:
                existing_email = conn.execute(
                    "SELECT id FROM users WHERE LOWER(email) = LOWER(%s) AND id <> %s",
                    (next_email, user_id),
                ).fetchone()
                if existing_email:
                    raise ValueError("Email is already in use.")
            existing_name = conn.execute(
                "SELECT id FROM users WHERE name = %s AND id <> %s",
                (next_name, user_id),
            ).fetchone()
            if existing_name:
                raise ValueError("Display name is already in use.")

            conn.execute(
                """
                UPDATE users
                SET name = %s, email = %s, is_active = %s, updated_at = %s
                WHERE id = %s
                """,
                (next_name, next_email or None, next_active, utc_now(), user_id),
            )

        return self.get_user_by_id(user_id) or {}

    def delete_user_admin(self, user_id: str) -> None:
        with self.connect() as conn:
            user = conn.execute("SELECT is_admin FROM users WHERE id = %s", (user_id,)).fetchone()
            if not user:
                raise ValueError("User not found.")
            if user["is_admin"]:
                raise ValueError("Admin account cannot be deleted.")
            deleted = conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
            if deleted.rowcount == 0:
                raise ValueError("User not found.")

    def list_rooms_admin(self) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    r.id,
                    r.name,
                    r.owner_user_id,
                    owner.name AS owner_name,
                    owner.email AS owner_email,
                    r.max_members,
                    r.created_at,
                    COUNT(DISTINCT rm.user_id) AS member_count,
                    COUNT(DISTINCT rcf.filename) AS context_file_count,
                    COUNT(DISTINCT msg.id) AS message_count,
                    COUNT(DISTINCT art.id) AS artifact_count
                FROM rooms r
                JOIN users owner ON owner.id = r.owner_user_id
                LEFT JOIN room_members rm ON rm.room_id = r.id
                LEFT JOIN room_context_files rcf ON rcf.room_id = r.id
                LEFT JOIN room_messages msg ON msg.room_id = r.id
                LEFT JOIN room_artifacts art ON art.room_id = r.id
                GROUP BY r.id, owner.name, owner.email
                ORDER BY r.created_at DESC
                """
            ).fetchall()
            return [dict(row) for row in rows]

    def update_room_admin(
        self,
        room_id: str,
        *,
        name: Optional[str] = None,
        max_members: Optional[int] = None,
    ) -> Dict[str, Any]:
        with self.connect() as conn:
            room = conn.execute("SELECT * FROM rooms WHERE id = %s", (room_id,)).fetchone()
            if not room:
                raise ValueError("Room not found.")
            room = dict(room)
            next_name = room["name"] if name is None else name.strip()
            next_max_members = room["max_members"] if max_members is None else max_members
            if not next_name:
                raise ValueError("Room name is required.")
            if next_max_members < 2 or next_max_members > 5:
                raise ValueError("Room size must be between 2 and 5 members.")
            conn.execute(
                """
                UPDATE rooms
                SET name = %s, max_members = %s
                WHERE id = %s
                """,
                (next_name, next_max_members, room_id),
            )
        return self.get_room(room_id)

    def delete_room_admin(self, room_id: str) -> None:
        with self.connect() as conn:
            deleted = conn.execute("DELETE FROM rooms WHERE id = %s", (room_id,))
            if deleted.rowcount == 0:
                raise ValueError("Room not found.")

    def create_or_rotate_refresh_token(
        self,
        *,
        user_id: str,
        token_hash: str,
        ttl_days: int,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        created_at = datetime.now(timezone.utc)
        refresh_token = {
            "id": uuid.uuid4().hex,
            "user_id": user_id,
            "token_hash": token_hash,
            "expires_at": created_at + timedelta(days=ttl_days),
            "revoked_at": None,
            "created_at": created_at,
            "user_agent": user_agent,
            "ip_address": ip_address,
        }
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO refresh_tokens (
                    id, user_id, token_hash, expires_at, revoked_at, created_at, user_agent, ip_address
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    refresh_token["id"],
                    refresh_token["user_id"],
                    refresh_token["token_hash"],
                    refresh_token["expires_at"],
                    refresh_token["revoked_at"],
                    refresh_token["created_at"],
                    refresh_token["user_agent"],
                    refresh_token["ip_address"],
                ),
            )
        return refresh_token

    def get_refresh_token(self, token_hash: str) -> Optional[Dict[str, Any]]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM refresh_tokens
                WHERE token_hash = %s
                """,
                (token_hash,),
            ).fetchone()
            return dict(row) if row else None

    def revoke_refresh_token(self, token_hash: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE refresh_tokens
                SET revoked_at = %s
                WHERE token_hash = %s AND revoked_at IS NULL
                """,
                (datetime.now(timezone.utc), token_hash),
            )

    def revoke_all_refresh_tokens_for_user(self, user_id: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE refresh_tokens
                SET revoked_at = %s
                WHERE user_id = %s AND revoked_at IS NULL
                """,
                (datetime.now(timezone.utc), user_id),
            )

    def create_room(
        self,
        name: str,
        owner_user_id: str,
        max_members: int = 5,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not name.strip():
            raise ValueError("Room name is required.")
        if max_members < 2 or max_members > 5:
            raise ValueError("Room size must be between 2 and 5 members.")
        owner = self.get_user_by_id(owner_user_id)
        if not owner:
            raise ValueError("Owner account not found.")
        room = {
            "id": uuid.uuid4().hex,
            "name": name.strip(),
            "owner_user_id": owner["id"],
            "password_hash": password,
            "max_members": max_members,
            "created_at": utc_now(),
            "updated_at": utc_now(),
        }

        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO rooms (id, name, owner_user_id, password_hash, max_members, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    room["id"],
                    room["name"],
                    room["owner_user_id"],
                    room["password_hash"],
                    room["max_members"],
                    room["created_at"],
                    room["updated_at"],
                ),
            )
            conn.execute(
                "INSERT INTO room_members (room_id, user_id, joined_at) VALUES (%s, %s, %s)",
                (room["id"], owner["id"], utc_now()),
            )

        created = self.get_room(room["id"])
        created["joined_user"] = owner
        return created

    def list_rooms(self) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    rooms.id,
                    rooms.name,
                    rooms.owner_user_id,
                    owner.name AS owner_name,
                    rooms.max_members,
                    rooms.created_at,
                    rooms.updated_at,
                    (COALESCE(rooms.password_hash, '') <> '') AS has_password,
                    COUNT(room_members.user_id) AS member_count
                FROM rooms
                JOIN users AS owner ON owner.id = rooms.owner_user_id
                LEFT JOIN room_members ON room_members.room_id = rooms.id
                GROUP BY rooms.id, owner.name
                ORDER BY rooms.created_at DESC
                """
            ).fetchall()
            return [dict(row) for row in rows]

    def get_room(self, room_id: str) -> Dict[str, Any]:
        with self.connect() as conn:
            room = self._fetch_room(conn, room_id)
            if not room:
                raise ValueError("Room not found.")
            room_row = conn.execute(
                "SELECT password_hash, updated_at FROM rooms WHERE id = %s",
                (room_id,),
            ).fetchone()
            room["has_password"] = bool(room_row and room_row.get("password_hash"))
            room["updated_at"] = room_row.get("updated_at") if room_row else None
            room["members"] = self.list_members(room_id)
            room["context_files"] = self.list_context_files(room_id)
            room["pending_invites"] = self.list_room_invites(room_id)
            return room

    def get_room_password_for_owner(self, room_id: str, owner_user_id: str) -> Optional[str]:
        self.ensure_owner(room_id, owner_user_id)
        with self.connect() as conn:
            row = conn.execute(
                "SELECT password_hash FROM rooms WHERE id = %s",
                (room_id,),
            ).fetchone()
            if not row:
                raise ValueError("Room not found.")
            return row.get("password_hash")

    def list_members(self, room_id: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT users.id, users.name, room_members.joined_at
                FROM room_members
                JOIN users ON users.id = room_members.user_id
                WHERE room_members.room_id = %s
                ORDER BY room_members.joined_at ASC
                """,
                (room_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def join_room(
        self,
        room_id: str,
        user_id: str,
        *,
        password: Optional[str] = None,
        allow_via_invite: bool = True,
    ) -> Dict[str, Any]:
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("Account not found.")

        with self.connect() as conn:
            room = self._fetch_room(conn, room_id)
            if not room:
                raise ValueError("Room not found.")

            room_secret = conn.execute(
                "SELECT password_hash FROM rooms WHERE id = %s",
                (room_id,),
            ).fetchone()
            password_hash = room_secret["password_hash"] if room_secret else None

            existing = conn.execute(
                "SELECT 1 FROM room_members WHERE room_id = %s AND user_id = %s",
                (room_id, user["id"]),
            ).fetchone()
            if not existing and room["member_count"] >= room["max_members"]:
                raise ValueError("Room is full.")

            invite_record = None
            if allow_via_invite:
                invite_record = conn.execute(
                    """
                    SELECT id, status
                    FROM room_invites
                    WHERE room_id = %s AND invitee_user_id = %s
                    """,
                    (room_id, user["id"]),
                ).fetchone()

            if not existing and password_hash:
                has_valid_invite = bool(invite_record and invite_record["status"] == "pending")
                is_owner = room["owner_user_id"] == user["id"]
                if not has_valid_invite and not is_owner:
                    if password != password_hash:
                        raise ValueError("Room password is required or invalid.")

            if not existing:
                conn.execute(
                    "INSERT INTO room_members (room_id, user_id, joined_at) VALUES (%s, %s, %s)",
                    (room_id, user["id"], utc_now()),
                )
                if invite_record and invite_record["status"] == "pending":
                    conn.execute(
                        """
                        UPDATE room_invites
                        SET status = 'accepted', responded_at = %s
                        WHERE id = %s
                        """,
                        (utc_now(), invite_record["id"]),
                    )

        joined_room = self.get_room(room_id)
        joined_room["joined_user"] = user
        return joined_room

    def leave_room(self, room_id: str, user_id: str) -> Dict[str, Any]:
        with self.connect() as conn:
            deleted = conn.execute(
                "DELETE FROM room_members WHERE room_id = %s AND user_id = %s",
                (room_id, user_id),
            )
            if deleted.rowcount == 0:
                raise ValueError("Room membership not found.")

        return self.get_room(room_id)

    def ensure_owner(self, room_id: str, user_id: str) -> None:
        with self.connect() as conn:
            room = conn.execute(
                "SELECT owner_user_id FROM rooms WHERE id = %s",
                (room_id,),
            ).fetchone()
            if not room:
                raise ValueError("Room not found.")
            if room["owner_user_id"] != user_id:
                raise ValueError("Only the room owner can perform this action.")

    def update_room_owner(
        self,
        room_id: str,
        owner_user_id: str,
        *,
        name: Optional[str] = None,
        max_members: Optional[int] = None,
        password: Optional[str] = None,
        clear_password: bool = False,
    ) -> Dict[str, Any]:
        self.ensure_owner(room_id, owner_user_id)

        with self.connect() as conn:
            room = conn.execute(
                "SELECT name, max_members FROM rooms WHERE id = %s",
                (room_id,),
            ).fetchone()
            if not room:
                raise ValueError("Room not found.")

            next_name = room["name"] if name is None else name.strip()
            if not next_name:
                raise ValueError("Room name is required.")

            next_max_members = room["max_members"] if max_members is None else max_members
            if next_max_members < 2 or next_max_members > 5:
                raise ValueError("Room size must be between 2 and 5 members.")

            if clear_password:
                next_password_hash = None
            elif password is not None:
                next_password_hash = password
            else:
                existing = conn.execute(
                    "SELECT password_hash FROM rooms WHERE id = %s",
                    (room_id,),
                ).fetchone()
                next_password_hash = existing["password_hash"] if existing else None

            conn.execute(
                """
                UPDATE rooms
                SET name = %s, max_members = %s, password_hash = %s, updated_at = %s
                WHERE id = %s
                """,
                (next_name, next_max_members, next_password_hash, utc_now(), room_id),
            )

        return self.get_room(room_id)

    def delete_room_owner(self, room_id: str, owner_user_id: str) -> None:
        self.ensure_owner(room_id, owner_user_id)
        with self.connect() as conn:
            deleted = conn.execute("DELETE FROM rooms WHERE id = %s", (room_id,))
            if deleted.rowcount == 0:
                raise ValueError("Room not found.")

    def kick_member(self, room_id: str, owner_user_id: str, member_user_id: str) -> Dict[str, Any]:
        self.ensure_owner(room_id, owner_user_id)
        if owner_user_id == member_user_id:
            raise ValueError("Owner cannot kick themselves.")

        with self.connect() as conn:
            deleted = conn.execute(
                "DELETE FROM room_members WHERE room_id = %s AND user_id = %s",
                (room_id, member_user_id),
            )
            if deleted.rowcount == 0:
                raise ValueError("Target user is not a room member.")

            conn.execute(
                """
                UPDATE room_invites
                SET status = 'cancelled', responded_at = %s
                WHERE room_id = %s AND invitee_user_id = %s AND status = 'pending'
                """,
                (utc_now(), room_id, member_user_id),
            )

        return self.get_room(room_id)

    def create_room_invite(
        self,
        room_id: str,
        inviter_user_id: str,
        invitee_username: str,
    ) -> Dict[str, Any]:
        self.ensure_owner(room_id, inviter_user_id)
        invitee_name = normalize_display_name(invitee_username)
        if not invitee_name:
            raise ValueError("Invitee username is required.")

        with self.connect() as conn:
            invitee = conn.execute(
                "SELECT id, name FROM users WHERE name = %s",
                (invitee_name,),
            ).fetchone()
            if not invitee:
                raise ValueError("Invitee user not found.")
            if invitee["id"] == inviter_user_id:
                raise ValueError("You cannot invite yourself.")

            member = conn.execute(
                "SELECT 1 FROM room_members WHERE room_id = %s AND user_id = %s",
                (room_id, invitee["id"]),
            ).fetchone()
            if member:
                raise ValueError("User is already a room member.")

            existing = conn.execute(
                "SELECT id, status FROM room_invites WHERE room_id = %s AND invitee_user_id = %s",
                (room_id, invitee["id"]),
            ).fetchone()
            if existing and existing["status"] == "pending":
                raise ValueError("An active invite already exists for this user.")

            invite_id = existing["id"] if existing else uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO room_invites (id, room_id, inviter_user_id, invitee_user_id, status, created_at, responded_at)
                VALUES (%s, %s, %s, %s, 'pending', %s, NULL)
                ON CONFLICT (room_id, invitee_user_id)
                DO UPDATE SET
                    inviter_user_id = EXCLUDED.inviter_user_id,
                    status = 'pending',
                    created_at = EXCLUDED.created_at,
                    responded_at = NULL
                """,
                (invite_id, room_id, inviter_user_id, invitee["id"], utc_now()),
            )

        return self.get_room_invite(invite_id)

    def list_room_invites(self, room_id: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    invites.id,
                    invites.room_id,
                    invites.inviter_user_id,
                    inviter.name AS inviter_name,
                    invites.invitee_user_id,
                    invitee.name AS invitee_name,
                    invites.status,
                    invites.created_at,
                    invites.responded_at
                FROM room_invites AS invites
                JOIN users AS inviter ON inviter.id = invites.inviter_user_id
                JOIN users AS invitee ON invitee.id = invites.invitee_user_id
                WHERE invites.room_id = %s
                ORDER BY invites.created_at DESC
                """,
                (room_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def list_received_invites(self, user_id: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    invites.id,
                    invites.room_id,
                    rooms.name AS room_name,
                    rooms.owner_user_id,
                    owner.name AS owner_name,
                    invites.inviter_user_id,
                    inviter.name AS inviter_name,
                    invites.invitee_user_id,
                    invitee.name AS invitee_name,
                    invites.status,
                    invites.created_at,
                    invites.responded_at,
                    (COALESCE(rooms.password_hash, '') <> '') AS room_has_password
                FROM room_invites AS invites
                JOIN rooms ON rooms.id = invites.room_id
                JOIN users AS owner ON owner.id = rooms.owner_user_id
                JOIN users AS inviter ON inviter.id = invites.inviter_user_id
                JOIN users AS invitee ON invitee.id = invites.invitee_user_id
                WHERE invites.invitee_user_id = %s
                ORDER BY invites.created_at DESC
                """,
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def get_room_invite(self, invite_id: str) -> Dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT
                    invites.id,
                    invites.room_id,
                    rooms.name AS room_name,
                    rooms.owner_user_id,
                    owner.name AS owner_name,
                    invites.inviter_user_id,
                    inviter.name AS inviter_name,
                    invites.invitee_user_id,
                    invitee.name AS invitee_name,
                    invites.status,
                    invites.created_at,
                    invites.responded_at,
                    (COALESCE(rooms.password_hash, '') <> '') AS room_has_password
                FROM room_invites AS invites
                JOIN rooms ON rooms.id = invites.room_id
                JOIN users AS owner ON owner.id = rooms.owner_user_id
                JOIN users AS inviter ON inviter.id = invites.inviter_user_id
                JOIN users AS invitee ON invitee.id = invites.invitee_user_id
                WHERE invites.id = %s
                """,
                (invite_id,),
            ).fetchone()
            if not row:
                raise ValueError("Invite not found.")
            return dict(row)

    def respond_to_invite(
        self,
        invite_id: str,
        user_id: str,
        *,
        accept: bool,
    ) -> Dict[str, Any]:
        with self.connect() as conn:
            invite = conn.execute(
                "SELECT * FROM room_invites WHERE id = %s",
                (invite_id,),
            ).fetchone()
            if not invite:
                raise ValueError("Invite not found.")
            invite = dict(invite)

            if invite["invitee_user_id"] != user_id:
                raise ValueError("Invite does not belong to the current user.")
            if invite["status"] != "pending":
                raise ValueError("Invite has already been handled.")

            if accept:
                room = self._fetch_room(conn, invite["room_id"])
                if not room:
                    raise ValueError("Room not found.")
                existing = conn.execute(
                    "SELECT 1 FROM room_members WHERE room_id = %s AND user_id = %s",
                    (invite["room_id"], user_id),
                ).fetchone()
                if not existing and room["member_count"] >= room["max_members"]:
                    raise ValueError("Room is full.")
                if not existing:
                    conn.execute(
                        "INSERT INTO room_members (room_id, user_id, joined_at) VALUES (%s, %s, %s)",
                        (invite["room_id"], user_id, utc_now()),
                    )

            conn.execute(
                """
                UPDATE room_invites
                SET status = %s, responded_at = %s
                WHERE id = %s
                """,
                ("accepted" if accept else "declined", utc_now(), invite_id),
            )

        return self.get_room_invite(invite_id)

    def ensure_member(self, room_id: str, user_id: str) -> None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM room_members WHERE room_id = %s AND user_id = %s",
                (room_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("User is not a member of this room.")

    def add_message(
        self,
        room_id: str,
        user_id: str,
        content: str,
        message_type: str = "chat",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self.ensure_member(room_id, user_id)
        if not content.strip():
            raise ValueError("Message content is required.")

        message = {
            "id": uuid.uuid4().hex,
            "room_id": room_id,
            "user_id": user_id,
            "message_type": message_type,
            "content": content.strip(),
            "metadata_json": json.dumps(metadata or {}),
            "created_at": utc_now(),
        }

        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO room_messages (id, room_id, user_id, message_type, content, metadata_json, created_at)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (
                    message["id"],
                    message["room_id"],
                    message["user_id"],
                    message["message_type"],
                    message["content"],
                    message["metadata_json"],
                    message["created_at"],
                ),
            )

        return self.list_messages(room_id, limit=1)[0]

    def list_messages(self, room_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    room_messages.id,
                    room_messages.room_id,
                    room_messages.user_id,
                    users.name AS user_name,
                    room_messages.message_type,
                    room_messages.content,
                    room_messages.metadata_json,
                    room_messages.created_at
                FROM room_messages
                JOIN users ON users.id = room_messages.user_id
                WHERE room_messages.room_id = %s
                ORDER BY room_messages.created_at DESC
                LIMIT %s
                """,
                (room_id, limit),
            ).fetchall()

        messages = []
        for row in reversed(rows):
            item = dict(row)
            metadata = item.pop("metadata_json") or {}
            if isinstance(metadata, str):
                metadata = json.loads(metadata)
            item["metadata"] = metadata
            messages.append(item)
        return messages

    def add_context_files(self, room_id: str, user_id: str, filenames: Iterable[str]) -> List[Dict[str, Any]]:
        self.ensure_member(room_id, user_id)
        clean_filenames = [filename.strip() for filename in filenames if filename and filename.strip()]
        added_at = utc_now()

        with self.connect() as conn:
            for filename in clean_filenames:
                conn.execute(
                    """
                    INSERT INTO room_context_files (room_id, filename, added_by, added_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (room_id, filename) DO NOTHING
                    """,
                    (room_id, filename, user_id, added_at),
                )

        return self.list_context_files(room_id)

    def list_context_files(self, room_id: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT room_context_files.filename, room_context_files.added_at, users.name AS added_by_name
                FROM room_context_files
                JOIN users ON users.id = room_context_files.added_by
                WHERE room_context_files.room_id = %s
                ORDER BY room_context_files.added_at ASC
                """,
                (room_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def remove_context_file(self, room_id: str, filename: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            conn.execute(
                "DELETE FROM room_context_files WHERE room_id = %s AND filename = %s",
                (room_id, filename),
            )
        return self.list_context_files(room_id)

    def create_artifact(
        self,
        room_id: str,
        artifact_type: str,
        title: str,
        payload: Dict[str, Any],
        created_by: str,
    ) -> Dict[str, Any]:
        self.ensure_member(room_id, created_by)
        artifact = {
            "id": uuid.uuid4().hex,
            "room_id": room_id,
            "artifact_type": artifact_type,
            "title": title.strip() or artifact_type,
            "payload_json": json.dumps(payload),
            "created_by": created_by,
            "created_at": utc_now(),
        }

        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO room_artifacts (id, room_id, artifact_type, title, payload_json, created_by, created_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                """,
                (
                    artifact["id"],
                    artifact["room_id"],
                    artifact["artifact_type"],
                    artifact["title"],
                    artifact["payload_json"],
                    artifact["created_by"],
                    artifact["created_at"],
                ),
            )

        return self.list_artifacts(room_id, limit=1)[0]

    def save_singleton_artifact(
        self,
        room_id: str,
        artifact_type: str,
        title: str,
        payload: Dict[str, Any],
        created_by: str,
    ) -> Dict[str, Any]:
        self.ensure_member(room_id, created_by)
        now = utc_now()
        clean_title = title.strip() or artifact_type
        payload_json = json.dumps(payload)

        with self.connect() as conn:
            existing = conn.execute(
                """
                SELECT id
                FROM room_artifacts
                WHERE room_id = %s AND artifact_type = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (room_id, artifact_type),
            ).fetchone()

            if existing:
                artifact_id = existing["id"]
                conn.execute(
                    """
                    UPDATE room_artifacts
                    SET title = %s,
                        payload_json = %s::jsonb,
                        created_by = %s,
                        created_at = %s
                    WHERE id = %s
                    """,
                    (clean_title, payload_json, created_by, now, artifact_id),
                )
            else:
                artifact_id = uuid.uuid4().hex
                conn.execute(
                    """
                    INSERT INTO room_artifacts (id, room_id, artifact_type, title, payload_json, created_by, created_at)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                    """,
                    (artifact_id, room_id, artifact_type, clean_title, payload_json, created_by, now),
                )

            conn.execute(
                """
                DELETE FROM room_artifacts
                WHERE room_id = %s
                  AND artifact_type = %s
                  AND id <> %s
                """,
                (room_id, artifact_type, artifact_id),
            )

        artifacts = self.list_artifacts(room_id, limit=200)
        for artifact in artifacts:
            if artifact["id"] == artifact_id:
                return artifact
        return self.list_artifacts(room_id, limit=1)[0]

    def list_artifacts(self, room_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    room_artifacts.id,
                    room_artifacts.room_id,
                    room_artifacts.artifact_type,
                    room_artifacts.title,
                    room_artifacts.payload_json,
                    room_artifacts.created_by,
                    users.name AS created_by_name,
                    room_artifacts.created_at
                FROM room_artifacts
                JOIN users ON users.id = room_artifacts.created_by
                WHERE room_artifacts.room_id = %s
                ORDER BY room_artifacts.created_at DESC
                LIMIT %s
                """,
                (room_id, limit),
            ).fetchall()

        artifacts = []
        for row in rows:
            item = dict(row)
            payload = item.pop("payload_json") or {}
            if isinstance(payload, str):
                payload = json.loads(payload)
            item["payload"] = payload
            artifacts.append(item)
        return artifacts
