import time
import uuid
from typing import Any, Dict, List, Optional, Sequence
import httpx
from pathlib import Path

project_root = Path(__file__).parent.parent
import sys
sys.path.append(str(project_root))

from src.promptParser.query_parser import break_down_query
from src.retrieverPipeline import retrieve_chunks
from src.knowledgeGraphPipeline import create_knowledge_graph_from_context
from src.services.query_service import filter_retrieved_data

INFERENCE_SERVER_URL = "http://127.0.0.1:8000/infer"

class MultiTurnAgent:
    def __init__(self, index: Any, ids: List[str], vector_log: List[Dict], chunk_traces: List[Dict], store_type: str):
        self.index = index
        self.ids = ids
        self.vector_log = vector_log
        self.chunk_traces = chunk_traces
        self.store_type = store_type

    async def run(
        self,
        query: str,
        top_k: int = 5,
        create_graph: bool = False,
        allowed_filenames: Optional[Sequence[str]] = None,
        supplemental_context: str = "",
    ) -> Dict[str, Any]:
        """
        Runs the multi-turn query process.
        """
        print("Breaking down the query...")
        sub_queries = await break_down_query(query)
        print(f"Sub-queries: {sub_queries}")

        accumulated_context_chunks = []
        intermediate_summaries = []
        accumulated_filenames: List[str] = []

        for sub_query in sub_queries:
            print(f"Processing sub-query: '{sub_query}'")
            
            # 1. Retrieve context for the sub-query
            retrieved_data = retrieve_chunks(
                query=sub_query,
                index=self.index,
                ids=self.ids,
                vector_log=self.vector_log,
                chunk_traces=self.chunk_traces,
                store_type=self.store_type,
                top_k=max(top_k * 5, top_k) if allowed_filenames else top_k,
            )
            retrieved_data = filter_retrieved_data(
                retrieved_data,
                allowed_filenames=allowed_filenames,
                top_k=top_k,
            )

            if not retrieved_data:
                continue

            context_chunks = [item['chunk_text'] for item in retrieved_data]
            
            filenames = [item['file_name'] for item in retrieved_data]
            for filename in filenames:
                if filename not in accumulated_filenames:
                    accumulated_filenames.append(filename)
            
            accumulated_context_chunks.extend(context_chunks)
            
            # 2. Summarize the retrieved context for this sub-query
            context_str = "\n\n---\n\n".join(context_chunks)
            summary_prompt = f"Based on the following context, provide a concise summary that answers the question: '{sub_query}'."
            
            payload = {
                "query": summary_prompt,
                "context": context_str, # Context is in the prompt
                "model": "large"
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(INFERENCE_SERVER_URL, json=payload)
                response.raise_for_status()
                summary = response.json().get("result", "")
                if summary:
                    intermediate_summaries.append(summary)
                    print(f"Intermediate summary: {summary}")

        if not intermediate_summaries:
             # Fallback if no summaries could be generated
            if not accumulated_context_chunks:
                return {
                    "answer": "Could not find relevant information to answer the query.",
                    "context": [],
                    "sub_queries": sub_queries,
                    "graph_location": None,
                    "filenames":[]
                }
            
            final_context_parts = list(accumulated_context_chunks)
            if supplemental_context:
                final_context_parts.append(f"Study room conversation context:\n{supplemental_context}")
            final_context_str = "\n\n---\n\n".join(final_context_parts)
            final_prompt = f"Please provide a comprehensive answer to the user's query based on the following context.\n\nUser's Query: '{query}'\n\nContext:\n{final_context_str}"
        else:
            # 3. Generate the final answer
            print("Generating final answer...")
            final_context_parts = list(intermediate_summaries)
            if supplemental_context:
                final_context_parts.append(f"Study room conversation context:\n{supplemental_context}")
            final_context = "\n\n---\n\n".join(final_context_parts)
            final_prompt = f"""
            Based on the following information gathered from a document knowledge base, provide a comprehensive answer to the user's original query.

            User's Query: "{query}"

            Gathered Information:
            {final_context}

            Your final answer should be well-structured, coherent, and directly address the user's query.
            """

        payload = {
            "query": final_prompt,
            "context": "",
            "model": "large"
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(INFERENCE_SERVER_URL, json=payload)
            response.raise_for_status()
            final_answer = response.json().get("result", "No answer could be generated.")

        # 4. Create a knowledge graph from the accumulated context
        graph_location = None
        graph_data = None
        if create_graph and accumulated_context_chunks:
            full_context = "\n\n".join(accumulated_context_chunks)
            graph_filename = f"context_kg_{int(time.time())}_{uuid.uuid4().hex[:8]}.html"
            # Get both HTML and JSON data
            kg_result = create_knowledge_graph_from_context(full_context, output_path=graph_filename)
            if kg_result and kg_result.get("html_location"):
                # Prepend /graph/ for the API endpoint (HTML fallback)
                graph_location = f"/graph/{kg_result['html_location']}"
                # Include JSON data for frontend visualization
                graph_data = kg_result.get("graph_data")

        return {
            "answer": final_answer,
            "context": accumulated_context_chunks,
            "sub_queries": sub_queries,
            "graph_location": graph_location,
            "graph_data": graph_data,  # NEW: JSON data for vis.js
            "filenames": accumulated_filenames,
        }
