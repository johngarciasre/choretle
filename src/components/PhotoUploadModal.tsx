"use client";

import { useState } from "react";
import { error } from "@/lib/logger";

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  objectType: string;
  objectId: string;
}

export default function PhotoUploadModal({ isOpen, onClose, objectType, objectId }: PhotoUploadModalProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isProbative, setIsProbative] = useState(true);
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  async function handleUpload() {
    if (!url) return;
    setUploading(true);

    try {
      const familyId = localStorage.getItem("familyId") || "";
      await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(familyId ? { "x-family-id": familyId } : {}) },
        body: JSON.stringify({ objectType, objectId, url, title, isProbative }),
      });
      setUrl("");
      setTitle("");
      setIsProbative(true);
      window.location.reload();
    } catch (err) {
      error({ err: err }, "Upload failed");
      alert("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-6 w-480 max-w-full shadow-xl">
        <h3 className="font-display text-xl font-bold text-ink mb-4">Add Photo</h3>

        <label className="block text-sm font-medium text-ink/70 mb-1">Photo URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/photo.jpg"
          className="w-full px-4 py-2 rounded-xl border-2 border-ink/15 bg-cream focus:border-grape focus:outline-none font-bold text-ink mb-3"
        />

        <label className="block text-sm font-medium text-ink/70 mb-1">Title (optional)</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give this photo a title"
          className="w-full px-4 py-2 rounded-xl border-2 border-ink/15 bg-cream focus:border-grape focus:outline-none font-bold text-ink mb-3"
        />

        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={isProbative}
            onChange={(e) => setIsProbative(e.target.checked)}
            className="mr-1 accent-grape"
          />
          <span className="text-sm text-ink/70">Probative (proof of completion)</span>
        </label>

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full font-bold border-2 border-ink/15 hover:bg-ink/5 transition-colors text-ink"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!url || uploading}
            className="px-4 py-2 rounded-full font-bold bg-grape text-white hover:bg-grape/90 transition-colors disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
