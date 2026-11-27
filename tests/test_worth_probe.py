import worth_probe as wp


def test_summarise_reads_span_and_unpriceable_coins():
    pages = [[{"orderUuid": "a", "created": "2026-03-02T10:00:00Z"}, {"orderUuid": "b", "created": 1790000000000}]]
    s = wp.summarise(pages, {"BTC": 1, "FOO": 2, "AUD": 50}, {"BTC": "bitcoin"})
    assert s["orders"] == 2 and s["earliest"] == "2026-03-02" and s["unpriceable"] == ["FOO"] and s["heldCoins"] == 2
    assert "FOO" in wp.message("pool", s)


def test_fetch_pages_stops_when_paging_is_ignored():
    calls = []

    def get(path):
        calls.append(path)
        return [{"id": i} for i in range(100)]
    assert len(wp.fetch_pages(get)) == 1 and len(calls) == 2


def test_fetch_pages_stops_on_short_page_and_handles_wrapper():
    assert len(wp.fetch_pages(lambda p: {"orders": [{"id": 1}]})) == 1
    assert wp.message("x", wp.summarise([], {}, {})).endswith("no past orders.")


def test_run_once_never_raises_and_retries_after_a_failure():
    sent, done = [], set()

    class Boom:
        def _headers(self):
            raise RuntimeError("x")
    assert wp.run_once("a", "w", Boom(), {}, sent.append, lambda w: w in done, done.add) is False
    assert "w" not in done and sent == []


def test_created_time_is_read_in_every_likely_format():
    for v in ("2026-03-02T10:00:00.000Z", "2026-03-02 10:00:00", 1772445600000, 1772445600, "1772445600000"):
        t = wp.order_time_ms({"created_time": v})
        assert t and abs(t - 1772445600000) < 3 * 86_400_000, v
    assert "first:" in wp.sample_rows([[{"created_time": 1, "quantity": 2}]])
