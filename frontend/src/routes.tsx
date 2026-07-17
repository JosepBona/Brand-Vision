import { createBrowserRouter } from "react-router-dom"
import App from "./App"
import VehicleBrandDetector from "./features/brand_vision_page"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <VehicleBrandDetector/>},
      
    ],
  },
])