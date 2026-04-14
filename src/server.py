import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Depends, HTTPException, Body, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, ValidationError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import uvicorn
import json

# Add project root to Python path to allow for absolute imports
project_root = Path(__file__).parent.parent
import sys
sys.path.append(str(project_root))

from src.DataCollectionPipe import run_pipe
from src.auth.service import AuthService
from src.retrieverPipeline import load_logs, load_vector_store, retrieve_chunks
from src.knowledgeGraphPipeline import createDatabaseKnowledgeGraph
from src.database import delete_files_from_db
from src.generative.engine import run_summarization, run_outline_generation, run_faq_generation, run_quiz_generation, run_flashcards_generation
from src.rooms.realtime import RoomConnectionManager
from src.rooms.service import RoomService
from src.rooms.store import RoomStore
from src.services.query_service import execute_deep_query, execute_query

# --- Configuration ---
# Directories
UPLOAD_DIR = project_root / "uploaded"
DATA_WAREHOUSE_DIR = project_root / "database" / "data_warehouse"
ROOMS_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/majorproject1",
)
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-in-local-env")
ACCESS_TOKEN_TTL_SECONDS = int(os.getenv("JWT_ACCESS_TTL_SECONDS", "900"))
REFRESH_TOKEN_TTL_DAYS = int(os.getenv("JWT_REFRESH_TTL_DAYS", "14"))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@yopmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Test@2219")

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
app.state.room_store = None
app.state.room_service = None
app.state.room_hub = None
app.state.auth_service = None
bearer_scheme = HTTPBearer(auto_error=False)

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


class AuthRegisterRequest(BaseModel):
    email: str = Field(..., description="Email address for the account.")
    display_name: str = Field(..., description="Display name for the user.")
    password: str = Field(..., description="Password for the account.")


class AuthLoginRequest(BaseModel):
    email: str = Field(..., description="Email address for the account.")
    password: str = Field(..., description="Password for the account.")


class AuthRefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token returned during login.")


class AuthLogoutRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token to revoke.")


class RoomCreateRequest(BaseModel):
    name: str = Field(..., description="Study room name.")
    max_members: int = Field(5, description="Maximum members allowed in the room.")
    password: str = Field(
        ...,
        description="Room password used for protected joins.",
    )


class RoomJoinRequest(BaseModel):
    password: Optional[str] = Field(None, description="Room password, if required.")


class RoomUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, description="Updated room name.")
    max_members: Optional[int] = Field(None, description="Updated room size.")
    password: Optional[str] = Field(
        None,
        description="Set or update room password. Empty value removes password when clear_password is true.",
    )
    clear_password: bool = Field(False, description="Remove room password protection.")


class RoomInviteRequest(BaseModel):
    username: str = Field(..., description="Unique username (display name) to invite.")


class RoomInviteRespondRequest(BaseModel):
    accept: bool = Field(..., description="Whether to accept or decline the invite.")


class RoomKickRequest(BaseModel):
    user_id: str = Field(..., description="User id to remove from the room.")


class RoomMessageRequest(BaseModel):
    content: str = Field(..., description="Message body.")
    message_type: str = Field("chat", description="Message type.")


class RoomContextFilesRequest(BaseModel):
    filenames: List[str] = Field(..., description="Processed files to share in the room.")


class RoomContextRemoveRequest(BaseModel):
    filename: str = Field(..., description="Single file to remove from room context.")


class RoomActionRequest(BaseModel):
    filenames: Optional[List[str]] = Field(
        None,
        description="Files to use for the action. Defaults to the room's shared context files.",
    )
    combine: bool = Field(False, description="Whether to combine outlines.")
    question_type: str = Field("mcq", description="Quiz question type.")
    count: int = Field(10, description="Number of quiz questions.")


class RoomQueryRequest(BaseModel):
    query: str = Field(..., description="The query to run in the study room.")
    top_k: int = Field(5, description="Number of context chunks to retrieve.")


class RoomDeepQueryRequest(RoomQueryRequest):
    create_graph: bool = Field(
        False,
        description="Whether the room deep query should generate a knowledge graph.",
    )


