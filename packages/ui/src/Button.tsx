// packages/ui/src/Button.tsx
import React from "react";

export const Button: React.FC<{ onClick(): void }> = ({ onClick, children }) => (
  <button onClick={onClick} className="px-4 py-2 rounded bg-blue-500 text-white">
    {children}
  </button>
);
