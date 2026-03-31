from collections import defaultdict
from typing import Any, Dict
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from fastapi import WebSocket


class RoomConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, dict[str, WebSocket]]] = defaultdict(
            lambda: defaultdict(dict)
        )
        self._room_user_states: dict[str, dict[str, dict[str, Any]]] = defaultdict(
            lambda: defaultdict(dict)
        )

    async def connect(self, room_id: str, user_id: str, websocket: WebSocket) -> str:
        await websocket.accept()
        connection_id = uuid4().hex
        self._rooms[room_id][user_id][connection_id] = websocket
        return connection_id

    def disconnect(self, room_id: str, user_id: str, connection_id: str | None = None) -> None:
        room_connections = self._rooms.get(room_id)
        if not room_connections:
            return
        user_connections = room_connections.get(user_id)
        if not user_connections:
            return

        if connection_id is None:
            user_connections.clear()
        else:
            user_connections.pop(connection_id, None)

        if not user_connections:
            room_connections.pop(user_id, None)
            room_states = self._room_user_states.get(room_id)
            if room_states is not None:
                room_states.pop(user_id, None)
                if not room_states:
                    self._room_user_states.pop(room_id, None)
        if not room_connections:
            self._rooms.pop(room_id, None)

    def update_user_state(self, room_id: str, user_id: str, state_patch: Dict[str, Any]) -> Dict[str, Any]:
        allowed_keys = {"in_call", "screen_sharing", "video_enabled", "audio_enabled"}
        normalized_patch = {
            key: value
            for key, value in state_patch.items()
            if key in allowed_keys and isinstance(value, bool)
        }

        current_state = dict(self._room_user_states.get(room_id, {}).get(user_id, {}))
        current_state.update(normalized_patch)

        if current_state:
            self._room_user_states[room_id][user_id] = current_state
        else:
            room_states = self._room_user_states.get(room_id)
            if room_states is not None:
                room_states.pop(user_id, None)
                if not room_states:
                    self._room_user_states.pop(room_id, None)

        return current_state

    async def send_json(self, room_id: str, user_id: str, event: str, payload: Dict[str, Any]) -> None:
        user_connections = self._rooms.get(room_id, {}).get(user_id, {})
        if not user_connections:
            return
        stale_connections: list[str] = []
        for connection_id, websocket in user_connections.items():
            try:
                await websocket.send_json(
                    jsonable_encoder({"event": event, "payload": payload})
                )
            except Exception:
                stale_connections.append(connection_id)

        for connection_id in stale_connections:
            self.disconnect(room_id, user_id, connection_id)

    async def broadcast(self, room_id: str, event: str, payload: Dict[str, Any]) -> None:
        stale_connections: list[tuple[str, str]] = []
        room_connections = self._rooms.get(room_id, {})
        for user_id, connections in room_connections.items():
            for connection_id, websocket in connections.items():
                try:
                    await websocket.send_json(
                        jsonable_encoder({"event": event, "payload": payload})
                    )
                except Exception:
                    stale_connections.append((user_id, connection_id))

        for user_id, connection_id in stale_connections:
            self.disconnect(room_id, user_id, connection_id)

    def room_presence(self, room_id: str) -> Dict[str, Any]:
        room_connections = self._rooms.get(room_id, {})
        room_states = self._room_user_states.get(room_id, {})
        active_user_ids = [
            user_id for user_id, connections in room_connections.items() if connections
        ]
        active_connection_count = sum(
            len(connections) for connections in room_connections.values()
        )
        active_user_states = {
            user_id: room_states[user_id]
            for user_id in active_user_ids
            if user_id in room_states
        }
        return {
            "room_id": room_id,
            "active_user_ids": active_user_ids,
            "active_count": len(active_user_ids),
            "active_connection_count": active_connection_count,
            "active_user_states": active_user_states,
        }
