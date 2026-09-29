"""Unit tests for loading, timestamps, preprocessing, features, splitting, metrics and baselines.
Small hand-written frames are used here only to test function behaviour; pipeline tests use the real files."""
import numpy as np
import pandas as pd
import pytest

from app.data.loader import CsvFormatError, read_csv_frame, sniff_csv
from app.data.preprocessing import fill_short_gaps, resample_to_modeling_grid
from app.data.timestamps import TimestampError, detect_timestamp_layout, parse_timestamps
from app.features.engineering import FeaturePlan, build_features, default_lags_and_windows
from app.ml.base import TrainingContext
from app.ml.baselines import block_origins, naive, seasonal_naive_factory
from app.ml.metrics import regression_metrics
from app.ml.splitting import chronological_split
from app.utils.frequency import FrequencyError, freq_to_minutes, resolve_modeling_minutes


# ---- loader --------------------------------------------------------------------------------------------
def test_sniff_quote_wrapped_semicolon_file(tmp_path):
    p = tmp_path / "a.csv"
    p.write_text('"Date;Time;Power"\n"16/12/2006;17:24:00;4.216"\n"16/12/2006;17:25:00;?"\n')
    meta = sniff_csv(p)
    assert (meta.delimiter, meta.has_header, meta.wrapped_in_quotes) == (";", True, True)
    df = read_csv_frame(p, meta)
    assert list(df.columns) == ["Date", "Time", "Power"]
    assert df["Power"].isna().sum() == 1 and df["Power"].iloc[0] == 4.216  # '?' -> missing


def test_sniff_headerless_numeric_file(tmp_path):
    p = tmp_path / "b.csv"
    p.write_text("1.0,2.0,3.0\n4.0,5.0,6.0\n")
    meta = sniff_csv(p)
    assert meta.has_header is False and meta.columns == ["col_0", "col_1", "col_2"]
    assert read_csv_frame(p, meta).shape == (2, 3)


def test_binary_and_empty_files_rejected(tmp_path):
    (tmp_path / "bin.csv").write_bytes(b"\x00\x01\x02\x03")
    (tmp_path / "empty.csv").write_bytes(b"")
    for name in ("bin.csv", "empty.csv"):
        with pytest.raises(CsvFormatError):
            sniff_csv(tmp_path / name)


# ---- timestamps ----------------------------------------------------------------------------------------
def test_date_time_pair_detected_and_parsed():
    df = pd.DataFrame({"Date": ["16/12/2006", "17/12/2006", "31/12/2006"] * 3, "Time": ["17:24:00", "00:00:00", "23:59:00"] * 3, "v": range(9)})
    layout = detect_timestamp_layout(df)
    assert layout["columns"] == ["Date", "Time"] and layout["format"] == "%d/%m/%Y %H:%M:%S" and not layout["ambiguous"]
    ts, fmt = parse_timestamps(df, layout["columns"])
    assert ts.iloc[0] == pd.Timestamp("2006-12-16 17:24:00") and ts.notna().all()


def test_ambiguous_day_month_order_is_not_guessed():
    df = pd.DataFrame({"Date": ["01/02/2007", "03/04/2007", "05/06/2007"], "Time": ["00:00:00"] * 3})
    assert detect_timestamp_layout(df)["ambiguous"] is True
    with pytest.raises(TimestampError, match="ambiguous"):
        parse_timestamps(df, ["Date", "Time"])
    ts, _ = parse_timestamps(df, ["Date", "Time"], "%d/%m/%Y %H:%M:%S")  # explicit format resolves it
    assert ts.iloc[0] == pd.Timestamp("2007-02-01")


def test_numeric_columns_are_not_timestamps():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [4.0, 5.0, 6.0]})
    assert detect_timestamp_layout(df)["columns"] == []
    with pytest.raises(TimestampError, match="numeric"):
        parse_timestamps(df, ["a"])


# ---- frequency -----------------------------------------------------------------------------------------
def test_frequency_helpers():
    assert (freq_to_minutes("1min"), freq_to_minutes("h"), freq_to_minutes("30min"), freq_to_minutes("1D")) == (1, 60, 30, 1440)
    for bad in ("7min", "2W", "abc", "0min"):
        with pytest.raises(FrequencyError):
            freq_to_minutes(bad)
    assert resolve_modeling_minutes(1, None) == 60 and resolve_modeling_minutes(60, None) == 60
    with pytest.raises(FrequencyError):
        resolve_modeling_minutes(60, "30min")  # cannot upsample


# ---- preprocessing ------------------------------------------------------------------------------------
def test_fill_short_gaps_never_partially_fills_long_gaps():
    idx = pd.date_range("2020-01-01", periods=30, freq="h")
    s = pd.Series(np.arange(30, dtype=float), index=idx)
    s.iloc[[5, 6]] = np.nan          # short run (2)
    s.iloc[10:20] = np.nan           # long run (10)
    s.iloc[0] = np.nan               # leading gap
    out = fill_short_gaps(s, max_len=6)
    assert out.iloc[5] == pytest.approx(5.0) and out.iloc[6] == pytest.approx(6.0)
    assert out.iloc[10:20].isna().all() and np.isnan(out.iloc[0])


