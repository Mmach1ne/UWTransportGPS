// apps/web/src/index.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { add } from "@org/utils";
import { Button } from "@org/ui";

const App = () => (
  <div>
    <h1>2 + 3 = {add(2, 3)}</h1>
    <Button onClick={() => alert("Hello!")}>Click Me</Button>
  </div>
);

createRoot(document.getElementById("root")!).render(<App />);
