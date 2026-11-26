import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThrottled } from "./useThrottled";

describe("useThrottled", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs at once, then joins the calls of an interval into one run", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useThrottled(run, 50));

    result.current();
    expect(run).toHaveBeenCalledTimes(1);

    result.current();
    result.current();
    result.current();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(49);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(2);
    result.current();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not run after the component is gone", () => {
    const run = vi.fn();
    const { result, unmount } = renderHook(() => useThrottled(run, 50));
    result.current();
    result.current();
    unmount();
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
