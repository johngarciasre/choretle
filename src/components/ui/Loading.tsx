"use client";

import { Star } from "lucide-react";

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      {label ? (
        <div className="text-center">
          <Star className="animate-bounce text-coral size-10 mx-auto mb-4" />
          <p className="font-bold text-ink/60">{label}</p>
        </div>
      ) : (
        <Star className="animate-bounce text-coral size-10" />
      )}
    </div>
  );
}

export default PageLoader;
