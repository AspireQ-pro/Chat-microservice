import { createSlice } from '@reduxjs/toolkit'

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    myAvatarUrl: null,
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
      state.myAvatarUrl = null
      state.error = null
      state.loading = false
    },
    setMyAvatarUrl(state, { payload }) {
      state.myAvatarUrl = payload || null
    },
    setUserRole(state, { payload }) {
      if (state.user) {
        state.user = { ...state.user, role: payload || null }
      }
    },
  },
})

export const { setAuth, clearAuth, setMyAvatarUrl, setUserRole } = authSlice.actions
export default authSlice.reducer
