import { useState, type FormEvent, type CSSProperties } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { DaemonButton } from '../../components/ui/DaemonButton'
import { useAuthStore } from '../../stores/authStore'
import { apiFetch } from '../../lib/api'
import type { AuthResponse } from '../../types'

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'rgba(255,255,255,0.04)',
  border: '0.5px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  outline: 'none',
  boxSizing: 'border-box',
}

export function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const r = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      })

      if (r.status === 401) {
        setError('Incorrect email or password.')
        return
      }
      if (!r.ok) {
        setError('Something went wrong. Try again.')
        return
      }

      const data = await r.json() as AuthResponse
      setAuth(data.token, data.onboarding_complete)
      navigate(data.onboarding_complete ? '/home' : '/onboarding')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <GlassCard style={{ width: '100%', maxWidth: '360px', padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            color: 'var(--text-primary)',
            margin: 0,
            textAlign: 'center',
          }}>
            Return
          </p>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={inputStyle}
            />
            {error && (
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                margin: 0,
              }}>
                {error}
              </p>
            )}
          </div>

          <DaemonButton type="submit" disabled={submitting}>
            {submitting ? '...' : 'Enter →'}
          </DaemonButton>
        </form>
      </GlassCard>

      <Link
        to="/auth/register"
        style={{
          marginTop: '1.5rem',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
          textDecoration: 'none',
        }}
      >
        Create an account
      </Link>
    </motion.div>
  )
}
