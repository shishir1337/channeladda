"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout itself. It replaces the
 * whole document, so it has to ship its own html/body and inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#07090f",
          color: "#f2f5fa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>
            Channel Adda is temporarily unavailable
          </h1>
          <p style={{ margin: 0, lineHeight: 1.6, color: "#98a2b8" }}>
            No order or payment was affected. Please try again in a moment.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.8125rem",
                color: "#6f7a90",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              minHeight: "2.75rem",
              padding: "0 1.5rem",
              borderRadius: "0.75rem",
              border: 0,
              cursor: "pointer",
              fontSize: "0.9375rem",
              fontWeight: 600,
              background: "#ffb020",
              color: "#150e02",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
