"use client";

import { useState } from "react";
import PhotoUploadModal from "./PhotoUploadModal";

interface Photo {
  id: string;
  url: string;
  title?: string | null;
  isProbative: boolean;
}

interface PhotoCarouselProps {
  photos: Photo[];
  objectType?: string;
  objectId: string;
}

export default function PhotoCarousel({ photos, objectId }: PhotoCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  if (!photos || photos.length === 0) {
    return (
      <div className="mt-4 border-t border-ink/10 pt-4">
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 rounded-full font-bold border-2 border-dashed border-ink/30 hover:border-grape/60 transition-colors text-ink/60 hover:text-grape"
        >
          + Add Photo
        </button>
      </div>
    );
  }

  const current = photos[currentIndex];
  const hasProbative = photos.some((p) => p.isProbative);

  return (
    <>
      <div className="mt-4 border-t border-ink/10 pt-4 space-y-4">
        <h3 className="font-display text-lg font-bold text-ink">
          Photos ({photos.length})
          {hasProbative && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red/15 text-red font-bold">
              Has Proof
            </span>
          )}
        </h3>

        <div className="relative">
          <div className="w-full h-240 rounded-xl overflow-hidden bg-cream relative">
            <img
              src={current.url}
              alt={current.title || "Photo"}
              className="w-full h-full object-cover"
            />
          </div>

          {photos.length > 1 && (
            <>
              <button
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
              >
                <span className="text-ink text-xl font-bold">‹</span>
              </button>
              <button
                onClick={() => setCurrentIndex(Math.min(photos.length - 1, currentIndex + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
              >
                <span className="text-ink text-xl font-bold">›</span>
              </button>
            </>
          )}

          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => setCurrentIndex(index)}
                className={`sh-48 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${
                  index === currentIndex
                    ? "border-grape"
                    : "border-transparent hover:border-grape/40"
                }`}
              >
                <img src={photo.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>

          {current.title && (
            <p className="mt-2 text-sm text-ink/60 text-center">{current.title}</p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 rounded-full font-bold border-2 border-dashed border-ink/30 hover:border-grape/60 transition-colors text-ink/60 hover:text-grape"
          >
            + Add Photo
          </button>
        </div>
      </div>

      {showUpload && (
        <PhotoUploadModal
          isOpen={showUpload}
          onClose={() => setShowUpload(false)}
          objectType="job"
          objectId={objectId}
        />
      )}
    </>
  );
}
