from pathlib import Path

from app.db.indexes import SEARCH_INDEX_DEFINITION, text_vector_index_definition, vector_index_definition


ROOT = Path(__file__).resolve().parents[2]


def test_dev_script_starts_the_three_local_processes():
    script = (ROOT / "scripts" / "dev.sh").read_text()
    assert "app.workers" in script
    assert "uvicorn" in script
    assert "npm run dev" in script
    assert "localhost:3000" in script
    assert "minio" not in script.lower()
    assert "celery" not in script
    assert "redis" not in script
    assert not (ROOT / "docker-compose.yml").exists()
    requirements = (ROOT / "backend" / "requirements.txt").read_text()
    assert "boto3" not in requirements
    assert "celery" not in requirements
    assert not (ROOT / "backend" / "app" / "storage" / "s3.py").exists()


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
