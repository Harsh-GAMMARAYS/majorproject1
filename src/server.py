import os
import shutil
from pathlib import Path
from typing import List, Optional
import httpx
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
import uvicorn
import json

# Add project root to Python path to allow for absolute imports
project_root = Path(__file__).parent.parent
import sys
sys.path.append(str(project_root))

from src.DataCollectionPipe import run_pipe
from src.retrieverPipeline import load_logs, load_vector_store, retrieve_chunks
from src.knowledgeGraphPipeline import createDatabaseKnowledgeGraph
from src.promptAgent import MultiTurnAgent
from src.database import delete_files_from_db
from src.generative.engine import run_summarization, run_outline_generation, run_faq_generation, run_quiz_generation, run_flashcards_generation

# --- Configuration ---
# Directories
UPLOAD_DIR = project_root / "uploaded"
DATA_WAREHOUSE_DIR = project_root / "database" / "data_warehouse"

# Server
INFERENCE_SERVER_URL = "http://127.0.0.1:8000/infer"

# --- FastAPI App Initialization ---
app = FastAPI(
    title="Knowledge Base API",
    description="""
A comprehensive API for building and querying a knowledge base from unstructured documents.

**Workflow:**
1.  **Upload Documents:** Use the `/upload` endpoint to submit your files (.txt, .pdf, etc.). The server will process them in the background to build a searchable vector index.
2.  **Query the Knowledge Base:** Once processing is complete, use the `/query` or `/deepquery` endpoint to ask questions. The API will retrieve relevant information and generate a concise answer.
""",
    version="1.0.0",
    contact={
        "name": "API Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "healthy"}

@app.get("/", include_in_schema=False)
async def redirect_to_docs():
    return RedirectResponse(url="/docs")

# --- Global Variables ---
# These will be loaded at startup and reused across requests
app.state.vector_log = None
app.state.chunk_traces = None
app.state.index = None
app.state.ids = None
app.state.store_type = 'hnsw'  # or 'faiss'

# --- Pydantic Models ---
class QueryRequest(BaseModel):
    """Request model for the /query endpoint."""
    query: str = Field(
        ...,
        description="The natural language question you want to ask the knowledge base.",
        example="What are the main findings of the research paper?"
    )
    top_k: int = Field(
        20,
        description="The number of relevant document chunks to retrieve for context.",
        example=10
    )

class DeepQueryRequest(QueryRequest):
    """Request model for the /deepquery endpoint."""
    create_graph: bool = Field(
        False,
        description="Whether to create a knowledge graph from the context.",
        example=True
    )

class QueryResponse(BaseModel):
    """Response model for the /query endpoint."""
    answer: str = Field(
        ...,
        description="The generated answer from the language model.",
        example="The main findings indicate a significant correlation between..."
    )
    context: List[str] = Field(
        ...,
        description="The list of document chunks used as context to generate the answer.",
        example=[
            "Chunk 1 text...",
            "Chunk 2 text..."
        ]
    )
    filenames:List[str] = Field(
        ...,
        description="The list of documents used in the context to generate the answer.",
        example=[
            "doc1.txt...",
            "pdf2.pdf..."
        ]
    )
    
     
class DeepQueryResponse(QueryResponse):
    """Response model for the /deepquery endpoint."""
    sub_queries: List[str] = Field(
        ...,
        description="The list of sub-queries generated from the original query."
    )
    graph_location: Optional[str] = Field(
        None,
        description="The path to the generated knowledge graph HTML file, if requested."
    )
    graph_data: Optional[dict] = Field(
        None,
        description="The graph data as JSON for vis.js visualization, if requested. Contains 'nodes' and 'edges' arrays."
    )

class DeleteFilesRequest(BaseModel):
    filenames: List[str] = Field(
        ...,
        description="A list of filenames to delete from the knowledge base.",
        example=["document1.pdf", "notes.txt"]
    )

class SummarizeRequest(BaseModel):
    filenames: List[str] = Field(
        ...,
        description="A list of filenames to summarize.",
        example=["document1.pdf", "notes.txt"]
    )

class GenerateRequest(BaseModel):
    filenames: List[str] = Field(
        ...,
        description="A list of filenames to generate content for.",
        example=["document1.pdf", "notes.txt"]
    )

class QuizRequest(BaseModel):
    filenames: List[str] = Field(
        ...,
        description="A list of filenames to generate a quiz from.",
        example=["document1.pdf", "notes.txt"]
    )
    question_type: str = Field(
        "mcq",
        description="The type of questions to generate. Can be 'mcq' or 'short'.",
        example="short"
    )
    count: int = Field(
        10,
        description="The number of questions to generate.",
        example=5
    )

class OutlineRequest(BaseModel):
    filenames: List[str] = Field(
        ...,
        description="A list of filenames to generate outlines for.",
        example=["document1.pdf", "notes.txt"]
    )
    combine: bool = Field(
        False,
        description="Whether to combine the outlines into a single hierarchical outline."
    )


# --- Background Tasks ---
def run_data_pipeline():
    """
    Wrapper function to run the data ingestion and indexing pipeline.
    """
    print("Starting data ingestion and indexing pipeline in the background...")
    try:
        # Before running the pipe, move uploaded files to the data warehouse
        if not DATA_WAREHOUSE_DIR.exists():
            DATA_WAREHOUSE_DIR.mkdir(parents=True, exist_ok=True)
        
        for filename in os.listdir(UPLOAD_DIR):
            shutil.move(str(UPLOAD_DIR / filename), str(DATA_WAREHOUSE_DIR / filename))
            print(f"Moved {filename} to data warehouse.")

        run_pipe()
        print("Data pipeline finished successfully.")
        # After pipeline runs, reload the vector stores for the main app
        load_retriever_assets()
        print("Retriever assets reloaded.")

    except Exception as e:
        print(f"Error during data pipeline execution: {e}")

# --- Server Events ---
@app.on_event("startup")
def startup_event():
    """
    Load retriever assets on server startup.
    """
    print("Server starting up...")
    load_retriever_assets()

def load_retriever_assets():
    """
    Loads logs and the vector store index.
    """
    try:
        app.state.vector_log, app.state.chunk_traces = load_logs()
        app.state.index, app.state.ids = load_vector_store(store_type=app.state.store_type)
        print(f"✅ Successfully loaded logs and '{app.state.store_type}' vector store.")
    except FileNotFoundError:
        print("⚠️ Warning: Log files or vector store not found. Please upload files to build them.")
    except Exception as e:
        print(f"An unexpected error occurred while loading retriever assets: {e}")

# --- API Endpoints ---
@app.get(
    "/file_status",
    summary="Get the processing status of all uploaded files",
    description="Retrieves a JSON object detailing the processing status of each file that has been uploaded to the knowledge base. This includes whether a file has been 'processed', 'pending', or encountered an 'error'.",
    responses={
        200: {
            "description": "Successfully retrieved file processing statuses.",
            "content": {
                "application/json": {
                    "example": {
                        "document1.pdf": {"status": "processed", "timestamp": "2023-10-27T10:00:00Z"},
                        "notes.txt": {"status": "pending", "timestamp": "2023-10-27T10:05:00Z"},
                        "report.docx": {"status": "error", "message": "Failed to parse document."}
                    }
                }
            }
        },
        404: {"description": "File status log not found. No files have been processed yet."}
    }
)
async def get_file_status():
    """
    Returns the status of processed files from the file_status.json log.
    """
    file_status_path = project_root / "database" / "logs" / "file_status.json"
    if not file_status_path.exists():
        raise HTTPException(status_code=404, detail="File status log not found.")
    
    # Return the file as a JSON response
    return FileResponse(path=file_status_path, media_type='application/json')

@app.post(
    "/upload",
    summary="Upload documents to the knowledge base for processing",
    description="""
    Uploads one or more documents (e.g., .txt, .pdf) to the knowledge base. 
    These files are saved and then processed asynchronously in the background 
    to extract content, create vector embeddings, and build searchable indexes. 
    The processing status can be monitored via the `/file_status` endpoint.
    """,
    responses={
        200: {
            "description": "Files uploaded successfully and processing started.",
            "content": {
                "application/json": {
                    "example": {
                        "message": "Files ['document1.pdf', 'notes.txt'] uploaded successfully. Processing started in the background.",
                        "detail": "The data ingestion and indexing pipeline is running. You can query the data once it's complete."
                    }
                }
            }
        }
    }
)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(..., description="Multiple files to upload (e.g., PDF, TXT).")
):
    """
    Handles file uploads, saves them to a temporary directory, and triggers the 
    data processing pipeline in the background. The pipeline includes:
    1. Moving uploaded files to the data warehouse.
    2. Ingesting and chunking the documents.
    3. Creating vector embeddings.
    4. Building FAISS and HNSW vector indexes for retrieval.
    """
    # Create upload directory if it doesn't exist
    UPLOAD_DIR.mkdir(exist_ok=True)

    saved_files = []
    for file in files:
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append(file.filename)

    # Run the pipeline in the background
    background_tasks.add_task(run_data_pipeline)
    # background_tasks.add_task(createDatabaseKnowledgeGraph)
    return {
        "message": f"Files {saved_files} uploaded successfully. Processing started in the background.",
        "detail": "The data ingestion and indexing pipeline is running. You can query the data once it's complete."
    }

@app.post(
    "/query",
    response_model=QueryResponse,
    summary="Query the knowledge base with a direct question",
    description="""
    Submits a natural language query to the knowledge base. The system retrieves 
    the most relevant document chunks based on the query and uses a language model 
    to generate a concise answer. This endpoint is suitable for straightforward 
    questions that do not require multi-turn reasoning or knowledge graph generation.
    """,
    responses={
        200: {
            "description": "Successfully retrieved an answer and context.",
            "content": {
                "application/json": {
                    "example": {
                        "answer": "The main findings indicate a significant correlation between X and Y, suggesting Z.",
                        "context": [
                            "Relevant chunk 1 text...",
                            "Relevant chunk 2 text..."
                        ]
                    }
                }
            }
        },
        404: {"description": "No relevant documents found for your query."},
        503: {"description": "Vector store is not available. Please upload documents first."},
        500: {"description": "Internal server error or inference server connection issue."}
    }
)
async def query_knowledge_base(
    request: QueryRequest = Body(
        ...,
        example={
            "query": "What is the impact of climate change on marine ecosystems?",
            "top_k": 5
        }
    )
):
    """
    Processes a user query by:
    1. Retrieving `top_k` most relevant document chunks from the vector store.
    2. Constructing a prompt with the user's query and the retrieved context.
    3. Sending the prompt to an external inference server to generate a comprehensive answer.
    4. Returning the generated answer along with the context chunks used.
    """
    if app.state.index is None or app.state.ids is None:
        raise HTTPException(
            status_code=503,
            detail="Vector store is not available. Please upload documents first."
        )

    try:
        retrieved_data = retrieve_chunks(
            query=request.query,
            index=app.state.index,
            ids=app.state.ids,
            vector_log=app.state.vector_log,
            chunk_traces=app.state.chunk_traces,
            store_type=app.state.store_type,
            top_k=request.top_k
        )

        if not retrieved_data:
            raise HTTPException(status_code=404, detail="No relevant documents found for your query.")


        # print(retrieved_data)

        context_chunks = [item['chunk_text'] for item in retrieved_data]
        filenames = [item["file_name"] for item in retrieved_data]
        final_context_str = "\n\n---\n\n".join(context_chunks)
        
        final_prompt = f"Please provide a comprehensive answer to the user's query based on the following context.\n\nUser's Query: '{request.query}'"

        payload = {
            "query": final_prompt,
            "context": final_context_str,
            "model": "large"
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(INFERENCE_SERVER_URL, json=payload)
            response.raise_for_status()
            final_answer = response.json().get("result", "No answer could be generated.")
        
        
        if not isinstance(final_answer, str):
            final_answer = str(final_answer)

        return {"answer": final_answer, "context": context_chunks , 'filenames' : filenames}

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Could not connect to inference server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during query: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@app.get("/graph/{graph_location:path}")
def get_graph(graph_location: str):
    """
    Serves the generated knowledge graph HTML file.
    The graph_location should be a full path to the HTML file.
    """
    print(f"Requesting graph at: {graph_location}")
    
    # If it's a relative path, make it absolute
    if not graph_location.startswith('/'):
        graph_location = str(project_root / graph_location)
    
    if not os.path.exists(graph_location):
        print(f"Graph file not found: {graph_location}")
        raise HTTPException(status_code=404, detail=f"Graph file not found: {graph_location}")
    
    return FileResponse(graph_location, media_type="text/html")


@app.post(
    "/deepquery",
    response_model=DeepQueryResponse,
    summary="Perform a multi-turn, in-depth query on the knowledge base",
    description="""
    Executes a more complex, multi-turn query against the knowledge base. 
    This endpoint utilizes an intelligent agent to break down the initial query 
    into sub-queries, retrieve and summarize context for each, and then synthesize 
    a comprehensive final answer. Optionally, it can generate and return the 
    location of an interactive knowledge graph (HTML file) visualizing the 
    relationships extracted from the retrieved context.
    """,
    responses={
        200: {
            "description": "Successfully performed a deep query and generated an answer.",
            "content": {
                "application/json": {
                    "example": {
                        "answer": "The impact of climate change on marine ecosystems is severe, leading to... Proposed solutions include...",
                        "context": [
                            "Summarized chunk for sub-query 1...",
                            "Summarized chunk for sub-query 2..."
                        ],
                        "sub_queries": [
                            "Impact of climate change on marine ecosystems",
                            "Proposed solutions for climate change in marine environments"
                        ],
                        "graph_location": "/path/to/generated_knowledge_graph.html" 
                    }
                }
            }
        },
        404: {"description": "No relevant documents found for your deep query."},
        503: {"description": "Vector store is not available. Please upload documents first."},
        500: {"description": "Internal server error or inference server connection issue."}
    }
)
async def deep_query_knowledge_base(
    request: DeepQueryRequest = Body(
        ...,
        example={
            "query": "What is the impact of climate change on marine ecosystems, and what are the proposed solutions?",
            "top_k": 5,
            "create_graph": True
        }
    )
):
    """
    Orchestrates a deep query process using a `MultiTurnAgent`:
    1. Initializes the agent with the current vector store and logs.
    2. Runs the agent with the user's query, `top_k` context chunks, and the `create_graph` flag.
    3. The agent breaks down the query, retrieves context, generates an answer, and optionally creates a knowledge graph.
    4. Returns the agent's result, including the answer, context, sub-queries, and graph location.
    """
    if app.state.index is None or app.state.ids is None:
        raise HTTPException(
            status_code=503,
            detail="Vector store is not available. Please upload documents first."
        )

    try:
        agent = MultiTurnAgent(
            index=app.state.index,
            ids=app.state.ids,
            vector_log=app.state.vector_log,
            chunk_traces=app.state.chunk_traces,
            store_type=app.state.store_type
        )
        
        result = await agent.run(
            query=request.query,
            top_k=request.top_k,
            create_graph=request.create_graph
        )
        
        if not result["context"]:
            raise HTTPException(status_code=404, detail="No relevant documents found for your query.")

        return result

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Could not connect to inference server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during query: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred.")






@app.post(
    "/generate_outline",
    summary="Generate hierarchical outlines for documents",
    description="""
    Generates a structured, hierarchical outline for each specified document. 
    Users can choose to receive individual outlines per file or a single, 
    combined outline that integrates content from all provided documents.
    """,
    responses={
        200: {
            "description": "Outlines generated successfully.",
            "content": {
                "application/json": {
                    "examples": {
                        "individual_outlines": {
                            "summary": "Example for individual outlines",
                            "value": {
                                "individual_outlines": {
                                    "document1.pdf": "1. Introduction\n    1.1. Background\n2. Main Points\n    2.1. Sub-point A",
                                    "notes.txt": "1. Key Concepts\n2. Action Items"
                                }
                            }
                        },
                        "combined_outline": {
                            "summary": "Example for combined outline",
                            "value": {
                                "combined_outline": "1. Overview of All Documents\n    1.1. Common Themes\n2. Detailed Sections\n    2.1. From Document 1\n    2.2. From Document 2"
                            }
                        }
                    }
                }
            }
        },
        404: {"description": "One or more specified files not found or not processed."}
    }
)
async def generate_outline_endpoint(
    request: OutlineRequest = Body(
        ...,
        example={
            "filenames": ["document1.pdf", "notes.txt"],
            "combine": False
        }
    )
):
    """
    Handles document outline generation by calling the `run_outline_generation` 
    function from the generative engine. It takes a list of filenames and a 
    `combine` flag, returning either individual outlines for each file or a 
    single combined outline.
    """
    results = await run_outline_generation(request.filenames, request.combine)
    return results

@app.post(
    "/summarize",
    summary="Summarize one or more documents",
    description="Generates a summary for each of the provided filenames.",
    responses={
        200: {
            "description": "Summaries generated successfully.",
        }
    }
)
async def summarize_endpoint(
    request: SummarizeRequest  # This now correctly refers to the class above
):
    """
    Handles document summarization.
    """
    # This call now correctly refers to the async function defined above
    results = await run_summarization(request.filenames)
    
    # The return format {filename: summary_text} is very useful for the frontend
    return {
        "summaries": results
    }

@app.post(
    "/generate_faq",
    summary="Generate FAQs for one or more documents",
    description="Generates a list of frequently asked questions and their answers, accumulated from the provided documents. Each question will include its source.",
    responses={
        200: {
            "description": "FAQs generated successfully.",
        }
    }
)
async def generate_faq_endpoint(
    request: GenerateRequest
):
    """
    Handles FAQ generation.
    """
    results = await run_faq_generation(request.filenames)
    return {
        "faqs": results
    }

@app.post(
    "/generate_quiz",
    summary="Generate quizzes (MCQ or short questions) for one or more documents",
    description="Generates a single accumulated quiz (MCQ or short answer questions) from the provided documents. Each question will include its source.",
    responses={
        200: {
            "description": "Quiz generated successfully.",
        }
    }
)
async def generate_quiz_endpoint(
    request: QuizRequest
):
    """
    Handles quiz generation.
    """
  
    results = await run_quiz_generation(filenames=request.filenames , question_type=request.question_type ,count=request.count )
    return {
        "quiz": results
    }

@app.post(
    "/generate_flashcards",
    summary="Generate flashcards for one or more documents",
    description="Generates a single accumulated list of flashcards from the provided documents. Each flashcard will include its source.",
    responses={
        200: {
            "description": "Flashcards generated successfully.",
        }
    }
)
async def generate_flashcards_endpoint(
    request: GenerateRequest
):
    """
    Handles flashcards generation.
    """
    results = await run_flashcards_generation(request.filenames)
    return {
        "flashcards": results
    }


@app.post(
    "/delete",
    summary="Delete files from the knowledge base",
    description="Deletes one or more files and all associated data including chunks and vectors.",
    responses={
        200: {
            "description": "Files deleted successfully.",
        }
    }
)
async def delete_files_endpoint(
    request: DeleteFilesRequest
):
    """
    Handles file deletion.
    """
    result = delete_files_from_db(request.filenames)
    if result["errors"]:
        return {
            "message": "Some files could not be deleted.",
            "deleted_files": result["deleted_count"],
            "errors": result["errors"]
        }
    return {
        "message": f"Successfully deleted {result['deleted_count']} files.",
    }

# --- Main Execution ---
if __name__ == "__main__":
    # Note: The inference server in `InferenceServer.py` should be running on port 8000.
    # This main server will run on port 8001.
    uvicorn.run(app, host="0.0.0.0", port=8001)
