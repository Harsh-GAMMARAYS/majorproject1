#chunls to hkg/kg

from src.knowledgeGraph.entity_relation_extraction import *
from src.knowledgeGraph.knowledge_graph_maker import *


def createDatabaseKnowledgeGraph():
    print("extracting entity and relations...")
    extract_and_store_entities_relations_from_server()
    print("building and saving kg...")
    build_and_save_graph()

def create_knowledge_graph_from_context(text: str, output_path: str = "assets/context_kg.html"):
    """
    Creates a knowledge graph from the given text context and saves it as an HTML file.
    Also returns the graph data as JSON for frontend visualization.
    Returns: {
        "html_location": "/path/to/file.html",
        "graph_data": {"nodes": [...], "edges": [...]}
    }
    """
    print("Extracting entities and relations from context...")
    entities, _, relations = extract_entities_relations_from_context(text)
    
    if entities and relations:
        print(f"Building and saving knowledge graph to {output_path}...")
        html_path, graph_json = build_and_save_graph_from_data(entities, relations, output_path)
        return {
            "html_location": html_path,
            "graph_data": graph_json
        }
    else:
        print("No entities or relations extracted from the context. Skipping graph creation.")
        return {
            "html_location": None,
            "graph_data": None
        }


if __name__ == "__main__":
    createDatabaseKnowledgeGraph()