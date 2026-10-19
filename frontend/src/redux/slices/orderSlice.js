import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import orderService from "../../services/orderService";

export const createOrder = createAsyncThunk(
  "orders/createOrder",
  async (orderData, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await orderService.createOrder(orderData, token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

export const fetchMyOrders = createAsyncThunk(
  "orders/fetchMyOrders",
  async (_, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await orderService.getMyOrders(token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

export const fetchOrderById = createAsyncThunk(
  "orders/fetchOrderById",
  async (id, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await orderService.getOrderById(id, token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

export const fetchAllOrders = createAsyncThunk(
  "orders/fetchAllOrders",
  async (_, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return await orderService.getAllOrders(token);
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

// ✅ NEW — Admin: update an order's status. Returns { id, status } so the
// reducer can patch just that one order in allOrders without a full refetch.
export const updateOrderStatus = createAsyncThunk(
  "orders/updateOrderStatus",
  async ({ id, status }, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      const data = await orderService.updateOrderStatus(id, status, token);
      return { id, status, message: data?.message, statusUndo: data?.statusUndo || null, isPaid: data?.isPaid };
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || err.message,
      );
    }
  },
);

export const undoOrderStatus = createAsyncThunk(
  "orders/undoOrderStatus",
  async ({ id }, thunkAPI) => {
    try {
      const token = thunkAPI.getState().auth.user.token;
      return { id, ...(await orderService.undoOrderStatus(id, token)) };
    } catch (err) {
      return thunkAPI.rejectWithValue(err.response?.data?.message || err.message);
    }
  },
);

const orderSlice = createSlice({
  name: "orders",
  initialState: {
    orders: [],
    allOrders: [],
    allOrdersLoading: false,
    allOrdersError: null,
    currentOrder: null,
    placedOrder: null,
    loading: false,
    placing: false,
    error: null,
    updatingStatusId: null, // ✅ NEW — order._id currently being updated, for per-row disable/spinner
  },
  reducers: {
    clearPlacedOrder: (state) => {
      state.placedOrder = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // createOrder
      .addCase(createOrder.pending, (state) => {
        state.placing = true;
        state.error = null;
      })
      .addCase(createOrder.fulfilled, (state, action) => {
        state.placing = false;
        state.placedOrder = action.payload;
      })
      .addCase(createOrder.rejected, (state, action) => {
        state.placing = false;
        state.error = action.payload;
      })
      // fetchMyOrders
      .addCase(fetchMyOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyOrders.fulfilled, (state, action) => {
        state.loading = false;
        state.orders = action.payload;
      })
      .addCase(fetchMyOrders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchOrderById
      .addCase(fetchOrderById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOrder = action.payload;
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchAllOrders
      .addCase(fetchAllOrders.pending, (state) => {
        state.allOrdersLoading = true;
        state.allOrdersError = null;
      })
      .addCase(fetchAllOrders.fulfilled, (state, action) => {
        state.allOrdersLoading = false;
        state.allOrders = action.payload;
      })
      .addCase(fetchAllOrders.rejected, (state, action) => {
        state.allOrdersLoading = false;
        state.allOrdersError = action.payload;
      })
      // ✅ NEW — updateOrderStatus
      .addCase(updateOrderStatus.pending, (state, action) => {
        state.updatingStatusId = action.meta.arg.id;
      })
      .addCase(updateOrderStatus.fulfilled, (state, action) => {
        state.updatingStatusId = null;
        const { id, status, statusUndo, isPaid } = action.payload;
        const order = state.allOrders.find((o) => o._id === id);
        if (order) {
          order.orderStatus = status;
          order.statusUndo = statusUndo;
          if (isPaid !== undefined) order.isPaid = isPaid;
        }
      })
      // a refused change keeps the table (the page shows the reason in a toast)
      .addCase(updateOrderStatus.rejected, (state) => {
        state.updatingStatusId = null;
      })
      .addCase(undoOrderStatus.pending, (state, action) => {
        state.updatingStatusId = action.meta.arg.id;
      })
      .addCase(undoOrderStatus.fulfilled, (state, action) => {
        state.updatingStatusId = null;
        const order = state.allOrders.find((o) => o._id === action.payload.id);
        if (order) {
          order.orderStatus = action.payload.status;
          order.statusUndo = null;
          order.isPaid = action.payload.isPaid;
        }
      })
      .addCase(undoOrderStatus.rejected, (state) => {
        state.updatingStatusId = null;
      });
  },
});

export const { clearPlacedOrder } = orderSlice.actions;
export default orderSlice.reducer;
