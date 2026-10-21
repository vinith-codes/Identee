import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import userService from "../../services/userService";

// Fetch all users
export const fetchUsers = createAsyncThunk(
  "userManagement/fetchUsers",
  async (_, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await userService.getUsers(token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

// Fetch single user by id
export const fetchUserById = createAsyncThunk(
  "userManagement/fetchUserById",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await userService.getUserById(id, token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

// Update user
export const editUser = createAsyncThunk(
  "userManagement/editUser",
  async ({ id, userData }, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await userService.updateUser(id, userData, token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

// Delete user
export const removeUser = createAsyncThunk(
  "userManagement/removeUser",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      await userService.deleteUser(id, token);
      return id;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

const userManagementSlice = createSlice({
  name: "userManagement",
  initialState: {
    users: [],
    selectedUser: null,
    loading: false,
    actionLoading: false,
    error: null,
  },
  reducers: {
    clearSelectedUser: (state) => {
      state.selectedUser = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchUsers
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchUserById
      .addCase(fetchUserById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedUser = action.payload;
      })
      .addCase(fetchUserById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // editUser
      .addCase(editUser.pending, (state) => {
        state.actionLoading = true;
      })
      .addCase(editUser.fulfilled, (state, action) => {
        state.actionLoading = false;
        const idx = state.users.findIndex(
          (u) => u._id === action.payload._id,
        );
        if (idx !== -1) {
          state.users[idx] = { ...state.users[idx], ...action.payload };
        }
        state.selectedUser = action.payload;
      })
      // (a refused change or delete is shown as a message by the page — it must not land in `error`, which is the
      // "couldn't load the customers" state: a refused delete used to hide the whole list behind that message)
      .addCase(editUser.rejected, (state) => {
        state.actionLoading = false;
      })
      // removeUser
      .addCase(removeUser.pending, (state) => {
        state.actionLoading = true;
      })
      .addCase(removeUser.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.users = state.users.filter((u) => u._id !== action.payload);
      })
      .addCase(removeUser.rejected, (state) => {
        state.actionLoading = false;
      });
  },
});

export const { clearSelectedUser } = userManagementSlice.actions;
export default userManagementSlice.reducer;