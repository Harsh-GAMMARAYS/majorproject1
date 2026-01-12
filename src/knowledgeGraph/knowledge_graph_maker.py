import json
import os
import networkx as nx
from pyvis.network import Network  # <-- Import pyvis

# --- 1. Define File Names ---

data_dir = "database/entityRelation"

entities_file = data_dir+ "/entities.json"
relations_file = data_dir + "/entity_relations.json"

output_dir = 'assets'

# Define output file paths
graph_file_gexf = os.path.join(output_dir, 'knowledge_graph.gexf')
# We replace the PNG path with an HTML path
graph_file_html = os.path.join(output_dir, 'knowledge_graph.html')


# --- 2. Helper Functions for Loading ---

def load_set_from_json(filename):
    """Loads a list from a JSON file and converts it to a set."""
    if not os.path.exists(filename):
        print(f"⚠️ Error: File not found: {filename}")
        return set()
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return set(data)
    except (json.JSONDecodeError):
        print(f"⚠️ Error: Could not decode {filename}.")
        return set()

def load_relations_from_json(filename):
    """Loads a list of lists from JSON and converts to a set of tuples."""
    if not os.path.exists(filename):
        print(f"⚠️ Error: File not found: {filename}")
        return set()
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            list_of_lists = json.load(f)
            # Convert each inner list to a tuple
            return {tuple(relation) for relation in list_of_lists}
    except (json.JSONDecodeError):
        print(f"⚠️ Error: Could not decode {filename}.")
        return set()

# --- 3. Main Graph Building Logic ---

def build_and_save_graph():
    """
    Loads entities and relations, builds a graph,
    and saves it to the assets/ directory.
    """
    
    # Create the assets directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Load data from files
    print("--- Loading Data ---")
    entities = load_set_from_json(entities_file)
    relations = load_relations_from_json(relations_file)
    
    if not entities and not relations:
        print("❌ Error: Both entity and relation files are empty or missing. Cannot build graph.")
        return

    print(f"Loaded {len(entities)} entities and {len(relations)} relations.")
    
    # Build the graph
    print("\n--- Building Graph ---")
    # We use a DiGraph (Directed Graph) because relations have direction
    G = nx.DiGraph()
    
    # 1. Add all entities as nodes
    G.add_nodes_from(entities)
    
    # 2. Add all relations as edges
    for head, rel, tail in relations:
        # We store the relation type in the 'label' attribute
        G.add_edge(head, tail, label=rel)
        
    print(f"✅ Graph built successfully with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.")
    
    # Save the graph to data file (GEXF) - still useful for Gephi
    try:
        print(f"\n--- Saving Graph Data (GEXF) ---")
        nx.write_gexf(G, graph_file_gexf)
        print(f"✅ Graph data saved to: {graph_file_gexf}")
        print("   (You can open this file in Gephi for interactive visualization)")
    except Exception as e:
        print(f"❌ Error saving GEXF file: {e}")
        
    # --- NEW: Save an interactive HTML visualization (Pyvis) ---
    try:
        print(f"\n--- Saving Interactive Graph Visualization (HTML) ---")
        
        # Create a pyvis network object
        nt = Network(height='800px', width='100%', directed=True, heading='Knowledge Graph')
        
        # Load the networkx graph into pyvis
        nt.from_nx(G)
        
        # Add physics-based layout controls
        nt.show_buttons(filter_=['physics'])
        
        # Save the graph as an HTML file
        nt.save_graph(graph_file_html)
        
        print(f"✅ Interactive graph saved to: {graph_file_html}")
        print("   (You can open this file directly in your web browser)")
        
    except Exception as e:
        print(f"❌ Error saving HTML image: {e}")


def build_and_save_graph_from_data(entities, relations, output_filename="assets/context_kg.html"):
    """
    Builds a graph from provided entities and relations and saves it to a specific HTML file.
    Also returns the graph data as JSON for frontend visualization.
    Returns: (html_path, json_data)
    """
    # output_dir = os.path.dirname(output_filename)
    # os.makedirs(output_dir, exist_ok=True)

    if not entities and not relations:
        print("❌ Error: No entities or relations provided. Cannot build graph.")
        return None, None

    print(f"Building graph with {len(entities)} entities and {len(relations)} relations.")

    G = nx.DiGraph()
    G.add_nodes_from(entities)
    for head, rel, tail in relations:
        G.add_edge(head, tail, label=rel)

    print(f"✅ Graph built with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.")

    # Extract JSON data for frontend
    graph_json = extract_graph_data_as_json(G)

    try:
        print(f"\n--- Saving Interactive Graph Visualization (HTML) ---")
        nt = Network(height='800px', width='100%', directed=True, heading='Context Knowledge Graph')
        nt.from_nx(G)
        nt.show_buttons(filter_=['physics'])
        nt.save_graph(output_filename)
        print(f"✅ Interactive graph saved to: {output_filename}")
        return output_filename, graph_json
    except Exception as e:
        print(f"❌ Error saving HTML file: {e}")
        return None, graph_json


def extract_graph_data_as_json(G):
    """
    Extracts graph data from a NetworkX graph and returns it as JSON-serializable dict.
    Format: {
        "nodes": [{"id": "entity1", "label": "entity1"}, ...],
        "edges": [{"from": "entity1", "to": "entity2", "label": "relation_type"}, ...]
    }
    """
    nodes = []
    edges = []
    
    # Extract nodes
    for node in G.nodes():
        nodes.append({
            "id": str(node),
            "label": str(node),
            "title": str(node)  # vis.js uses title for hover text
        })
    
    # Extract edges
    for head, tail, data in G.edges(data=True):
        edges.append({
            "from": str(head),
            "to": str(tail),
            "label": str(data.get('label', '')),
            "title": str(data.get('label', ''))  # vis.js uses title for hover text
        })
    
    return {
        "nodes": nodes,
        "edges": edges
    }


# --- 4. Run the script ---
if __name__ == "__main__":
    build_and_save_graph()

