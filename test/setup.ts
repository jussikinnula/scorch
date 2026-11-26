import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// What a test stores in the browser is not there for the next one
afterEach(() => {
  if (typeof window !== "undefined") window.localStorage?.clear();
});

// The test environment cannot draw: a canvas has no context there, and what draws on one skips the drawing
if (typeof HTMLCanvasElement !== "undefined") HTMLCanvasElement.prototype.getContext = () => null;