def test_resample_requires_minimum_coverage():
    idx = pd.date_range("2020-01-01 00:00", periods=180, freq="min")
    v = pd.Series(1.0, index=idx)
    v.iloc[60:120] = 2.0
    v.iloc[130:180] = np.nan         # hour 2: only 10/60 valid -> below 50% coverage
    out = resample_to_modeling_grid(pd.DataFrame({"x": v}), 1, 60, 0.5)
    assert out["x"].tolist()[:2] == [1.0, 2.0] and np.isnan(out["x"].iloc[2])


# ---- features: no leakage --------------------------------------------------------------------------------
def _plan(h=24):
    lags, wins = default_lags_and_windows(60, h)
    return FeaturePlan(horizon=h, freq_minutes=60, lags=lags, rolling_windows=wins, use_calendar=True, exogenous=["x"])


def test_features_only_use_data_available_at_forecast_time():
    rng = np.random.default_rng(0)
    idx = pd.date_range("2020-01-01", periods=600, freq="h")
    frame = pd.DataFrame({"y": rng.normal(size=600).cumsum(), "x": rng.normal(size=600)}, index=idx)
    plan = _plan()
    base = build_features(frame, "y", plan)
    t = 500
    tampered = frame.copy()
    tampered.iloc[t - plan.horizon + 1 :, :] += 1000.0   # change everything after the forecast origin
    changed = build_features(tampered, "y", plan)
    pd.testing.assert_series_equal(base.iloc[t], changed.iloc[t])


def test_lags_shorter_than_horizon_are_rejected():
    frame = pd.DataFrame({"y": np.arange(100.0)}, index=pd.date_range("2020-01-01", periods=100, freq="h"))
    with pytest.raises(ValueError, match="leak"):
        build_features(frame, "y", FeaturePlan(horizon=24, freq_minutes=60, lags=[1, 24]))


# ---- splitting -----------------------------------------------------------------------------------------
def test_chronological_split_is_ordered_disjoint_and_midnight_aligned():
    idx = pd.date_range("2020-01-01 05:00", periods=24 * 60, freq="h")
    split = chronological_split(idx, 0.7, 0.15, 60)
    m = split.masks(idx)
    assert (m["train"].astype(int) + m["validation"] + m["test"] == 1).all()  # partition, no overlap
    assert idx[m["train"]].max() < idx[m["validation"]].min() and idx[m["validation"]].max() < idx[m["test"]].min()
    assert split.train_end.hour == 0 and split.val_end.hour == 0


def test_split_rejects_bad_input():
    idx = pd.date_range("2020-01-01", periods=10, freq="h")
    with pytest.raises(ValueError):
        chronological_split(idx, 0.9, 0.2, 60)
    with pytest.raises(ValueError):
        chronological_split(idx[::-1], 0.7, 0.15, 60)


# ---- metrics -------------------------------------------------------------------------------------------
def test_metrics_known_values():
    m = regression_metrics([1, 2, 3, 4], [1, 3, 2, 6])
    assert m["mae"] == pytest.approx(1.0) and m["rmse"] == pytest.approx(np.sqrt(1.5))
    assert m["mape"] == pytest.approx((0 + 0.5 + 1 / 3 + 0.5) / 4 * 100) and m["n"] == 4


def test_mape_undefined_with_zero_actuals_and_nan_pairs_excluded():
    assert regression_metrics([0, 1, 2], [1, 1, 2])["mape"] is None
    m = regression_metrics([1, np.nan, 3], [2, 5, np.nan])
    assert m["n"] == 1 and m["mae"] == 1.0


# ---- baselines -----------------------------------------------------------------------------------------
def _ctx(y):
    idx = y.index
    split = chronological_split(idx, 0.5, 0.25, 60)
    eval_index = idx[idx >= split.train_end]
    ok = pd.Series(True, index=idx)
    return TrainingContext(y=y, X=pd.DataFrame(index=idx), train_rows=ok, val_rows=ok, eval_index=eval_index,
                           split=split, plan=FeaturePlan(horizon=24, freq_minutes=60), steps_per_day=24,
                           seasonal_period=24, arima_fit_window=500), split


def test_naive_and_seasonal_naive_use_only_information_before_the_block():
    idx = pd.date_range("2020-01-01", periods=24 * 20, freq="h")
    y = pd.Series(np.arange(len(idx), dtype=float), index=idx)
    ctx, split = _ctx(y)
    origins = block_origins(ctx)
    assert (origins < ctx.eval_index).all() and origins[0] == split.train_end - pd.Timedelta(hours=1)
    assert ((ctx.eval_index - origins) <= pd.Timedelta(hours=24)).all()  # horizon never exceeds 24h
    nv = naive(ctx).predictions
    assert (nv.iloc[:24] == y.loc[origins[0]]).all()                      # flat at last observed value
    sn = seasonal_naive_factory(24)(ctx).predictions
    assert (sn.values == y.shift(24).reindex(ctx.eval_index).values).all()
