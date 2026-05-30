import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegionSwitcher from "./RegionSwitcher.jsx";

describe("RegionSwitcher", () => {
  it("calls onChange with the selected region", () => {
    const onChange = vi.fn();
    render(<RegionSwitcher regions={["us-east-1", "eu-west-1"]} value="us-east-1" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("AWS region"), { target: { value: "eu-west-1" } });
    expect(onChange).toHaveBeenCalledWith("eu-west-1");
  });
});
