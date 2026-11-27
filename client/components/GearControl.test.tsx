import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GearControl from "./GearControl";

describe("GearControl", () => {
  afterEach(cleanup);
  const counts = { battery: 3, shield: 1, parachute: 8, "force-shield": 2 };

  it("shows nothing for a tank that has no accessories and no shield", () => {
    const { container } = render(<GearControl counts={{}} energy={100} shield={0} onUse={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has a button for each accessory that is used, and tells of those that are worn", () => {
    const onUse = vi.fn();
    render(<GearControl counts={counts} energy={80} shield={50} onUse={onUse} />);
    expect(screen.getByLabelText("Shield")).toHaveTextContent("Shield 50");
    expect(screen.getByLabelText("Parachutes")).toHaveTextContent("Parachute × 8");
    fireEvent.click(screen.getByRole("button", { name: "Use Force Shield" }));
    expect(onUse).toHaveBeenCalledWith("force-shield");
    expect(screen.queryByRole("button", { name: "Inventory" })).toBeNull();
  });

  it("does not offer a battery to a tank that has all of its energy", () => {
    render(<GearControl counts={counts} energy={100} shield={0} onUse={() => {}} />);
    expect(screen.getByRole("button", { name: "Use Battery" })).toBeDisabled();
  });

  it("keeps the accessories behind one button where there is little room: they open as a list", () => {
    const onUse = vi.fn();
    const game = vi.fn();
    window.addEventListener("keydown", game);
    render(<GearControl compact counts={counts} energy={80} shield={50} onUse={onUse} />);
    // The shield that is up is told beside the button; the rest is in the list
    expect(screen.getByLabelText("Shield")).toHaveTextContent("Shield 50");
    expect(screen.queryByRole("button", { name: "Use Battery" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    const list = screen.getByRole("dialog", { name: "Inventory" });
    expect(within(list).getByLabelText("Parachutes")).toBeInTheDocument();
    // Using something leaves the list open: a tank may take several batteries
    fireEvent.click(within(list).getByRole("button", { name: "Use Battery" }));
    fireEvent.click(within(list).getByRole("button", { name: "Use Battery" }));
    expect(onUse.mock.calls).toEqual([["battery"], ["battery"]]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The keys of the game do nothing while it is open, and Escape closes it
    fireEvent.keyDown(document.body, { key: " " });
    expect(game).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    window.removeEventListener("keydown", game);
  });
});
