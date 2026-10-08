import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import categoryService from "../../services/categoryService";

// Public storefront categories — shared by the Home page and the Navbar so
// they're fetched once per visit.
export const fetchCategories = createAsyncThunk(
  "categories/fetch",
  async (_, thunkAPI) => {
    try {
      return await categoryService.getCategories();
    } catch (err) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
  {
    condition: (_, { getState }) => {
      const { status } = getState().categories;
      return status !== "loading" && status !== "succeeded";
    },
  },
);

const categorySlice = createSlice({
  name: "categories",
  initialState: { items: [], status: "idle", error: null },
  reducers: {
    // Admin edits call this so the storefront refetches fresh data.
    invalidateCategories: (state) => {
      state.status = "idle";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload;
      });
  },
});

export const { invalidateCategories } = categorySlice.actions;
export default categorySlice.reducer;
