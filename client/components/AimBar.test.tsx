import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AimBar from "./AimBar";

/** The bar with an aim that it changes, as the view that has it does. */
function Bar({ maxPower = 1000 }: { maxPower?: number }) {
  const [aim, setAim] = useState({ angle: 60, power: 500 });
  return <AimBar {...aim} maxPower={maxPower} onChange={(change) => setAim((now) => ({ ...now, ...change }))} />;
}

/** Lets time pass a repeat of a held button at a time, so that the bar is redrawn between the repeats as on a real page. */
const hold = (milliseconds: number) => {
  for (let passed = 0; passed < milliseconds; passed += 10) act(() => void vi.advanceTimersByTime(10));
};

describe("AimBar", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the angle from the horizon and the power, and changes them a step at a press", () => {
    render(<Bar />);
    expect(screen.getByLabelText("Angle")).toHaveTextContent("60° →");
    expect(screen.getByLabelText("Power value")).toHaveTextContent("500");

    fireEvent.click(screen.getByRole("button", { name: "Turn the turret left" }));
    expect(screen.getByLabelText("Angle")).toHaveTextContent("61° →");
    fireEvent.click(screen.getByRole("button", { name: "More power" }));
    fireEvent.click(screen.getByRole("button", { name: "More power" }));
    fireEvent.click(screen.getByRole("button", { name: "Less power" }));
    expect(screen.getByLabelText("Power value")).toHaveTextContent("505");
  });

  it("keeps changing while a button is held, faster after a while, and stops when it is let go", () => {
    render(<Bar />);
    const more = screen.getByRole("button", { name: "More power" });
    fireEvent.pointerDown(more);
    hold(300);
    expect(screen.getByLabelText("Power value")).toHaveTextContent("500");
    // Ten repeats of five
    hold(50 + 60 * 10);
    expect(screen.getByLabelText("Power value")).toHaveTextContent("550");
    hold(60 * 6);
    const held = Number(screen.getByLabelText("Power value").textContent);
    expect(held).toBeGreaterThan(600);

    fireEvent.pointerUp(more);
    hold(1000);
    expect(screen.getByLabelText("Power value")).toHaveTextContent(String(held));
  });

  it("stays within what the turret and the energy of the tank allow", () => {
    render(<Bar maxPower={510} />);
    const more = screen.getByRole("button", { name: "More power" });
    for (let press = 0; press < 5; press++) fireEvent.click(more);
    expect(screen.getByLabelText("Power value")).toHaveTextContent("510");

    const left = screen.getByRole("button", { name: "Turn the turret left" });
    fireEvent.pointerDown(left);
    hold(9000);
    fireEvent.pointerUp(left);
    // All the way to the left horizon: 180 degrees, shown as 0 to the left
    expect(screen.getByLabelText("Angle")).toHaveTextContent("0° ←");
  });
});
