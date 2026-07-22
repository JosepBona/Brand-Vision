import { createBrowserRouter } from "react-router-dom"
import App from "./App"
import HomePage from "./features/home-page"
import VehicleBrandDetector from "./features/brand_vision_page"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/brand-vision",
    element: <App />,
    children: [{ index: true, element: <VehicleBrandDetector /> }],
  },
])