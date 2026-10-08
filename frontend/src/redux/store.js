import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import productReducer from "./slices/productSlice";
import bannerReducer from "./slices/bannerSlice";
import categoryBannerReducer from "./slices/categoryBannerSlice";
import customizationReducer from "./slices/customizationSlice";
import userManagementReducer from "./slices/userManagementSlice";
import orderReducer from "./slices/orderSlice";
import cartWishlistReducer from "./slices/cartWishlistSlice";
import garmentImageReducer from "./slices/garmentImageSlice";
import garmentTypeReducer from "./slices/garmentTypeSlice";
import artCategoryReducer from "./slices/artCategorySlice";
import artDesignReducer from "./slices/artDesignSlice";
import shippingReducer from "./slices/shippingSlice";
import settingReducer from "./slices/settingSlice";
import notificationReducer from "./slices/notificationSlice";
import publicSettingsReducer from "./slices/publicSettingsSlice";
import categoryReducer from "./slices/categorySlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    product: productReducer,
    banner: bannerReducer,
    categoryBanner: categoryBannerReducer,
    customization: customizationReducer,
    userManagement: userManagementReducer,
    orders: orderReducer,
    shipping: shippingReducer,
    artCategory: artCategoryReducer,
    artDesign: artDesignReducer,
    cartWishlist: cartWishlistReducer,
    garmentImage: garmentImageReducer,
    garmentType: garmentTypeReducer,
    settings: settingReducer,
    notifications: notificationReducer,
    publicSettings: publicSettingsReducer,
    categories: categoryReducer,
  },
  devTools: process.env.NODE_ENV !== "production",
});
