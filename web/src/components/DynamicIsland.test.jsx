import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DynamicIsland from "./DynamicIsland.jsx";

const noop = () => {};

describe("DynamicIsland — deleteConfirm", () => {
  it("enables Delete only when the typed name matches and a passphrase is present", () => {
    const onConfirmDelete = vi.fn();
    render(
      <DynamicIsland
        state={{ kind: "deleteConfirm", leaf: "init-script.sh" }}
        onConfirmReveal={noop}
        onSubmitPassphrase={noop}
        onConfirmDelete={onConfirmDelete}
        onCancel={noop}
      />
    );
    const btn = screen.getByRole("button", { name: /^delete$/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm name"), { target: { value: "wrong" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm name"), { target: { value: "init-script.sh" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "pw" } });
    expect(btn).toBeEnabled();
  });
});
