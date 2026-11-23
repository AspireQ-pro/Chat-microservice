import { Box, Typography, TextField, Button, Paper, Alert, Snackbar, FormControlLabel, Checkbox } from '@mui/material'
import ContentCopy from '@mui/icons-material/ContentCopy'
import { useRegisterProjectLogic } from '../handler/componentLogic'

function RegisterProject() {
  const {
    name,
    registrationSecret,
    allowGroupChat,
    allowDirectChat,
    loading,
    result,
    error,
    copied,
    handleSubmit,
    handleNameChange,
    handleSecretChange,
    handleGroupChatChange,
    handleDirectChatChange,
    handleCopyApiKey,
    handleCloseCopied,
  } = useRegisterProjectLogic()

  if (import.meta.env.PROD) {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', mt: 6, px: 2 }}>
        <Alert severity="info">
          Project registration is an administrative server-side operation. Contact your system administrator.
        </Alert>
      </Box>
    )
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
            onChange={handleNameChange}
            placeholder="e.g., Society Management"
            required
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            type="password"
            label="Registration Secret"
            value={registrationSecret}
            onChange={handleSecretChange}
            autoComplete="off"
            required
            sx={{ mb: 2 }}
          />
          <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 0.5, bgcolor: "#f9fafb", p: 1.5, borderRadius: 2 }}>
            <Typography variant="body2" fontWeight={600} color="text.secondary">
              Chat Features:
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={allowGroupChat}
                  onChange={handleGroupChatChange}
                />
              }
              label={<Typography variant="body2">Group Chat</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={allowDirectChat}
                  onChange={handleDirectChatChange}
                />
              }
              label={<Typography variant="body2">Individual Chat (Direct Messaging)</Typography>}
            />
          </Box>
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
            <Typography variant="caption" display="block" color="text.secondary">
              <strong>Features:</strong> {result.allowGroupChat ? "Group Chat" : "No Group"} · {result.allowDirectChat ? "Individual Chat" : "No Direct"}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography variant="caption" sx={{ bgcolor: '#f5f5f5', px: 1, py: 0.5, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {result.apiKey}
              </Typography>
              <Button size="small" variant="outlined" onClick={handleCopyApiKey} sx={{ minWidth: 40, p: 0.5 }}>
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
        onClose={handleCloseCopied}
        message="API Key copied!"
      />
    </Box>
  )
}

export default RegisterProject
