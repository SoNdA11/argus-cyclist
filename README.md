# Argus Cyclist Simulator

**Argus Cyclist** is an open-source cycling simulator built with **Go (Wails)** and **Mapbox GL JS**. It allows you to connect Smart Trainers via Bluetooth (BLE) and simulate rides in realistic 3D environments based on real GPS data.

![Descrição da Imagem](./frontend/screenshots/print-profile.png)
![Descrição da Imagem](./frontend/screenshots/print-history.png)
![Descrição da Imagem](./frontend/screenshots/print-2-femmes.png)

## Simulation & Connectivity

* **Smart Trainer Support (BLE & ANT+):** Connects natively to FTMS and ANT+ FE-C compatible trainers (e.g., Tacx, Wahoo, Elite, Thinkrider) and Heart Rate monitors.
* **Physics Engine:** Real-time speed calculation based on power (Watts), rider weight, bike weight, rolling resistance, and aerodynamic drag.
* **Grade Simulation:** The trainer automatically adjusts resistance based on the virtual terrain slope.

### Gamification & Progression (NEW)

* **Leveling System:** Earn **XP (Experience Points)** passively by riding.
* **Dynamic Rewards:** Gain more XP for climbing and covering long distances.
* **Persistent Profile:** Your stats (Level, Total XP, FTP, Weight) are saved locally using SQLite.
* **Visual HUD:** Real-time XP bar and power zones.

### Immersive 3D Map

* **Mapbox Integration:** Uses Mapbox Standard (v3) for realistic terrain and lighting (Dawn, Day, Dusk, Night).
* **Smart Route Rendering:** Route lines change color dynamically based on gradient (Green = Flat/Descent, Red = Steep Climb).
* **Occlusion System:** The route renders correctly behind 3D buildings for better depth perception.
* **Smooth Animation:** Interpolated cyclist movement at 60fps, eliminating GPS "jumping".

### Tools & Data

* **Route Editor:** Create custom routes directly inside the app by clicking points on the map.
* **GPX Import:** Ride any real-world route by importing standard `.GPX` files.
* **Activity History:** Calendar view, monthly stats, and "Power Curve" analysis.
* **Data Export:** Automatically generates `.FIT` files compatible with Strava, Garmin Connect, and TrainingPeaks.

## Technologies

* **Backend:** Go (Golang)
* **Frontend:** JavaScript (ES6+), Mapbox GL JS
* **Framework:** Wails (to create the native desktop application)

## Prerequisites

Before starting, ensure you have installed:

* [Go](https://go.dev/) (v1.20+)
* [Node.js](https://nodejs.org/) & npm
* [Wails CLI](https://wails.io/) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

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

3. **Token Configuration (Important):**
    The project uses Mapbox for 3D rendering. You need a free API key.

    * Go to the `frontend/src/` folder.
    * Duplicate the `config.example.js` file.
    * Rename the copy to `config.js`.
    * Edit `config.js` and paste your Mapbox token:

        ```javascript
        export const CONFIG = {
            MAPBOX_TOKEN: 'pk.ey...', // Paste your token here
            // ...
        }
        ```

## How to Run

To start the application in development mode (with Hot Reload):

```bash
wails dev
