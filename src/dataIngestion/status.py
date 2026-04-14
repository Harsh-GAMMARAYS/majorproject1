import json
import csv
from pathlib import Path

# Import functions from other modules
from . import ingest
from . import chunks
from . import vectors

from tqdm import tqdm







class Colors:
    RESET = '\033[0m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    





def update_chunk_status_and_files(LOG_DIR):
    CHUNK_STATUS_PATH = LOG_DIR / "chunk_status.json"
    CHUNK_TRACES_PATH = LOG_DIR / "chunk_traces.json"
    FILE_STATUS_PATH = LOG_DIR / "file_status.json"
    PROCESSED_CSV_PATH = LOG_DIR / "processed_files.csv"

    # Load JSON and CSV files
    with open(CHUNK_TRACES_PATH, "r", encoding="utf-8") as f:
        chunk_traces = json.load(f)
    with open(CHUNK_STATUS_PATH, "r", encoding="utf-8") as f:
        chunk_status = json.load(f)
    with open(FILE_STATUS_PATH, "r", encoding="utf-8") as f:
        file_status = json.load(f)

    processed_files = []
    if Path(PROCESSED_CSV_PATH).exists():
        with open(PROCESSED_CSV_PATH, newline="", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            processed_files = [row for row in reader]

    # Update chunk_status
    for file_name, file_info in tqdm(chunk_status.items(),desc=f"{Colors.YELLOW} Updating chunk_status {Colors.RESET}"):
        chunks = file_info.get("chunks", [])
        num_processed = 0
        for chunk in chunks:
            # Safe lookup in chunk_traces
            chunk_key = f"{chunk['file_name']}_chunk_{chunk['chunk_id']}"
            if chunk_key in chunk_traces and chunk_traces[chunk_key].get("vectorized", False):
                chunk["processed"] = True
            if chunk.get("processed", False):
                num_processed += 1

        file_info["num_chunks"] = len(chunks)
        file_info["num_processed_chunks"] = num_processed

    # Check if entire file is processed
    for file_name, file_info in tqdm(chunk_status.items() , desc=f"{Colors.YELLOW} Checking if entire file is processed {Colors.RESET}"):
        if file_info.get("num_chunks", 0) == file_info.get("num_processed_chunks", 0) and file_info.get("num_chunks", 0) > 0:
            file_info["status"] = "processed"
            # Upsert file_status.json entry even when ingestion started with an empty file_status.
            existing = file_status.get(file_name, {})
            file_status[file_name] = {
                "status": "processed",
                "timestamp": existing.get("timestamp") or file_info.get("timestamp"),
                "hash": existing.get("hash") or file_info.get("hash"),
            }

            # Upsert processed_files.csv row.
            matching_row = None
            for row in processed_files:
                if row.get("file_name") == file_name:
                    matching_row = row
                    break

            if matching_row is None:
                processed_files.append(
                    {
                        "file_name": file_name,
                        "status": "processed",
                        "timestamp": file_status[file_name]["timestamp"] or "",
                        "hash": file_status[file_name]["hash"] or "",
                    }
                )
            else:
                matching_row["status"] = "processed"
                matching_row["timestamp"] = file_status[file_name]["timestamp"] or matching_row.get("timestamp", "")
                matching_row["hash"] = file_status[file_name]["hash"] or matching_row.get("hash", "")

    # Save updates
    with open(CHUNK_STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(chunk_status, f, indent=4)
    with open(FILE_STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(file_status, f, indent=4)
    with open(PROCESSED_CSV_PATH, "w", newline="", encoding="utf-8") as csvfile:
        fieldnames = ["file_name", "status", "timestamp", "hash"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(processed_files)

    print(f"{Colors.GREEN} Chunk status, file status, and processed CSV updated successfully.{Colors.RESET}")


def run_ingestion_pipeline():
    """
    Runs the complete data ingestion pipeline.
    """
    BASE_DIR = Path.cwd()
    UPLOADED_DIR = BASE_DIR / "uploaded"
    DATA_WAREHOUSE_DIR = BASE_DIR / "database" / "data_warehouse"
    PROCESSED_DIR = BASE_DIR / "database" / "processed"
    CLEANED_DIR = PROCESSED_DIR / "cleaned"
    CHUNK_DIR = PROCESSED_DIR / "chunks"
    LOG_DIR = BASE_DIR / "database" / "logs"
    VECTOR_DB_DIR = BASE_DIR / "database" / "vectordb"

    # Create directories if they don't exist
    for path in [UPLOADED_DIR, DATA_WAREHOUSE_DIR, CLEANED_DIR, CHUNK_DIR, LOG_DIR, VECTOR_DB_DIR]:
        path.mkdir(parents=True, exist_ok=True)

    print(f"{Colors.GREEN} --- Starting Data Ingestion Pipeline ---{Colors.RESET}")

    # 1. Ingest files
    print(f"{Colors.YELLOW} \n[1/5] Ingesting files...{Colors.RESET}")
    ingest.ingest_files(UPLOADED_DIR, DATA_WAREHOUSE_DIR, LOG_DIR )
    print(f"{Colors.GREEN} --- Ingestion complete ---{Colors.RESET}")

    # 2. Process and chunk files
    print(f"{Colors.YELLOW} \n[2/5] Chunking files...{Colors.RESET}")
    chunks.process_data_warehouse_with_metadata(DATA_WAREHOUSE_DIR, CLEANED_DIR, CHUNK_DIR, LOG_DIR , chunk_size= 300 , overlap= 70)
    print(f"{Colors.GREEN}--- Chunking complete ---{Colors.RESET}")

    # 3. Trace chunks
    print(f"{Colors.YELLOW} \n[3/5] Tracing chunks...{Colors.RESET}")
    chunks.trace_chunks(LOG_DIR)
    print(f"{Colors.GREEN} --- Tracing complete ---{Colors.RESET}")

    # 4. Create vector DB
    print(f"{Colors.YELLOW} \n[4/5] Creating vector database...{Colors.RESET}")
    vectors.create_vector_db(LOG_DIR, VECTOR_DB_DIR)
    print(f"{Colors.GREEN} --- Vector DB creation complete ---{Colors.RESET}")

    # 5. Update status
    print(f"{Colors.YELLOW}\n[5/5] Updating final status...{Colors.RESET}")
    update_chunk_status_and_files(LOG_DIR)
    print(f"{Colors.GREEN} --- Status update complete ---{Colors.RESET}")

    print(f"{Colors.GREEN} \n--- Data Ingestion Pipeline Finished ---{Colors.RESET}")

if __name__ == "__main__":
    run_ingestion_pipeline()