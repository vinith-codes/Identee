import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import settingService from "../../services/settingService";

const initialState = {
  values: {}, // flat map, e.g. { "general.storeName": "IDENTEE", "general.phoneNumber": "8870008311", ... }
  isLoaded: false, // true once the first fetch settles (success OR failure) — lets
  // components stop treating "not loaded yet" as "permanently empty"
};

export const fetchPublicSettings = createAsyncThunk(
  "publicSettings/fetch",
  async (_, thunkAPI) => {
    try {
      return await settingService.getPublicSettings();
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message,
      );
    }
  },
);

const publicSettingsSlice = createSlice({
  name: "publicSettings",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPublicSettings.fulfilled, (state, action) => {
        state.values = action.payload || {};
        state.isLoaded = true;
      })
      .addCase(fetchPublicSettings.rejected, (state) => {
        // Don't leave components waiting forever if this one call fails —
        // they fall back to their own hardcoded defaults either way.
        state.isLoaded = true;
      });
  },
});

export default publicSettingsSlice.reducer;
