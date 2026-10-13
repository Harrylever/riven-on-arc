import exchange_adapters as adapters


class FakeAdapter:
    def fetch_ohlcv(self, symbol, interval=None, limit=100):
        return ("ohlcv", symbol, interval, limit)

    def fetch_funding(self, symbol):
        return ("funding", symbol)

    def get_current_price(self, symbol):
        return ("price", symbol)

    def get_top_symbols(self, limit=50):
        return ("top", limit)

    def get_mid_symbols(self, rank_from=51, rank_to=200, min_vol=None):
        return ("mid", rank_from, rank_to, min_vol)


def test_market_data_dispatch_forwards_to_selected_adapter(monkeypatch):
    monkeypatch.setitem(adapters.ADAPTERS, "FAKE", FakeAdapter())

    assert adapters.fetch_ohlcv("FAKE", "BTCUSDT", "4h", 25) == (
        "ohlcv", "BTCUSDT", "4h", 25
    )
    assert adapters.fetch_funding("FAKE", "BTCUSDT") == ("funding", "BTCUSDT")
    assert adapters.get_current_price("FAKE", "BTCUSDT") == ("price", "BTCUSDT")
    assert adapters.get_top_symbols("FAKE", 10) == ("top", 10)
    assert adapters.get_mid_symbols("FAKE", 51, 75, 123) == ("mid", 51, 75, 123)