class RoomPresenceStateUpdateRequest(BaseModel):
    in_call: Optional[bool] = Field(None, description="Whether the member is currently in a call.")
    screen_sharing: Optional[bool] = Field(
        None,
        description="Whether the member is currently sharing their screen.",
    )
    video_enabled: Optional[bool] = Field(None, description="Whether camera is enabled.")
    audio_enabled: Optional[bool] = Field(None, description="Whether microphone is enabled.")


class RoomCanvasSnapshotRequest(BaseModel):
    board: Dict[str, Any] = Field(
        ...,
        description="Serialized collaborative canvas payload.",
    )
    title: Optional[str] = Field(None, description="Optional title for the saved snapshot.")


class AdminUserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(None, description="Updated display name.")
    email: Optional[str] = Field(None, description="Updated email address.")
    is_active: Optional[bool] = Field(None, description="Whether the user is active.")


class AdminRoomUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, description="Updated room name.")
    max_members: Optional[int] = Field(None, description="Updated room size.")


# --- Background Tasks ---
def run_data_pipeline():
    """
    Wrapper function to run the data ingestion and indexing pipeline.
    """
    print("Starting data ingestion and indexing pipeline in the background...")
    try:
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
    app.state.room_store = RoomStore(ROOMS_DATABASE_URL)
    app.state.room_service = RoomService(app.state.room_store)
    app.state.room_hub = RoomConnectionManager()
    app.state.auth_service = AuthService(
        app.state.room_store,
        jwt_secret=JWT_SECRET,
        access_ttl_seconds=ACCESS_TOKEN_TTL_SECONDS,
        refresh_ttl_days=REFRESH_TOKEN_TTL_DAYS,
    )
    app.state.room_store.ensure_admin_account(
        email=ADMIN_EMAIL,
        password=ADMIN_PASSWORD,
        display_name="Admin",
    )

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


def get_room_service() -> RoomService:
    if app.state.room_service is None:
        app.state.room_store = RoomStore(ROOMS_DATABASE_URL)
        app.state.room_store.ensure_admin_account(
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
            display_name="Admin",
        )
        app.state.room_service = RoomService(app.state.room_store)
    return app.state.room_service


def get_auth_service() -> AuthService:
    if app.state.auth_service is None:
        if app.state.room_store is None:
            app.state.room_store = RoomStore(ROOMS_DATABASE_URL)
        app.state.room_store.ensure_admin_account(
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
            display_name="Admin",
        )
        app.state.auth_service = AuthService(
            app.state.room_store,
            jwt_secret=JWT_SECRET,
            access_ttl_seconds=ACCESS_TOKEN_TTL_SECONDS,
            refresh_ttl_days=REFRESH_TOKEN_TTL_DAYS,
        )
    return app.state.auth_service


def get_room_hub() -> RoomConnectionManager:
    if app.state.room_hub is None:
        app.state.room_hub = RoomConnectionManager()
    return app.state.room_hub


def resolve_client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        current_user = get_auth_service().get_current_user(credentials.credentials)
        if app.state.room_store is not None:
            app.state.room_store.touch_user_activity(current_user["id"])
        return current_user
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


def get_owned_file_status(user_id: str) -> Dict[str, Any]:
    file_status_path = project_root / "database" / "logs" / "file_status.json"
    if not file_status_path.exists():
        return {}

    with open(file_status_path, "r", encoding="utf-8") as handle:
        try:
            raw_status = json.load(handle)
        except json.JSONDecodeError:
            return {}

    if app.state.room_store is None:
        app.state.room_store = RoomStore(ROOMS_DATABASE_URL)

    owned_filenames = set(app.state.room_store.list_uploaded_filenames_for_user(user_id))
    return {
        filename: details
        for filename, details in raw_status.items()
        if filename in owned_filenames and details.get("deleted") is not True
    }


def get_owned_processed_filenames(user_id: str) -> List[str]:
    room_service = get_room_service()
    return room_service.get_owned_processed_files(user_id)


