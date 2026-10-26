from app.media.documents import pages_for_range


def test_a_chunk_keeps_the_pdf_pages_it_touches():
    spans = [(1, 0, 40), (2, 42, 90), (4, 92, 120)]
    assert pages_for_range(spans, 0, 40) == (1, 1)
    assert pages_for_range(spans, 30, 50) == (1, 2)
    assert pages_for_range(spans, 100, 110) == (4, 4)
    assert pages_for_range(spans, 90, 91) == (4, 4)
    assert pages_for_range([], 0, 10) == (None, None)
