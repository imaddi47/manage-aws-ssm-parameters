import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeleteModal from "./DeleteModal.jsx";

describe("DeleteModal", () => {
  it("enables Delete only when the typed name matches and a passphrase is present", () => {
    const onConfirm = vi.fn();
    render(<DeleteModal open name="/a/b" onConfirm={onConfirm} onClose={() => {}} />);

    const btn = screen.getByRole("button", { name: /^delete$/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "/wrong" } });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "/a/b" } });
    expect(btn).toBeDisabled(); // name matches but no passphrase yet

    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "pw" } });
    expect(btn).toBeEnabled();
  });
});
