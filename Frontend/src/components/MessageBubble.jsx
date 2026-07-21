import React from 'react'
import { Box, Typography } from '@mui/material'

function MessageBubble({ message }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: message.mine ? 'flex-end' : 'flex-start',
        mb: 1.5, px: 1,
      }}
    >
      <Box
        sx={{
          maxWidth: '65%',
          px: 2, py: 1,
          borderRadius: message.mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          bgcolor: message.mine ? '#1565C0' : '#f5f5f5',
          color: message.mine ? '#fff' : 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {!message.mine && message.senderName && (
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.3, opacity: 0.8 }}>
            {message.senderName}
          </Typography>
        )}
        {message.fileUrl && message.fileType === 'image' && (
          <Box
            component="img" src={message.fileUrl} alt="attachment"
            sx={{ maxWidth: '100%', borderRadius: 1, mb: message.text ? 0.5 : 0 }}
          />
        )}
        {message.fileUrl && message.fileType === 'file' && (
          <Box
            component="a" href={message.fileUrl} target="_blank" rel="noreferrer"
            sx={{ display: 'block', color: 'inherit', mb: message.text ? 0.5 : 0 }}
          >
            📎 File
          </Box>
        )}
        {message.text && (
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{message.text}</Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.3, mt: 0.3 }}>
          <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>
            {message.time}
          </Typography>
          {message.mine && (
            <Typography variant="caption" sx={{ fontSize: '0.6rem', opacity: message.isRead ? 1 : 0.5 }}>
              {message.isRead ? '✓✓' : '✓'}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export default MessageBubble
