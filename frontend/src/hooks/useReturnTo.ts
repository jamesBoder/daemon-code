import { useLocation } from 'react-router-dom'

// The console shell's "where to go back to" pattern: Play.tsx sets
// returnTo: '/play' when entering a session so every exit path (complete,
// quit, "not ready yet") returns to the console instead of the old
// BottomNav entry point's /home default. Was independently re-derived with
// its own `(location.state as {...} | null)?.returnTo` cast in Session.tsx
// and SessionComplete.tsx -- a future exit path (an error boundary, a new
// minigame's own quit button) could easily forget the cast and silently
// revert to /home, the exact bug f641261 fixed. One place to get it right.
export function useReturnTo(): string | undefined {
  const location = useLocation()
  return (location.state as { returnTo?: string } | null)?.returnTo
}
