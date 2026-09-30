import { render, screen } from "@testing-library/react";
import ForecastChart from "./ForecastChart";

const history = Array.from({ length: 6 }, (_, i) => ({ timestamp: `2010-11-26T0${i}:00:00`, value: i === 3 ? null : 1 + i * 0.1 }));
const values = Array.from({ length: 4 }, (_, i) => ({ timestamp: `2010-11-26T0${6 + i}:00:00`, predicted: 1.5 + i * 0.1, actual: null }));

test("draws history and forecast; no actual line without actuals", () => {
  const { container } = render(<ForecastChart history={history} values={values} label="Global_active_power" />);
  expect(screen.getByRole("img")).toHaveAccessibleName(/forecast/i);
  expect(container.querySelectorAll("path")).toHaveLength(2);          // history + forecast only
  expect(screen.queryByText("Actual")).not.toBeInTheDocument();
});

test("backtests show the actual series in the legend", () => {
  const { container } = render(<ForecastChart history={history} values={values.map((v) => ({ ...v, actual: 1.4 }))} label="x" />);
  expect(screen.getByText("Actual")).toBeInTheDocument();
  expect(container.querySelectorAll("path")).toHaveLength(3);
});

test("renders a message instead of crashing when there is nothing to plot", () => {
  render(<ForecastChart history={[]} values={[]} />);
  expect(screen.getByText("No data to chart.")).toBeInTheDocument();
});
