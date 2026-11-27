"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** Small dependency-free QR matrix, rendered as a grid of cells. */
export function QrCode({ value, cell = 6 }: { value: string; cell?: number }) {
  const modules = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let row = 0; row < count; row += 1) {
      const cells: boolean[] = [];
      for (let col = 0; col < count; col += 1) cells.push(qr.isDark(row, col));
      rows.push(cells);
    }
    return rows;
  }, [value]);

  return (
    <div
      className="inline-grid gap-0 rounded-xl bg-white p-3"
      style={{ gridTemplateColumns: `repeat(${modules.length}, ${cell}px)` }}
      role="img"
      aria-label="Setup QR code"
    >
      {modules.flatMap((row, rowIndex) =>
        row.map((dark, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            className={dark ? "bg-ink" : "bg-white"}
            style={{ width: cell, height: cell }}
          />
        )),
      )}
    </div>
  );
}
