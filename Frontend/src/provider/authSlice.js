import { createSlice } from '@reduxjs/toolkit'

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    loading: false,
    error: null,
  },
  reducers: {
    setAuth(state, { payload }) {
      state.token = payload.token
      state.user = payload.user
      state.loading = false
      state.error = null
    },
    clearAuth(state) {
      state.user = null
      state.token = null
      state.error = null
      state.loading = false
    },
  },
})

export const { setAuth, clearAuth } = authSlice.actions
export default authSlice.reducer
