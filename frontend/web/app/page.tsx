'use client';

import { add } from "@transport/utils";
import { Button } from "@transport/ui";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">2 + 3 = {add(2, 3)}</h1>
        <Button onClick={() => alert("Hello!")}>Click Me</Button>
      </div>
    </main>
  );
}
