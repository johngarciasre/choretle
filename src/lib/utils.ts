import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names with Tailwind's twMerge for predictable styling */
export function cn(...classes: Array<ClassValue | undefined>) {
  return twMerge(clsx(...classes));
}
