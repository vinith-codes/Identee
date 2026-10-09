import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import customizationService from "../../services/customizationService";

const initialState = {
  savedCustomization: null,
  isUploading: false,
  isSaving: false,
  isError: false,
  isSuccess: false,
  message: "",
};

export const uploadDesignImage = createAsyncThunk(
  "customization/uploadDesignImage",
  async (file, thunkAPI) => {
    try {
      return await customizationService.uploadDesignImage(file);
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message,
      );
    }
  },
);

// CHANGED: now takes { garmentType, color, elements } instead of
// { productId, elements } — this flow opens from a garment-catalog
// pattern + color, not a database product id. See customizationService,
// customizationController, and customizationModel for the matching
// backend changes.
export const saveCustomization = createAsyncThunk(
  "customization/saveCustomization",
  async ({ garmentType, color, elements, size }, thunkAPI) => {
    try {
      return await customizationService.saveCustomization(
        garmentType,
        color,
        elements,
        size,
      );
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message,
      );
    }
  },
);

export const getCustomizationById = createAsyncThunk(
  "customization/getCustomizationById",
  async (id, thunkAPI) => {
    try {
      return await customizationService.getCustomizationById(id);
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message,
      );
    }
  },
);

const customizationSlice = createSlice({
  name: "customization",
  initialState,
  reducers: {
    reset: (state) => {
      state.isUploading = false;
      state.isSaving = false;
      state.isError = false;
      state.isSuccess = false;
      state.message = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadDesignImage.pending, (state) => {
        state.isUploading = true;
      })
      .addCase(uploadDesignImage.fulfilled, (state) => {
        state.isUploading = false;
      })
      .addCase(uploadDesignImage.rejected, (state, action) => {
        state.isUploading = false;
        state.isError = true;
        state.message = action.payload;
      })
      .addCase(saveCustomization.pending, (state) => {
        state.isSaving = true;
        state.isError = false;
        state.isSuccess = false;
      })
      .addCase(saveCustomization.fulfilled, (state, action) => {
        state.isSaving = false;
        state.isSuccess = true;
        state.savedCustomization = action.payload;
      })
      .addCase(saveCustomization.rejected, (state, action) => {
        state.isSaving = false;
        state.isError = true;
        state.message = action.payload;
      })
      .addCase(getCustomizationById.fulfilled, (state, action) => {
        state.savedCustomization = action.payload;
      });
  },
});

export const { reset } = customizationSlice.actions;
export default customizationSlice.reducer;
