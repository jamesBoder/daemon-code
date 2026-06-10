import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ProtectedRoute } from './components/ui/ProtectedRoute'
import { useAuthStore } from './stores/authStore'
import { Welcome } from './screens/Welcome'
import { Register } from './screens/auth/Register'
import { Login } from './screens/auth/Login'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Session } from './screens/Session'
import { SessionComplete } from './screens/SessionComplete'
import { ProcessLog } from './screens/ProcessLog'
import { Settings } from './screens/Settings'
import { Chronicle } from './screens/Chronicle'
import { Codex } from './screens/Codex'
import { Pulse } from './screens/Pulse'
import { ROUTE_TRANSITION_MS } from './lib/constants'

// BottomNav destinations share a key — AnimatePresence never crossfades between them
const BOTTOM_NAV_PATHS = new Set(['/home', '/chronicle', '/processes', '/settings'])

function RootRedirect() {
  const { token, onboardingComplete } = useAuthStore()
  if (!token) return <Navigate to="/welcome" replace />
  // If stored flag is absent (legacy user), default to true → go to home
  if (onboardingComplete === false) return <Navigate to="/onboarding" replace />
  return <Navigate to="/home" replace />
}

function App() {
  const location = useLocation()
  const transitionKey = BOTTOM_NAV_PATHS.has(location.pathname) ? '__nav' : location.pathname

  return (
    // motion.div is the direct AnimatePresence child — a real motion element with exit={}.
    // This means: (1) exit animations always fire correctly regardless of what Routes renders
    // inside, (2) isPresent=false propagates cleanly to layoutId components, preventing the
    // dual-owner crash that occurred when Routes (non-motion) was the direct child.
    // Adding a new route requires zero animation config — the parent motion.div handles it.
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={transitionKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: ROUTE_TRANSITION_MS / 1000, ease: 'easeInOut' }}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Routes location={location}>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/auth/register" element={<Register />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

          {/* BottomNav routes share the '__nav' key above — instant swap, no crossfade */}
          <Route path="/home"      element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/chronicle" element={<ProtectedRoute><Chronicle /></ProtectedRoute>} />
          <Route path="/processes" element={<ProtectedRoute><ProcessLog /></ProtectedRoute>} />
          <Route path="/settings"  element={<ProtectedRoute><Settings /></ProtectedRoute>} />

          <Route path="/codex"            element={<ProtectedRoute><Codex /></ProtectedRoute>} />
          <Route path="/pulse"            element={<ProtectedRoute><Pulse /></ProtectedRoute>} />
          <Route path="/session"          element={<ProtectedRoute><Session /></ProtectedRoute>} />
          <Route path="/session/complete" element={<ProtectedRoute><SessionComplete /></ProtectedRoute>} />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default App
