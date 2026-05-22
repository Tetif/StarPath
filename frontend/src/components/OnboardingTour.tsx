import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "starpath_tour_completed";

export default function OnboardingTour() {
  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;

    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        popoverClass: "starpath-tour",
        steps: [
          {
            element: "[data-tour='camera-hint']",
            popover: {
              title: "Camera Controls",
              description:
                "Zoom with the scroll wheel, pan with right-click and drag, rotate with left-click and drag.",
            },
          },
          {
            element: "[data-tour='planet-picker']",
            popover: {
              title: "Select Planets",
              description: "Choose origin and destination, or click planets on the 3D scene.",
            },
          },
          {
            element: "[data-tour='trajectories']",
            popover: {
              title: "Three Routes",
              description: "Toggle fastest (red), cheapest (blue), and balanced (green) trajectories.",
            },
          },
          {
            element: "[data-tour='metrics']",
            popover: {
              title: "Mission Metrics",
              description: "View Δv, time of flight, and departure/arrival dates for each route.",
            },
          },
          {
            element: "[data-tour='timeline']",
            popover: {
              title: "Animation",
              description: "Control playback speed from real-time to days per second.",
            },
          },
        ],
        onDestroyStarted: () => {
          localStorage.setItem(TOUR_KEY, "1");
          driverObj.destroy();
        },
      });
      driverObj.drive();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return null;
}

export function restartTour() {
  localStorage.removeItem(TOUR_KEY);
  window.location.reload();
}
