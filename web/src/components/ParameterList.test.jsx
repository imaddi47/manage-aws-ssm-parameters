import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ParameterList from "./ParameterList.jsx";

const items = [
  { name: "/toddle/x/init-script.sh", type: "String" },
  { name: "/toddle/x/pgbouncer.ini", type: "SecureString" },
];

describe("ParameterList", () => {
  it("renders leaf names and selects on click", () => {
    const onSelect = vi.fn();
    render(<ParameterList items={items} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("init-script.sh"));
    expect(onSelect).toHaveBeenCalledWith("/toddle/x/init-script.sh");
  });

  it("filters by query (case-insensitive)", () => {
    render(<ParameterList items={items} selected={null} query="PGBOUNCER" onSelect={() => {}} />);
    expect(screen.queryByText("init-script.sh")).not.toBeInTheDocument();
    expect(screen.getByText("pgbouncer.ini")).toBeInTheDocument();
  });
});
