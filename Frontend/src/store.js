import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/provider/authSlice'
import chatReducer from '@/provider/chatSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
})
