import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import artDesignService from "../../services/artDesignService";

const initialState = { items: [], adminItems: [], isLoading: false, isUploading: false };

export const fetchArtDesigns = createAsyncThunk(
  "artDesign/fetchAll",
  async (categoryId) => artDesignService.getArtDesigns(categoryId),
);

export const fetchAllArtDesignsAdmin = createAsyncThunk(
  "artDesign/fetchAllAdmin",
  async () => artDesignService.getAllArtDesignsAdmin(),
);

export const createArtDesign = createAsyncThunk(
  "artDesign/create",
  async ({ name, category, price, imageFile }) =>
    artDesignService.createArtDesign(name, category, price, imageFile),
);

// the server refuses to delete a picture customer designs use — its reason comes back to the page
export const deleteArtDesign = createAsyncThunk(
  "artDesign/delete",
  async (id, { rejectWithValue }) => {
    try {
      await artDesignService.deleteArtDesign(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

export const setArtDesignVisibility = createAsyncThunk(
  "artDesign/visibility",
  async ({ id, isActive }, { rejectWithValue }) => {
    try {
      return await artDesignService.setArtDesignVisibility(id, isActive);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

const artDesignSlice = createSlice({
  name: "artDesign",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchArtDesigns.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchArtDesigns.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload;
      })
      .addCase(fetchAllArtDesignsAdmin.fulfilled, (state, action) => {
        state.adminItems = action.payload;
      })
      .addCase(createArtDesign.pending, (state) => {
        state.isUploading = true;
      })
      .addCase(createArtDesign.fulfilled, (state, action) => {
        state.isUploading = false;
        state.adminItems.unshift(action.payload);
      })
      .addCase(createArtDesign.rejected, (state) => {
        state.isUploading = false;
      })
      .addCase(deleteArtDesign.fulfilled, (state, action) => {
        state.adminItems = state.adminItems.filter((i) => i._id !== action.payload);
      })
      .addCase(setArtDesignVisibility.fulfilled, (state, action) => {
        const i = state.adminItems.findIndex((d) => d._id === action.payload._id);
        if (i !== -1) state.adminItems[i] = action.payload;
      });
  },
});

export default artDesignSlice.reducer;