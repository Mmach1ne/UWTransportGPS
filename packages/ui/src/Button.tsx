// packages/ui/src/Button.tsx
import React from "react";

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ onClick, children }) => (
  <button 
    onClick={onClick} 
    className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
  >
    {children}
  </button>
);