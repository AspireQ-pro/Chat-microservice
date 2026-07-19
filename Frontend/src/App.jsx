import { Box, CircularProgress, Typography, createTheme, ThemeProvider, CssBaseline } from '@mui/material'
import { useSSOAuth } from '@/handler/useSSOAuth'
import ChatPage from '@/ChatPage'

const theme = createTheme({
  palette: {
    primary: { main: '#1565C0' },
    background: { default: '#f4f6fb' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
})

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 2 }}>
      <CircularProgress size={40} sx={{ color: '#1565C0' }} />
      <Typography variant="body2" color="text.secondary">Signing you in…</Typography>
    </Box>
  )
}

// ─── Error screen ─────────────────────────────────────────────────────────────
function ErrorScreen({ message }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 1, px: 3, textAlign: 'center' }}>
      <Typography variant="h6" color="error" fontWeight={600}>Unable to sign in</Typography>
      <Typography variant="body2" color="text.secondary">{message}</Typography>
      <Typography variant="caption" color="text.disabled" sx={{ mt: 1 }}>
        Please go back to the Society app and try opening Chat again.
      </Typography>
    </Box>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
function AppContent() {
  const { user, loading, error } = useSSOAuth()

  if (loading) return <LoadingScreen />

  if (error) return <ErrorScreen message={error} />

  if (!user) {
    // No token in URL and no user in state — shouldn't normally happen
    // (the Society app always redirects with a token), but handle gracefully.
    return <ErrorScreen message="No session found. Please open Chat from the Society app." />
  }

  return <ChatPage />
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppContent />
    </ThemeProvider>
  )
}
