import React from "react";

import { nextTestDevice } from "../session";

interface Props {
  /** The address the QR code has. */
  joinUrl: string;
}

/** The size of the window of a test phone, in pixels. */
const WIDTH = 390;
const HEIGHT = 780;

/**
 * A button for testing (PLAYER_TESTING_MODE): opens the address of the QR code in a bare window the size of a phone,
 * to try a game with many players without many phones. Each window is a device of its own
 * (see testDevice in session.ts), so each can be a different player.
 */
export default function TestPhoneButton({ joinUrl }: Props) {
  const open = () => {
    const device = nextTestDevice();
    const url = new URL(joinUrl);
    url.searchParams.set("device", String(device));
    // The windows are laid side by side, a new row when the screen is full
    const columns = Math.max(1, Math.floor(window.screen.availWidth / WIDTH));
    const left = ((device - 1) % columns) * WIDTH;
    const top = (Math.floor((device - 1) / columns) % 2) * 80;
    window.open(url, `scorch-phone-${device}`, `popup=yes,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`);
  };

  return (
    <button className="button button--small" onClick={open}>
      Open a test phone
    </button>
  );
}
