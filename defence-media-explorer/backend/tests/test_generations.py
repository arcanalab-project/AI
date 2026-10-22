from app.pipeline.generations import swap_deletes_previous_first


def test_same_model_can_overlap_briefly():
    assert (
        swap_deletes_previous_first(
            previous_model="voyage-multimodal-3.5",
            previous_dimensions=1024,
            previous_pipeline_version="v1",
            next_model="voyage-multimodal-3.5",
            next_dimensions=1024,
            next_pipeline_version="v1",
        )
        is False
    )


def test_model_change_deletes_previous_generation_first():
    assert (
        swap_deletes_previous_first(
            previous_model="voyage-multimodal-3",
            previous_dimensions=1024,
            previous_pipeline_version="v1",
            next_model="voyage-multimodal-3.5",
            next_dimensions=1024,
            next_pipeline_version="v1",
        )
        is True
    )


def test_first_generation_has_nothing_to_delete():
    assert (
        swap_deletes_previous_first(
            previous_model=None,
            previous_dimensions=None,
            previous_pipeline_version=None,
            next_model="voyage-multimodal-3.5",
            next_dimensions=1024,
            next_pipeline_version="v1",
        )
        is False
    )
