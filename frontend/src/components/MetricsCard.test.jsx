import { render, screen } from "@testing-library/react";
import MetricsCard from "./MetricsCard";
import { fmtNum } from "../services/format";

test("undefined MAPE is shown as n/a, never as a number", () => {
  render(<MetricsCard label="MAPE" value={null} unit="%" />);
  expect(screen.getByText("n/a")).toBeInTheDocument();
});

test("formats numbers", () => {
  expect(fmtNum(0.41701286, 3)).toBe("0.417");
  expect(fmtNum(undefined)).toBe("n/a");
});
