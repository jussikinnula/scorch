import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LeaveButton from "./LeaveButton";

describe("LeaveButton", () => {
  afterEach(cleanup);

  it("asks before it leaves, and leaves only when told to", () => {
    const onLeave = vi.fn();
    render(<LeaveButton onLeave={onLeave} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leave the game" }));
    expect(screen.getByRole("alertdialog", { name: "Leave the game?" })).toBeInTheDocument();
    expect(onLeave).not.toHaveBeenCalled();
    // The answer that changes nothing is the one that has the focus
    expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Leave the game" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("takes Escape for staying, and keeps the keys from the game while it asks", () => {
    const onLeave = vi.fn();
    const game = vi.fn();
    window.addEventListener("keydown", game);
    render(<LeaveButton onLeave={onLeave} />);
    fireEvent.keyDown(window, { key: " " });
    expect(game).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Leave the game" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Stay" }), { key: " " });
    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    expect(game).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();

    // The keys are the game's again
    fireEvent.keyDown(window, { key: " " });
    expect(game).toHaveBeenCalledTimes(2);
    window.removeEventListener("keydown", game);
  });
});
