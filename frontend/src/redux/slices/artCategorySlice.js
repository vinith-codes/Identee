import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import artCategoryService from "../../services/artCategoryService";

const initialState = { items: [], isLoading: false };

export const fetchArtCategories = createAsyncThunk(
  "artCategory/fetchAll",
  async () => artCategoryService.getArtCategories(),
);

export const createArtCategory = createAsyncThunk(
  "artCategory/create",
  async ({ name, thumbnailFile }) =>
    artCategoryService.createArtCategory(name, thumbnailFile),
);

// refused while the group still has designs — the reason comes back to the page
export const deleteArtCategory = createAsyncThunk(
  "artCategory/delete",
  async (id, { rejectWithValue }) => {
    try {
      await artCategoryService.deleteArtCategory(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

const artCategorySlice = createSlice({
  name: "artCategory",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchArtCategories.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchArtCategories.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload;
      })
      .addCase(createArtCategory.fulfilled, (state, action) => {
        state.items.push(action.payload);
      })
      .addCase(deleteArtCategory.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i._id !== action.payload);
      });
  },
});

export default artCategorySlice.reducer;