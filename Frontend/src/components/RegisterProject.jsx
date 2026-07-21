import React, { useState } from 'react'
import { Box, Typography, TextField, Button, Paper, Alert, Snackbar } from '@mui/material'
import ContentCopy from '@mui/icons-material/ContentCopy'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function RegisterProject() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setResult(null)
    setError('')

    try {
      const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (res.ok) setResult(data)
      else setError(data.error || 'Failed to register')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyApiKey = () => {
    if (result?.apiKey) {
      navigator.clipboard.writeText(result.apiKey)
      setCopied(true)
    }
  }

  return (
    <Box sx={{ maxWidth: 500, mx: 'auto', mt: 6, px: 2 }}>
      <Paper sx={{ p: 4, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>Register a Project</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Create a new project and get an API key for your backend.
        </Typography>

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Society Management"
            required
            sx={{ mb: 2 }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{ py: 1.2, borderRadius: 2 }}
          >
            {loading ? 'Registering...' : 'Register Project'}
          </Button>
        </form>

        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
            <Typography variant="body2" fontWeight={600} mb={1}>
              ✅ Project "{result.name}" registered!
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary">
              <strong>Project ID:</strong> {result.id}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography variant="caption" sx={{ bgcolor: '#f5f5f5', px: 1, py: 0.5, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {result.apiKey}
              </Typography>
              <Button size="small" variant="outlined" onClick={copyApiKey} sx={{ minWidth: 40, p: 0.5 }}>
                <ContentCopy fontSize="small" />
              </Button>
            </Box>
            <Typography variant="caption" display="block" color="text.secondary" mt={1}>
              Share this API key with your project's backend to sync users.
            </Typography>
          </Alert>
        )}
      </Paper>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        message="API Key copied!"
      />
    </Box>
  )
}

export default RegisterProject
