import React from 'react'
import { Box, Typography, Button } from '@mui/material'
import { Check, DoneAll, AccessTime } from '@mui/icons-material'

function Ticks({ status }) {
  if (!status) return null
  if (status === 'sending') return <AccessTime sx={{ fontSize: 13, ml: 0.5, opacity: 0.7 }} />
  if (status === 'sent') return <Check sx={{ fontSize: 14, ml: 0.5, opacity: 0.8 }} />
  if (status === 'delivered') return <DoneAll sx={{ fontSize: 14, ml: 0.5, opacity: 0.8 }} />
  if (status === 'read') return <DoneAll sx={{ fontSize: 14, ml: 0.5, color: '#4fc3f7' }} />
  return null
}

function MessageBubble({ message, onRetry }) {
  const failed = message.mine && message.status === 'failed'
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column',
        alignItems: message.mine ? 'flex-end' : 'flex-start',
        mb: 1.5, px: 1,
      }}
    >
      <Box
        sx={{
          maxWidth: '65%', px: 2, py: 1,
          borderRadius: message.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          bgcolor: failed ? '#fdecea' : (message.mine ? '#1565C0' : '#f5f5f5'),
          color: failed ? '#b71c1c' : (message.mine ? '#fff' : 'text.primary'),
          border: failed ? '1px solid #f5c6cb' : 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {!message.mine && message.senderName && (
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#7e57c2', mb: 0.25 }}>
            {message.senderName}
          </Typography>
        )}
        {message.text && (
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{message.text}</Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 0.3, opacity: 0.85 }}>
          <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>{message.time}</Typography>
          {message.mine && !failed && <Ticks status={message.status} />}
        </Box>
      </Box>
      {failed && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <Typography variant="caption" sx={{ color: '#c62828', fontSize: '0.65rem' }}>Not delivered</Typography>
          <Button size="small" onClick={() => onRetry?.(message)} sx={{ minWidth: 0, p: 0, fontSize: '0.65rem', textTransform: 'none' }}>
            Retry
          </Button>
        </Box>
      )}
    </Box>
  )
}

export default MessageBubble
