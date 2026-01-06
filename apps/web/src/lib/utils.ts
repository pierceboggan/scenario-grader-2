import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validateEmail(email: string): boolean {
  if (!email) return false
  const normalized = String(email).trim().toLowerCase()
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  return re.test(normalized)
}
