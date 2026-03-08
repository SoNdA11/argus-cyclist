# Argus Cyclist Simulator

![License](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Go](https://img.shields.io/badge/Backend-Go-00ADD8?logo=go&logoColor=white)
![Wails](https://img.shields.io/badge/Framework-Wails-red?logo=wails&logoColor=white)
![JavaScript](https://img.shields.io/badge/Frontend-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![MapLibre](https://img.shields.io/badge/Map-MapLibre-brightgreen)
![Capacitor](https://img.shields.io/badge/Mobile-Capacitor-119EFF?logo=capacitor&logoColor=white)
![Node.js](https://img.shields.io/badge/Runtime-Node.js-339933?logo=nodedotjs&logoColor=white)

**Argus Cyclist** is a cross-platform open-source software for indoor cycling simulation, offering real-time communication with smart trainers, 3D map visualization, and support for multiple training modes such as free ride and structured workouts. Now available for both Desktop and Mobile!

## Screenshots

### Desktop Experience

| Virtual Ride & HUD | Profile and Devices |
| :---: | :---: |
| <img src="./frontend/screenshots/print-5-argus-cyclist.png" width="400" alt="Dashboard"/> | <img src="./frontend/screenshots/pr-2-argus-cyclist.png" width="400" alt="Profile"/> |
| **History and Stats** | **Dark Theme** |
| <img src="./frontend/screenshots/pr-3-argus-cyclist.png" width="400" alt="History"/> | <img src="./frontend/screenshots/pr-4-argus-cyclist.png" width="400" alt="Dark Theme"/> |
| **Workout Plan** | **Route Creator** |
| <img src="./frontend/screenshots/pr-6-argus-cyclist.png" width="400" alt="Workout"/> | <img src="./frontend/screenshots/pr-7-argus-cyclist.png" width="400" alt="Route Creator"/> |
| **Post-Ride Summary** | **Workout Graphical Analysis** |
| <img src="./frontend/screenshots/post-workout-summary.png" width="400" alt="Workout"/> | <img src="./frontend/screenshots/post-workout-charts.png" width="400" alt="Route Creator"/> |

### Mobile App (Android)

| Mobile Gaming HUD |
| :---: |
| <img src="./frontend/screenshots/mobile-landscape-hud.jpg" width="800" alt="Mobile landscape view showing 3D map, telemetry data, and elevation profile"/> |

## Cross-Platform: Now on Mobile (Android)

Argus Cyclist isn't just for desktop anymore. Powered by **Capacitor.js**, the simulator now runs natively on Android devices, transforming your smartphone into a high-end cycling head unit.

* **Immersive Mobile HUD:** A fully responsive, landscape-forced "gaming mode" UI featuring glassmorphism elements to maximize 3D map visibility.
* **Native Bluetooth LE:** Direct connection to smart trainers and heart rate monitors using the mobile device's built-in Bluetooth antenna.
* **JS Physics Engine:** A dedicated JavaScript physics engine ensures accurate speed calculations (accounting for drag, rolling resistance, and gravity) directly on the mobile device, without requiring the Go backend.
* **Local File Parsing:** Import `.GPX` routes and `.ZWO` workout plans natively from your phone's storage.

## Simulation & Connectivity

* **Smart Trainer Support (BLE & ANT+):** Connects natively to FTMS and ANT+ FE-C compatible trainers (e.g., Tacx, Wahoo, Elite, Thinkrider) and Heart Rate monitors.
* **Physics Engine:** Real-time speed calculation based on power (Watts), rider weight, bike weight, rolling resistance, and aerodynamic drag.
* **Grade Simulation:** The trainer automatically adjusts resistance based on the virtual terrain slope.

### Gamification & Progression

* **Leveling System:** Earn **XP (Experience Points)** passively by riding.
* **Dynamic Rewards:** Gain more XP for climbing and covering long distances.
* **Persistent Profile:** Your stats (Level, Total XP, FTP, Weight) are saved locally using SQLite.
* **Visual HUD:** Real-time XP bar and power zones.

### Immersive 3D Map

* **MapLibre Integration:** Powered by MapLibre GL JS with 3D Terrain-RGB for realistic topography. Features a 3D Globe projection with atmospheric fog and high-fidelity Satellite (Esri) or Vector (Day) themes.
* **Smart Route Rendering:** Route lines change color dynamically based on gradient (Green = Flat/Descent, Red = Steep Climb).
* **Occlusion System:** The route renders correctly behind 3D buildings for better depth perception.
* **Smooth Animation:** Interpolated cyclist movement at 60fps, eliminating GPS "jumping".

### Tools & Data

* **Post-Ride Analysis:** Comprehensive end-of-workout summaries featuring detailed performance statistics and graphical charts (Power, Heart Rate, Elevation) immediately after finishing a session.
* **Route Editor:** Create custom routes directly inside the app by clicking points on the map.
* **GPX Import:** Ride any real-world route by importing standard `.GPX` files.
* **Activity History:** Calendar view, monthly stats, and "Power Curve" analysis.
* **Data Export:** Automatically generates `.FIT` files compatible with Strava, Garmin Connect, and TrainingPeaks.

## Technologies

* **Backend:** Go (Golang)
* **Frontend:** JavaScript (ES6+), MapLibre GL JS + OSRM
* **Native Wrappers:** Wails (Desktop) & Capacitor (Android)
* **Database:** SQLite (for local user data)

## Prerequisites

Before starting, ensure you have installed:

* [Go](https://go.dev/) (v1.20+)
* [Node.js](https://nodejs.org/) & npm
* [Wails CLI](https://wails.io/) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
* [Android Studio](https://developer.android.com/studio) (for mobile compilation)

## Installation and Setup

1. **Clone the repository:**

    ```bash
    git clone [https://github.com/your-username/argus-cyclist.git](https://github.com/your-username/argus-cyclist.git)
    cd argus-cyclist
    ```

2. **Install dependencies:**

    ```bash
    # Go dependencies
    go mod tidy

    # Frontend dependencies
    cd frontend
    npm install
    cd ..
    ```

## How to Run

To start the application in development mode (with Hot Reload):

```bash
wails dev
```

### For Android (Capacitor)

```bash
cd frontend
npm run build
npx cap sync android
npx cap open android
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.
