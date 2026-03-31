from typing import Any, Dict, Iterable, List, Optional, Sequence

import httpx

from src.retrieverPipeline import retrieve_chunks

INFERENCE_SERVER_URL = "http://127.0.0.1:8000/infer"


async def _infer_with_context(query_prompt: str, context: str) -> str:
    payload = {
        "query": query_prompt,
        "context": context,
        "model": "large",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(INFERENCE_SERVER_URL, json=payload)
        response.raise_for_status()
        answer = response.json().get("result", "No answer could be generated.")

    if not isinstance(answer, str):
        return str(answer)
    return answer


def _normalize_filename_filter(allowed_filenames: Optional[Sequence[str]]) -> Optional[set[str]]:
    if allowed_filenames is None:
        return None
    return {filename for filename in allowed_filenames if filename}


def filter_retrieved_data(
    retrieved_data: Iterable[Dict[str, Any]],
    allowed_filenames: Optional[Sequence[str]] = None,
    top_k: Optional[int] = None,
) -> List[Dict[str, Any]]:
    allowed = _normalize_filename_filter(allowed_filenames)
    filtered: List[Dict[str, Any]] = []

    for item in retrieved_data:
        if allowed is not None and item.get("file_name") not in allowed:
            continue
        filtered.append(item)
        if top_k is not None and len(filtered) >= top_k:
            break

    return filtered


def _dedupe_preserve_order(values: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    ordered: List[str] = []

    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)

    return ordered


async def execute_query(
    *,
    query: str,
    top_k: int,
    index: Any,
    ids: List[str],
    vector_log: List[Dict],
    chunk_traces: List[Dict],
    store_type: str,
    allowed_filenames: Optional[Sequence[str]] = None,
    supplemental_context: str = "",
) -> Dict[str, Any]:
    retrieval_k = top_k if allowed_filenames is None else max(top_k * 5, top_k)
    retrieved_data = retrieve_chunks(
        query=query,
        index=index,
        ids=ids,
        vector_log=vector_log,
        chunk_traces=chunk_traces,
        store_type=store_type,
        top_k=retrieval_k,
    )
    retrieved_data = filter_retrieved_data(
        retrieved_data,
        allowed_filenames=allowed_filenames,
        top_k=top_k,
    )

    if not retrieved_data:
        return {"answer": "", "context": [], "filenames": []}

    context_chunks = [item["chunk_text"] for item in retrieved_data]
    filenames = _dedupe_preserve_order(item["file_name"] for item in retrieved_data)
    final_context_parts: List[str] = []
    if supplemental_context:
        final_context_parts.append(f"Shared room memory (conversation, generated materials, and shared files):\n{supplemental_context}")
    final_context_parts.append("Retrieved document context:\n" + "\n\n".join(context_chunks))

    answer = await _infer_with_context(
        (
            "You are a shared study-room AI assistant with persistent room memory. "
            "Answer the current user query directly, but preserve continuity with prior room Q/A when relevant. "
            "If the current query is a follow-up or ambiguous (e.g., 'tell me more', 'in simpler terms'), "
            "resolve the referent using the most recent relevant room topic. "
            "Prefer retrieved document facts when available; otherwise rely on room memory and general knowledge. "
            "Do not greet or add conversational preamble. "
            "Format the response in clean Markdown with: "
            "a one-line direct answer first, then short sections and bullet points when useful. "
            "Keep it concise but informative.\n\n"
            f"Current User Query: '{query}'"
        ),
        "\n\n---\n\n".join(final_context_parts),
    )

    return {"answer": answer, "context": context_chunks, "filenames": filenames}


async def execute_general_query(
    *,
    query: str,
    supplemental_context: str = "",
) -> Dict[str, Any]:
    context = (
        (
            "Shared room memory (conversation, generated materials, and shared files):\n"
            f"{supplemental_context}"
        )
        if supplemental_context
        else "No retrieved document context is available. Use general knowledge."
    )
    answer = await _infer_with_context(
        (
            "You are a shared study-room AI assistant with persistent room memory. "
            "Answer the user's question directly and continue the ongoing topic when the question is a follow-up. "
            "If the query is ambiguous, infer the intended topic from the latest relevant room Q/A. "
            "Do not greet, do not use preamble, and do not ask conversational follow-up unless requested. "
            "Prefer concise, concrete, domain-correct information. "
            "If certainty is low, state uncertainty briefly, then provide the best possible answer. "
            "Use clean Markdown with a direct first line and brief structured sections/bullets as needed. "
            "Do not ignore the question. "
            f"User's Query: '{query}'"
        ),
        context,
    )
    return {"answer": answer, "context": [], "filenames": []}


async def execute_deep_query(
    *,
    query: str,
    top_k: int,
    create_graph: bool,
    index: Any,
    ids: List[str],
    vector_log: List[Dict],
    chunk_traces: List[Dict],
    store_type: str,
    allowed_filenames: Optional[Sequence[str]] = None,
    supplemental_context: str = "",
) -> Dict[str, Any]:
    from src.promptAgent import MultiTurnAgent

    agent = MultiTurnAgent(
        index=index,
        ids=ids,
        vector_log=vector_log,
        chunk_traces=chunk_traces,
        store_type=store_type,
    )
    return await agent.run(
        query=query,
        top_k=top_k,
        create_graph=create_graph,
        allowed_filenames=list(allowed_filenames or []),
        supplemental_context=supplemental_context,
    )
