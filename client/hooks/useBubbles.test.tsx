import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBubbles } from "./useBubbles";

describe("useBubbles", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a bubble for a while", () => {
    const { result } = renderHook(() => useBubbles(5000));
    act(() => result.current.say(0, "Eat this!"));
    expect(result.current.bubbles).toEqual({ 0: "Eat this!" });

    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.bubbles).toEqual({ 0: "Eat this!" });
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.bubbles).toEqual({});
  });

  it("replaces the bubble of a player with a new one, which stays its whole time", () => {
    const { result } = renderHook(() => useBubbles(5000));
    act(() => result.current.say(0, "One"));
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.say(0, "Two"));
    act(() => result.current.say(1, "Other"));

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.bubbles).toEqual({ 0: "Two", 1: "Other" });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.bubbles).toEqual({});
  });
});
