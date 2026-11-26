import React, { useMemo } from "react";
import qrcode from "qrcode-generator";

interface Props {
  /** What the code says, e.g. an address. */
  value: string;
  /** What the code is, for those who cannot see it. */
  label: string;
}

/** The empty border a QR code needs around it, in modules. */
const MARGIN = 4;

/** A QR code as a picture that scales to the space it is given. */
export default function QrCode({ value, label }: Props) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();

    const count = code.getModuleCount();
    let squares = "";
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        if (code.isDark(row, column)) squares += `M${column + MARGIN},${row + MARGIN}h1v1h-1z`;
      }
    }
    return { size: count + 2 * MARGIN, path: squares };
  }, [value]);

  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      data-value={value}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
