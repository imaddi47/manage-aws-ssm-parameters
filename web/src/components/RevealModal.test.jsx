import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RevealModal from "./RevealModal.jsx";

describe("RevealModal", () => {
  it("reveals on confirm and clears the value when closed", async () => {
    const reveal = vi.fn().mockResolvedValue({ value: "s3cr3t" });
    const onClose = vi.fn();
    const { rerender } = render(
      <RevealModal open name="/a/b" reveal={reveal} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("Confirm reveal"));
    await waitFor(() => expect(screen.getByText("s3cr3t")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();

    rerender(<RevealModal open={false} name="/a/b" reveal={reveal} onClose={onClose} />);
    rerender(<RevealModal open name="/a/b" reveal={reveal} onClose={onClose} />);
    expect(screen.queryByText("s3cr3t")).not.toBeInTheDocument();
  });
});
