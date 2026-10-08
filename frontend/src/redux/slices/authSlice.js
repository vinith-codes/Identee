import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

import authService from "../../services/authService";

const user = JSON.parse(localStorage.getItem("userInfo"));

const initialState = {
  user: user || null,
  profile: null,
  isLoading: false,
  isSuccess: false,
  isError: false,
  message: "",
};

// GET PROFILE
export const getProfile = createAsyncThunk(
  "auth/profile",
  async (_, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;

      return await authService.getProfile(token);
    } catch (error) {
      const message = error.response?.data?.message || error.message;

      return thunkAPI.rejectWithValue(message);
    }
  },
);

// UPDATE PROFILE
export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async (profileData, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;

      return await authService.updateProfile(profileData, token);
    } catch (error) {
      const message = error.response?.data?.message || error.message;

      return thunkAPI.rejectWithValue(message);
    }
  },
);

// LOGOUT
export const logout = createAsyncThunk("auth/logout", async () => {
  authService.logout();
});

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    // Called by the OTP login page once authService has stored the user.
    setCredentials: (state, action) => {
      state.user = action.payload;
    },
    reset: (state) => {
      state.isLoading = false;
      state.isSuccess = false;
      state.isError = false;
      state.message = "";
    },
  },

  extraReducers: (builder) => {
    builder

      // PROFILE
      .addCase(getProfile.fulfilled, (state, action) => {
        state.profile = action.payload;
      })

      // UPDATE PROFILE
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.profile = action.payload;
      })

      // LOGOUT
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.profile = null;
      });
  },
});

export const { reset, setCredentials } = authSlice.actions;

export default authSlice.reducer;