def validate_owned_processed_filenames(user_id: str, filenames: List[str]) -> List[str]:
    room_service = get_room_service()
    return room_service.validate_context_files(user_id, filenames)

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
async def get_file_status(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns the status of processed files from the file_status.json log.
    """
    filtered_status = get_owned_file_status(current_user["id"])
    return JSONResponse(
        content=filtered_status,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

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
    files: List[UploadFile] = File(..., description="Multiple files to upload (e.g., PDF, TXT)."),
    current_user: Dict[str, Any] = Depends(get_current_user),
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

    try:
        get_room_service().store.register_uploaded_files(current_user["id"], saved_files)
    except ValueError as exc:
        for filename in saved_files:
            file_path = UPLOAD_DIR / filename
            if file_path.exists():
                file_path.unlink()
        raise HTTPException(status_code=400, detail=str(exc))

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
    ),
    current_user: Dict[str, Any] = Depends(get_current_user),
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
        result = await execute_query(
            query=request.query,
            top_k=request.top_k,
            index=app.state.index,
            ids=app.state.ids,
            vector_log=app.state.vector_log,
            chunk_traces=app.state.chunk_traces,
            store_type=app.state.store_type,
            allowed_filenames=get_owned_processed_filenames(current_user["id"]),
        )

        if not result["context"]:
            raise HTTPException(status_code=404, detail="No relevant documents found for your query.")

        return result

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Could not connect to inference server: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during query: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred.")

@app.get("/graph/{graph_location:path}")
def get_graph(
    graph_location: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
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
    ),
    current_user: Dict[str, Any] = Depends(get_current_user),
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
        result = await execute_deep_query(
            query=request.query,
            top_k=request.top_k,
            create_graph=request.create_graph,
            index=app.state.index,
            ids=app.state.ids,
            vector_log=app.state.vector_log,
            chunk_traces=app.state.chunk_traces,
            store_type=app.state.store_type,
            allowed_filenames=get_owned_processed_filenames(current_user["id"]),
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
    ),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Handles document outline generation by calling the `run_outline_generation` 
    function from the generative engine. It takes a list of filenames and a 
    `combine` flag, returning either individual outlines for each file or a 
    single combined outline.
    """
    filenames = validate_owned_processed_filenames(current_user["id"], request.filenames)
    results = await run_outline_generation(filenames, request.combine)
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
    request: SummarizeRequest,  # This now correctly refers to the class above
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Handles document summarization.
    """
    # This call now correctly refers to the async function defined above
    filenames = validate_owned_processed_filenames(current_user["id"], request.filenames)
    results = await run_summarization(filenames)
    
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
    request: GenerateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Handles FAQ generation.
    """
    filenames = validate_owned_processed_filenames(current_user["id"], request.filenames)
    results = await run_faq_generation(filenames)
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
    request: QuizRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Handles quiz generation.
    """
  
    filenames = validate_owned_processed_filenames(current_user["id"], request.filenames)
    results = await run_quiz_generation(filenames=filenames , question_type=request.question_type ,count=request.count )
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
    request: GenerateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Handles flashcards generation.
    """
    filenames = validate_owned_processed_filenames(current_user["id"], request.filenames)
    results = await run_flashcards_generation(filenames)
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
    request: DeleteFilesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Handles file deletion.
    """
    filenames = get_room_service().store.assert_file_ownership(current_user["id"], request.filenames)
    result = delete_files_from_db(filenames)
    get_room_service().store.mark_uploaded_files_deleted(current_user["id"], filenames)
    if result["errors"]:
        return {
            "message": "Some files could not be deleted.",
            "deleted_files": result["deleted_count"],
            "errors": result["errors"]
        }
    return {
        "message": f"Successfully deleted {result['deleted_count']} files.",
    }


@app.post("/auth/register", summary="Register a new account")
async def register(
    request: AuthRegisterRequest,
    http_request: Request,
):
    try:
        return get_auth_service().register(
            email=request.email,
            display_name=request.display_name,
            password=request.password,
            user_agent=http_request.headers.get("user-agent"),
            ip_address=resolve_client_ip(http_request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/auth/login", summary="Log into an existing account")
async def login(
    request: AuthLoginRequest,
    http_request: Request,
):
    try:
        return get_auth_service().login(
            email=request.email,
            password=request.password,
            user_agent=http_request.headers.get("user-agent"),
            ip_address=resolve_client_ip(http_request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@app.post("/auth/refresh", summary="Refresh an access token")
async def refresh_auth_token(
    request: AuthRefreshRequest,
    http_request: Request,
):
    try:
        return get_auth_service().refresh(
            request.refresh_token,
            user_agent=http_request.headers.get("user-agent"),
            ip_address=resolve_client_ip(http_request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@app.post("/auth/logout", summary="Log out from the current session")
async def logout_auth(
    request: AuthLogoutRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    get_auth_service().logout(request.refresh_token)
    return {"ok": True, "user_id": current_user["id"]}


@app.get("/auth/me", summary="Get the current authenticated user")
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return current_user


@app.get("/admin/users", summary="List all users for admin management")
async def list_admin_users(current_user: Dict[str, Any] = Depends(require_admin)):
    return {"users": get_room_service().store.list_users_admin()}


@app.patch("/admin/users/{user_id}", summary="Update a user as admin")
async def update_admin_user(
    user_id: str,
    request: AdminUserUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    try:
        return get_room_service().store.update_user_admin(
            user_id,
            display_name=request.display_name,
            email=request.email,
            is_active=request.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/admin/users/{user_id}", summary="Delete a user as admin")
async def delete_admin_user(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    try:
        get_room_service().store.delete_user_admin(user_id)
        return {"ok": True, "user_id": user_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/admin/rooms", summary="List all rooms for admin management")
async def list_admin_rooms(current_user: Dict[str, Any] = Depends(require_admin)):
    return {"rooms": get_room_service().store.list_rooms_admin()}


@app.patch("/admin/rooms/{room_id}", summary="Update a room as admin")
async def update_admin_room(
    room_id: str,
    request: AdminRoomUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    try:
        return get_room_service().store.update_room_admin(
            room_id,
            name=request.name,
            max_members=request.max_members,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/admin/rooms/{room_id}", summary="Delete a room as admin")
async def delete_admin_room(
    room_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    try:
        get_room_service().store.delete_room_admin(room_id)
        return {"ok": True, "room_id": room_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

def resolve_room_action_filenames(room_id: str, request: RoomActionRequest) -> List[str]:
    room_service = get_room_service()
    filenames = request.filenames or room_service.get_room_context_filenames(room_id)
    if not filenames:
        raise HTTPException(
            status_code=400,
            detail="No files were provided and the room has no shared context files.",
        )
    return filenames


async def broadcast_room_snapshot(room_id: str, event: str, payload: Dict[str, Any]) -> None:
    await get_room_hub().broadcast(room_id, event, payload)


async def broadcast_room_presence(room_id: str) -> None:
    hub = get_room_hub()
    await hub.broadcast(
        room_id,
        "presence_updated",
        hub.room_presence(room_id),
    )


def attach_owner_room_password(room: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    if room.get("owner_user_id") == user_id:
        room["password"] = get_room_service().store.get_room_password_for_owner(room["id"], user_id)
    return room


@app.get("/rooms", summary="List all study rooms")
async def list_rooms(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"rooms": get_room_service().store.list_rooms()}


@app.post("/rooms", summary="Create a study room")
async def create_room(
    request: RoomCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        room = get_room_service().store.create_room(
            name=request.name,
            owner_user_id=current_user["id"],
            max_members=request.max_members,
            password=request.password,
        )
        return attach_owner_room_password(room, current_user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/rooms/invites/received", summary="List invites received by the current user")
async def list_received_room_invites(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"invites": get_room_service().store.list_received_invites(current_user["id"])}


@app.post("/rooms/invites/{invite_id}/respond", summary="Accept or decline a room invite")
async def respond_room_invite(
    invite_id: str,
    request: RoomInviteRespondRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        invite = get_room_service().store.respond_to_invite(
            invite_id,
            current_user["id"],
            accept=request.accept,
        )
        room_id = invite["room_id"]
        room = get_room_service().store.get_room(room_id)
        await broadcast_room_snapshot(
            room_id,
            "member_joined" if request.accept else "invite_responded",
            {"room": room, "invite": invite},
        )
        await broadcast_room_presence(room_id)
        return {"invite": invite, "room": room}
    except ValueError as exc:
        status = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc))


@app.get("/rooms/{room_id}", summary="Get a room with members and shared context")
async def get_room(room_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        room_service = get_room_service()
        room = room_service.store.get_room(room_id)
        room = attach_owner_room_password(room, current_user["id"])
        try:
            room_service.store.ensure_member(room_id, current_user["id"])
            room["artifacts"] = room_service.store.list_artifacts(room_id)
        except ValueError:
            room["artifacts"] = []
        return room
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/rooms/{room_id}/join", summary="Join a study room")
async def join_room(
    room_id: str,
    request: RoomJoinRequest = Body(default_factory=RoomJoinRequest),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        room = get_room_service().store.join_room(
            room_id,
            current_user["id"],
            password=request.password,
        )
        room = attach_owner_room_password(room, current_user["id"])
        await broadcast_room_snapshot(
            room_id,
            "member_joined",
            {"room": room, "joined_user": room.get("joined_user")},
        )
        await broadcast_room_presence(room_id)
        return room
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc))


@app.patch("/rooms/{room_id}", summary="Update room settings (owner only)")
async def update_room(
    room_id: str,
    request: RoomUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        room = get_room_service().store.update_room_owner(
            room_id,
            current_user["id"],
            name=request.name,
            max_members=request.max_members,
            password=request.password,
            clear_password=request.clear_password,
        )
        room = attach_owner_room_password(room, current_user["id"])
        await broadcast_room_snapshot(room_id, "room_updated", {"room": room})
        return room
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc))


@app.delete("/rooms/{room_id}", summary="Delete a room (owner only)")
async def delete_room(
    room_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        get_room_service().store.delete_room_owner(room_id, current_user["id"])
        await broadcast_room_snapshot(room_id, "room_deleted", {"room_id": room_id})
        return {"ok": True, "room_id": room_id}
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc))


@app.post("/rooms/{room_id}/kick", summary="Kick a room member (owner only)")
async def kick_room_member(
    room_id: str,
    request: RoomKickRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        room = get_room_service().store.kick_member(
            room_id,
            current_user["id"],
            request.user_id,
        )
        get_room_hub().disconnect(room_id, request.user_id)
        await broadcast_room_snapshot(
            room_id,
            "member_kicked",
            {"room": room, "user_id": request.user_id},
        )
        await broadcast_room_presence(room_id)
        return room
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc))


@app.post("/rooms/{room_id}/invite", summary="Invite a user to a room (owner only)")
async def invite_to_room(
    room_id: str,
    request: RoomInviteRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        invite = get_room_service().store.create_room_invite(
            room_id,
            current_user["id"],
            request.username,
        )
        room = get_room_service().store.get_room(room_id)
        await broadcast_room_snapshot(
            room_id,
            "invite_created",
            {"invite": invite, "room": room},
        )
        return {"invite": invite, "room": room}
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc))


@app.post("/rooms/{room_id}/leave", summary="Leave a study room")
async def leave_room(room_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        room_service = get_room_service()
        room_service.store.ensure_member(room_id, current_user["id"])
        room = room_service.store.get_room(room_id)
        get_room_hub().disconnect(room_id, current_user["id"])
        await broadcast_room_snapshot(
            room_id,
            "room_updated",
            {"room": room, "user_id": current_user["id"]},
        )
        await broadcast_room_presence(room_id)
        return room
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/rooms/{room_id}/messages", summary="List room messages")
async def list_room_messages(
    room_id: str,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        get_room_service().store.ensure_member(room_id, current_user["id"])
        return {"messages": get_room_service().store.list_messages(room_id, limit=limit)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/rooms/{room_id}/messages", summary="Post a room message")
async def post_room_message(
    room_id: str,
    request: RoomMessageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        message = get_room_service().store.add_message(
            room_id=room_id,
            user_id=current_user["id"],
            content=request.content,
            message_type=request.message_type,
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": message})
        return message
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/rooms/{room_id}/context/files", summary="List shared room context files")
async def list_room_context_files(
    room_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    get_room_service().store.ensure_member(room_id, current_user["id"])
    return {"files": get_room_service().store.list_context_files(room_id)}


@app.post("/rooms/{room_id}/context/files", summary="Add files to the shared room context")
async def add_room_context_files(
    room_id: str,
    request: RoomContextFilesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        filenames = room_service.validate_context_files(current_user["id"], request.filenames)
        files = room_service.store.add_context_files(room_id, current_user["id"], filenames)
        await broadcast_room_snapshot(room_id, "context_updated", {"files": files})
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/rooms/{room_id}/context/files/remove", summary="Remove a file from shared room context")
async def remove_room_context_file(
    room_id: str,
    request: RoomContextRemoveRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        room_service.store.ensure_member(room_id, current_user["id"])
        files = room_service.store.remove_context_file(room_id, request.filename)
        await broadcast_room_snapshot(room_id, "context_updated", {"files": files})
        return {"files": files}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/rooms/{room_id}/artifacts", summary="List room-generated artifacts")
async def list_room_artifacts(
    room_id: str,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    get_room_service().store.ensure_member(room_id, current_user["id"])
    return {"artifacts": get_room_service().store.list_artifacts(room_id, limit=limit)}


@app.get("/rooms/{room_id}/canvas/snapshot", summary="Get latest room canvas snapshot")
async def get_room_canvas_snapshot(
    room_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        artifact = get_room_service().get_latest_canvas_snapshot(
            room_id=room_id,
            user_id=current_user["id"],
        )
        return {"artifact": artifact}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/rooms/{room_id}/canvas/snapshot", summary="Save a room canvas snapshot")
async def save_room_canvas_snapshot(
    room_id: str,
    request: RoomCanvasSnapshotRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        artifact = get_room_service().save_canvas_snapshot(
            room_id=room_id,
            user_id=current_user["id"],
            board=request.board,
            title=request.title,
        )
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": artifact})
        await broadcast_room_snapshot(room_id, "canvas_snapshot_updated", {"artifact": artifact})
        return {"artifact": artifact}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.websocket("/rooms/{room_id}/ws")
async def room_websocket(room_id: str, websocket: WebSocket, token: str):
    room_service = get_room_service()
    room_hub = get_room_hub()
    user_id: str | None = None
    connection_id: str | None = None
    try:
        current_user = get_auth_service().get_current_user(token)
        user_id = current_user["id"]
        if app.state.room_store is not None:
            app.state.room_store.touch_user_activity(user_id)
        room_service.store.ensure_member(room_id, user_id)
        connection_id = await room_hub.connect(room_id, user_id, websocket)
        await room_hub.send_json(
            room_id,
            user_id,
            "room_snapshot",
            {
                "room": attach_owner_room_password(room_service.store.get_room(room_id), user_id),
                "messages": room_service.store.list_messages(room_id, limit=100),
                "artifacts": room_service.store.list_artifacts(room_id, limit=100),
                "presence": room_hub.room_presence(room_id),
            },
        )
        await broadcast_room_presence(room_id)

        while True:
            payload = await websocket.receive_json()
            event = payload.get("event")
            if event == "ping":
                await room_hub.send_json(room_id, user_id, "pong", {"ok": True})
            elif event == "presence":
                await room_hub.send_json(
                    room_id,
                    user_id,
                    "presence_updated",
                    room_hub.room_presence(room_id),
                )
            elif event == "presence_state":
                incoming_state = payload.get("payload") or {}
                if not isinstance(incoming_state, dict):
                    await room_hub.send_json(
                        room_id,
                        user_id,
                        "invalid_payload",
                        {"event": event, "detail": "payload must be an object"},
                    )
                    continue
                try:
                    state_patch = RoomPresenceStateUpdateRequest.model_validate(
                        incoming_state
                    ).model_dump(exclude_none=True)
                except ValidationError:
                    await room_hub.send_json(
                        room_id,
                        user_id,
                        "invalid_payload",
                        {"event": event, "detail": "invalid presence state payload"},
                    )
                    continue
                merged_state = room_hub.update_user_state(room_id, user_id, state_patch)
                await room_hub.send_json(
                    room_id,
                    user_id,
                    "presence_state_ack",
                    {"user_id": user_id, "state": merged_state},
                )
                await broadcast_room_presence(room_id)
            elif event in {"call_signal", "call_control", "canvas_delta", "canvas_cursor"}:
                relay_payload = payload.get("payload") or {}
                if not isinstance(relay_payload, dict):
                    await room_hub.send_json(
                        room_id,
                        user_id,
                        "invalid_payload",
                        {"event": event, "detail": "payload must be an object"},
                    )
                    continue
                relay_payload["user_id"] = user_id
                await room_hub.broadcast(room_id, event, relay_payload)
            else:
                await room_hub.send_json(
                    room_id,
                    user_id,
                    "unsupported_event",
                    {"event": event},
                )
    except WebSocketDisconnect:
        if user_id is not None:
            room_hub.disconnect(room_id, user_id, connection_id)
            await broadcast_room_presence(room_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid room membership.")
    except Exception:
        if user_id is not None:
            room_hub.disconnect(room_id, user_id, connection_id)
            await broadcast_room_presence(room_id)
        await websocket.close(code=1011, reason="Room websocket error.")


@app.post("/rooms/{room_id}/actions/query", summary="Run a shared room query")
async def run_room_query(
    room_id: str,
    request: RoomQueryRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "query", "user_id": current_user["id"], "query": request.query},
        )
        result = await room_service.run_room_query(
            room_id=room_id,
            user_id=current_user["id"],
            query=request.query,
            top_k=request.top_k,
            app_state=app.state,
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["question_message"]})
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["answer_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "query", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except httpx.RequestError as exc:
        await broadcast_room_snapshot(
            room_id,
            "job_failed",
            {"action": "query", "user_id": current_user["id"], "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail=f"Could not connect to inference server: {exc}")


@app.post("/rooms/{room_id}/actions/deepquery", summary="Run a shared room deep query")
async def run_room_deepquery(
    room_id: str,
    request: RoomDeepQueryRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "deepquery", "user_id": current_user["id"], "query": request.query},
        )
        result = await room_service.run_room_deep_query(
            room_id=room_id,
            user_id=current_user["id"],
            query=request.query,
            top_k=request.top_k,
            create_graph=request.create_graph,
            app_state=app.state,
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["question_message"]})
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["answer_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "deepquery", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except httpx.RequestError as exc:
        await broadcast_room_snapshot(
            room_id,
            "job_failed",
            {"action": "deepquery", "user_id": current_user["id"], "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail=f"Could not connect to inference server: {exc}")


@app.post("/rooms/{room_id}/actions/summarize", summary="Generate room summaries")
async def run_room_summarize(
    room_id: str,
    request: RoomActionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "summarize", "user_id": current_user["id"]},
        )
        result = await room_service.run_room_generation(
            room_id=room_id,
            user_id=current_user["id"],
            action="summarize",
            filenames=resolve_room_action_filenames(room_id, request),
            options={},
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["system_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "summarize", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/rooms/{room_id}/actions/faq", summary="Generate room FAQs")
async def run_room_faq(
    room_id: str,
    request: RoomActionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "faq", "user_id": current_user["id"]},
        )
        result = await room_service.run_room_generation(
            room_id=room_id,
            user_id=current_user["id"],
            action="faq",
            filenames=resolve_room_action_filenames(room_id, request),
            options={},
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["system_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "faq", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/rooms/{room_id}/actions/flashcards", summary="Generate room flashcards")
async def run_room_flashcards(
    room_id: str,
    request: RoomActionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "flashcards", "user_id": current_user["id"]},
        )
        result = await room_service.run_room_generation(
            room_id=room_id,
            user_id=current_user["id"],
            action="flashcards",
            filenames=resolve_room_action_filenames(room_id, request),
            options={},
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["system_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "flashcards", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/rooms/{room_id}/actions/quiz", summary="Generate room quiz")
async def run_room_quiz(
    room_id: str,
    request: RoomActionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "quiz", "user_id": current_user["id"]},
        )
        result = await room_service.run_room_generation(
            room_id=room_id,
            user_id=current_user["id"],
            action="quiz",
            filenames=resolve_room_action_filenames(room_id, request),
            options={"question_type": request.question_type, "count": request.count},
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["system_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "quiz", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/rooms/{room_id}/actions/outline", summary="Generate room outline")
async def run_room_outline(
    room_id: str,
    request: RoomActionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    room_service = get_room_service()
    try:
        await broadcast_room_snapshot(
            room_id,
            "job_started",
            {"action": "outline", "user_id": current_user["id"]},
        )
        result = await room_service.run_room_generation(
            room_id=room_id,
            user_id=current_user["id"],
            action="outline",
            filenames=resolve_room_action_filenames(room_id, request),
            options={"combine": request.combine},
        )
        await broadcast_room_snapshot(room_id, "message_created", {"message": result["system_message"]})
        await broadcast_room_snapshot(room_id, "artifact_created", {"artifact": result["artifact"]})
        await broadcast_room_snapshot(
            room_id,
            "job_finished",
            {"action": "outline", "user_id": current_user["id"], "artifact": result["artifact"]},
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

# --- Main Execution ---
if __name__ == "__main__":
    # Note: The inference server in `InferenceServer.py` should be running on port 8000.
    # This main server will run on port 8001.
    uvicorn.run(app, host="0.0.0.0", port=8001)
