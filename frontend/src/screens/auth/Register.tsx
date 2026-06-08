import { useState, type FormEvent, type CSSProperties } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard } from '../../components/ui/GlassCard'
import { DaemonButton } from '../../components/ui/DaemonButton'
import { useAuthStore } from '../../stores/authStore'
import { apiFetch } from '../../lib/api'
import type { AuthResponse } from '../../types'
import { AUTH_FORM_MAX_WIDTH, HAIRLINE, INPUT_FONT_SIZE } from '../../lib/constants'

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--space-3) var(--space-4)',
  background: 'rgba(255,255,255,0.04)',
  border: `${HAIRLINE} solid var(--border)`,
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: INPUT_FONT_SIZE,
  outline: 'none',
  boxSizing: 'border-box',
}

export function Register() {
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
      const r = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })

      if (r.status === 409) {
        setError('An account with that email already exists.')
        return
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? 'Something went wrong. Try again.')
        return
      }

      const data = await r.json() as AuthResponse
      setAuth(data.token, data.onboarding_complete)
      navigate('/onboarding')
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
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        paddingBottom: 'calc(var(--space-8) + env(safe-area-inset-bottom))',
      }}
    >
      <GlassCard style={{ width: '100%', maxWidth: AUTH_FORM_MAX_WIDTH, padding: 'var(--space-8)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            color: 'var(--text-primary)',
            margin: 0,
            textAlign: 'center',
          }}>
            Begin
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={inputStyle}
            />
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}>
              8+ chars, uppercase, lowercase, number, special character
            </span>
          </div>

          {error && (
            <p style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              margin: 0,
            }}>
              {error}
            </p>
          )}

          <DaemonButton type="submit" disabled={submitting}>
            {submitting ? '...' : 'Create account →'}
          </DaemonButton>
        </form>
      </GlassCard>

      <Link
        to="/auth/login"
        style={{
          marginTop: 'var(--space-6)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-muted)',
          textDecoration: 'none',
        }}
      >
        I have an account
      </Link>
    </motion.div>
  )
}
