import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegionSwitcher from "./RegionSwitcher.jsx";

describe("RegionSwitcher", () => {
  it("opens, filters, and selects a region", () => {
    const onChange = vi.fn();
    render(
      <RegionSwitcher
        regions={["us-east-1", "eu-west-1", "ap-south-1"]}
        value="us-east-1"
        onChange={onChange}
      />
    );

    // Closed initially — no listbox.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Open via the trigger.
    fireEvent.click(screen.getByRole("button", { name: "AWS region" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Filter narrows the options.
    fireEvent.change(screen.getByLabelText("Filter regions"), { target: { value: "eu" } });
    expect(screen.queryByRole("option", { name: "ap-south-1" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "eu-west-1" })).toBeInTheDocument();

    // Selecting reports the chosen region and closes.
    fireEvent.click(screen.getByRole("option", { name: "eu-west-1" }));
    expect(onChange).toHaveBeenCalledWith("eu-west-1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
