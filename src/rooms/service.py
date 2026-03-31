from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.generative.engine import (
    load_json,
    run_faq_generation,
    run_flashcards_generation,
    run_outline_generation,
    run_quiz_generation,
    run_summarization,
)
from src.knowledgeGraphPipeline import create_knowledge_graph_from_context
from src.rooms.store import RoomStore
from src.services.query_service import execute_deep_query, execute_general_query, execute_query

project_root = Path(__file__).parent.parent.parent
FILE_STATUS_PATH = project_root / "database" / "logs" / "file_status.json"


class RoomService:
    def __init__(self, store: RoomStore):
        self.store = store

    def _processed_file_set(self) -> set[str]:
        file_status = load_json(FILE_STATUS_PATH)
        return {
            filename
            for filename, details in file_status.items()
            if details.get("status") == "processed"
        }

    def get_owned_processed_files(self, user_id: str) -> List[str]:
        processed = self._processed_file_set()
        owned = self.store.list_uploaded_filenames_for_user(user_id)
        return [filename for filename in owned if filename in processed]

    def validate_context_files(self, user_id: str, filenames: List[str]) -> List[str]:
        self.store.assert_file_ownership(user_id, filenames)
        processed = set(self.get_owned_processed_files(user_id))
        invalid = [filename for filename in filenames if filename not in processed]
        if invalid:
            raise ValueError(
                "These files are not available as processed room context: "
                + ", ".join(sorted(invalid))
            )
        return filenames

    def build_conversation_context(self, room_id: str, limit: int = 30) -> str:
        messages = self.store.list_messages(room_id, limit=limit)
        lines: List[str] = []
        for message in messages:
            if message["message_type"] not in {"chat", "question", "answer", "system"}:
                continue
            lines.append(f'{message["user_name"]} ({message["message_type"]}): {message["content"]}')

        shared_files = self.get_room_context_filenames(room_id)
        artifacts = self.store.list_artifacts(room_id, limit=8)
        artifact_lines = [f'- {item["artifact_type"]}: {item["title"]}' for item in artifacts]

        sections: List[str] = []
        if shared_files:
            sections.append("Shared files in room context:\n" + "\n".join(f"- {name}" for name in shared_files[:30]))
        if artifact_lines:
            sections.append("Recent generated materials:\n" + "\n".join(artifact_lines))
        if lines:
            sections.append("Recent room conversation:\n" + "\n".join(lines))

        return "\n\n".join(sections)

    def get_room_context_filenames(self, room_id: str) -> List[str]:
        return [item["filename"] for item in self.store.list_context_files(room_id)]

    async def run_room_query(
        self,
        *,
        room_id: str,
        user_id: str,
        query: str,
        top_k: int,
        app_state: Any,
    ) -> Dict[str, Any]:
        self.store.ensure_member(room_id, user_id)
        allowed_filenames = self.get_room_context_filenames(room_id)
        supplemental_context = self.build_conversation_context(room_id)

        question_message = self.store.add_message(room_id, user_id, query, message_type="question")
        if app_state.index is None or app_state.ids is None:
            result = await execute_general_query(
                query=query,
                supplemental_context=supplemental_context,
            )
        else:
            result = await execute_query(
                query=query,
                top_k=top_k,
                index=app_state.index,
                ids=app_state.ids,
                vector_log=app_state.vector_log,
                chunk_traces=app_state.chunk_traces,
                store_type=app_state.store_type,
                allowed_filenames=allowed_filenames,
                supplemental_context=supplemental_context,
            )
            if not result.get("context"):
                result = await execute_general_query(
                    query=query,
                    supplemental_context=supplemental_context,
                )
        answer_message = self.store.add_message(
            room_id,
            user_id,
            result["answer"],
            message_type="answer",
            metadata={"filenames": result["filenames"]},
        )
        artifact = self.store.create_artifact(
            room_id,
            "query_answer",
            f"Answer: {query[:60]}",
            result,
            user_id,
        )
        result["artifact"] = artifact
        result["question_message"] = question_message
        result["answer_message"] = answer_message
        return result

    async def run_room_deep_query(
        self,
        *,
        room_id: str,
        user_id: str,
        query: str,
        top_k: int,
        create_graph: bool,
        app_state: Any,
    ) -> Dict[str, Any]:
        self.store.ensure_member(room_id, user_id)
        allowed_filenames = self.get_room_context_filenames(room_id)
        supplemental_context = self.build_conversation_context(room_id)

        question_message = self.store.add_message(room_id, user_id, query, message_type="question")
        if app_state.index is None or app_state.ids is None:
            result = await execute_general_query(
                query=query,
                supplemental_context=supplemental_context,
            )
            result["sub_queries"] = []
            result["graph_location"] = None
            result["graph_data"] = None
            if create_graph and supplemental_context.strip():
                kg_result = create_knowledge_graph_from_context(
                    supplemental_context,
                    output_path=f"assets/room_context_kg_{room_id}.html",
                )
                if kg_result and kg_result.get("html_location"):
                    result["graph_location"] = f"/graph/{kg_result['html_location']}"
                    result["graph_data"] = kg_result.get("graph_data")
        else:
            result = await execute_deep_query(
                query=query,
                top_k=top_k,
                create_graph=create_graph,
                index=app_state.index,
                ids=app_state.ids,
                vector_log=app_state.vector_log,
                chunk_traces=app_state.chunk_traces,
                store_type=app_state.store_type,
                allowed_filenames=allowed_filenames,
                supplemental_context=supplemental_context,
            )
            if not result.get("context"):
                fallback = await execute_general_query(
                    query=query,
                    supplemental_context=supplemental_context,
                )
                result.update(fallback)
                result["sub_queries"] = []
                result["graph_location"] = None
                result["graph_data"] = None
                if create_graph and supplemental_context.strip():
                    kg_result = create_knowledge_graph_from_context(
                        supplemental_context,
                        output_path=f"assets/room_context_kg_{room_id}.html",
                    )
                    if kg_result and kg_result.get("html_location"):
                        result["graph_location"] = f"/graph/{kg_result['html_location']}"
                        result["graph_data"] = kg_result.get("graph_data")
        answer_message = self.store.add_message(
            room_id,
            user_id,
            result["answer"],
            message_type="answer",
            metadata={
                "filenames": result.get("filenames", []),
                "sub_queries": result.get("sub_queries", []),
                "graph_location": result.get("graph_location"),
            },
        )
        artifact = self.store.create_artifact(
            room_id,
            "deep_query",
            f"Deep query: {query[:60]}",
            result,
            user_id,
        )
        result["artifact"] = artifact
        result["question_message"] = question_message
        result["answer_message"] = answer_message
        return result

    async def run_room_generation(
        self,
        *,
        room_id: str,
        user_id: str,
        action: str,
        filenames: List[str],
        options: Dict[str, Any],
    ) -> Dict[str, Any]:
        self.store.ensure_member(room_id, user_id)
        valid_filenames = self.validate_context_files(user_id, filenames)

        if action == "summarize":
            payload = {"summaries": await run_summarization(valid_filenames)}
        elif action == "faq":
            payload = {"faqs": await run_faq_generation(valid_filenames)}
        elif action == "flashcards":
            payload = {"flashcards": await run_flashcards_generation(valid_filenames)}
        elif action == "quiz":
            payload = {
                "quiz": await run_quiz_generation(
                    filenames=valid_filenames,
                    question_type=options.get("question_type", "mcq"),
                    count=options.get("count", 10),
                )
            }
        elif action == "outline":
            payload = await run_outline_generation(
                valid_filenames,
                options.get("combine", False),
            )
        else:
            raise ValueError("Unsupported room action.")

        artifact = self.store.create_artifact(
            room_id,
            action,
            f"{action}: {', '.join(valid_filenames[:2])}",
            payload,
            user_id,
        )
        system_message = self.store.add_message(
            room_id,
            user_id,
            f"{action} generated for {', '.join(valid_filenames)}",
            message_type="system",
            metadata={"artifact_id": artifact["id"], "action": action},
        )
        payload["artifact"] = artifact
        payload["system_message"] = system_message
        return payload

    def save_canvas_snapshot(
        self,
        *,
        room_id: str,
        user_id: str,
        board: Dict[str, Any],
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.store.ensure_member(room_id, user_id)
        snapshot_title = (title or "").strip() or "Live Canvas"
        snapshot_payload = {
            "board": board,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        return self.store.save_singleton_artifact(
            room_id,
            "canvas_snapshot",
            snapshot_title,
            snapshot_payload,
            user_id,
        )

    def get_latest_canvas_snapshot(
        self,
        *,
        room_id: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        self.store.ensure_member(room_id, user_id)
        for artifact in self.store.list_artifacts(room_id, limit=200):
            if artifact.get("artifact_type") == "canvas_snapshot":
                return artifact
        return None
