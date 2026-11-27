import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { setSound } from "../sound/sound";
import SoundControls from "./SoundControls";

describe("SoundControls", () => {
  afterEach(() => {
    cleanup();
    setSound({ music: false, effects: true });
  });

  it("has the music off and the effects on until the user chooses otherwise", () => {
    render(<SoundControls />);
    expect(screen.getByRole("button", { name: "Music off" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Effects on" })).toHaveAttribute("aria-pressed", "true");
  });

  it("turns each on and off, everywhere it is shown at once, and remembers the choice", () => {
    render(
      <>
        <SoundControls />
        <SoundControls />
      </>
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Music off" })[0]);
    expect(screen.getAllByRole("button", { name: "Music on" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Effects on" })[1]);
    expect(screen.getAllByRole("button", { name: "Effects off" })).toHaveLength(2);
    expect(JSON.parse(window.localStorage.getItem("scorch.sound") ?? "{}")).toEqual({ music: true, effects: false });
  });
});
