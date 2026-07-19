import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

/**
 * Exchange a short-lived SSO token (issued by the Society backend) for a
 * chat-service user object. The token arrives as ?token= in the URL,
 * is posted to /auth/sso, and is then discarded.
 */
export const loginWithSSOToken = createAsyncThunk(
  'auth/loginWithSSOToken',
  async (token, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API}/auth/sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'SSO failed')
      }
      return await res.json() // { id, name, email }
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,      // { id, name, email }
    loading: false,
    error: null,
  },
  reducers: {
    setUser(state, { payload }) {
      state.user = payload
    },
    clearUser(state) {
      state.user    = null
      state.error   = null
      state.loading = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginWithSSOToken.pending, (state) => {
        state.loading = true
        state.error   = null
      })
      .addCase(loginWithSSOToken.fulfilled, (state, { payload }) => {
        state.loading = false
        state.user    = payload
      })
      .addCase(loginWithSSOToken.rejected, (state, { payload }) => {
        state.loading = false
        state.error   = payload
      })
  },
})

export const { setUser, clearUser } = authSlice.actions
export default authSlice.reducer
