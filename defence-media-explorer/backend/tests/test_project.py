from pathlib import Path

import yaml

from app.db.indexes import SEARCH_INDEX_DEFINITION, text_vector_index_definition, vector_index_definition


ROOT = Path(__file__).resolve().parents[2]


def test_compose_services_exclude_mongodb():
    document = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
    services = document["services"]
    for name in ("frontend", "api", "worker", "redis", "minio"):
        assert name in services
    assert "mongodb" not in services
    assert "mongo" not in services


def test_env_example_lists_required_keys_without_secrets():
    text = (ROOT / ".env.example").read_text()
    for key in (
        "MONGODB_URI=",
        "MONGODB_DATABASE=defence_media_explorer",
        "VOYAGE_MULTIMODAL_MODEL=voyage-multimodal-3.5",
        "EMBEDDING_DIMENSIONS=1024",
        "ENABLE_RERANK=false",
        "ENABLE_TEXT_EMBEDDINGS=false",
        "VOYAGE_TEXT_MODEL=voyage-4-large",
        "TRANSCRIPTION_MODEL=whisper-1",
        "DEFAULT_LOCALE=en-GB",
        "SUPPORTED_LOCALES=it-IT,en-GB,fr-FR,es-ES,de-DE",
    ):
        assert key in text
    assert "mongodb+" + "srv://" not in text
    assert "mongodb" + "://" not in text


def test_vector_index_dimensions_and_filters():
    definition = vector_index_definition(1024)
    vector = next(field for field in definition["fields"] if field["type"] == "vector")
    assert vector["numDimensions"] == 1024
    assert vector["similarity"] == "cosine"
    paths = {field["path"] for field in definition["fields"] if field["type"] == "filter"}
    for required in ("workspaceId", "mediaType", "capturedAt", "uploadedAt", "tags", "sourceLanguage", "modality"):
        assert required in paths
    text_vector = text_vector_index_definition(1024)
    text_field = next(field for field in text_vector["fields"] if field["type"] == "vector")
    assert text_field["path"] == "textEmbedding"
    assert text_field["numDimensions"] == 1024
    assert text_field["path"] != vector["path"]


def test_search_index_has_five_language_analyzers():
    multi = SEARCH_INDEX_DEFINITION["mappings"]["fields"]["searchText"]["multi"]
    assert set(multi) == {"english", "french", "german", "spanish", "italian"}
    assert SEARCH_INDEX_DEFINITION["mappings"]["fields"]["searchText"]["analyzer"] == "lucene.standard"


def test_source_tree_has_no_live_connection_string():
    # Build the schemes in pieces so this file does not contain a live connection string.
    banned = ("mongodb+" + "srv://", "mongodb" + "://")
    allowed_suffixes = {".py", ".ts", ".tsx", ".js", ".md", ".yml", ".yaml", ".json", ".example", ".css"}
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.name == ".env" or any(part in {".git", "node_modules", ".next", ".venv"} for part in path.parts):
            continue
        if path.suffix not in allowed_suffixes and not path.name.endswith(".example"):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for marker in banned:
            assert marker not in text, path
