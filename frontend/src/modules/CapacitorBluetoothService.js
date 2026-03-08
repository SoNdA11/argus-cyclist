/*
    Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
    Copyright (C) 2026  Paulo Sérgio

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * CapacitorBluetoothService
 * Uses the native @capacitor-community/bluetooth-le plugin for Android/iOS.
 * Replicates the Hybrid FE-C (Resistance) & Cycling Power (Telemetry) logic.
 */
import { BleClient } from '@capacitor-community/bluetooth-le';

export class CapacitorBluetoothService {
    constructor() {
        this.trainerDeviceId = null;
        this.hrDeviceId = null;
        
        // Simulation State
        this.totalDistanceMeters = 0;
        this.lastTime = 0;
        this.lastSentGrade = -999;
        this.elevationGain = 0;
        this.lastElevation = 0;

        // Telemetry State
        this.currentHR = 0;
        this.currentCadence = 0;
        this.lastCrankRevs = -1;
        this.lastCrankTime = -1;

        // Constants
        this.FEC_SERVICE_UUID = "6e40fec1-b5a3-f393-e0a9-e50e24dcca9e";
        this.FEC_WRITE_UUID = "6e40fec3-b5a3-f393-e0a9-e50e24dcca9e";
        this.CYCLING_POWER_SERVICE = "00001818-0000-1000-8000-00805f9b34fb";
        this.CYCLING_POWER_MEASURE = "00002a63-0000-1000-8000-00805f9b34fb";
        this.HEART_RATE_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
        this.HEART_RATE_MEASURE = "00002a37-0000-1000-8000-00805f9b34fb";
    }

    async initBle() {
        try {
            await BleClient.initialize();
            console.log("Capacitor BLE Initialized");
        } catch (e) {
            console.error("BLE Init Error:", e);
        }
    }

    async connectTrainer(onStatusChange, onTelemetryUpdate) {
        try {
            await this.initBle();
            onStatusChange("Requesting Trainer...");

            // Open the native mobile scanning UI
            const device = await BleClient.requestDevice({
                services: [this.FEC_SERVICE_UUID],
                optionalServices: [this.CYCLING_POWER_SERVICE]
            });

            this.trainerDeviceId = device.deviceId;
            onStatusChange("Connecting to Trainer...");

            await BleClient.connect(this.trainerDeviceId, (deviceId) => {
                onStatusChange("Disconnected");
                this.trainerDeviceId = null;
            });

            // Set up Telemetry Notifications (Standard Cycling Power)
            try {
                await BleClient.startNotifications(
                    this.trainerDeviceId,
                    this.CYCLING_POWER_SERVICE,
                    this.CYCLING_POWER_MEASURE,
                    (dataView) => {
                        this.handleHybridTelemetry(dataView, onTelemetryUpdate);
                    }
                );
                console.log("Capacitor: Cycling Power notifications started.");
            } catch (e) {
                console.warn("Capacitor: Standard CP Service not found, trainer might only support FE-C.", e);
            }

            this.lastTime = performance.now();
            onStatusChange("Trainer Connected");
            return true;

        } catch (error) {
            console.error("Capacitor BLE Connect Error:", error);
            onStatusChange("Connection Error");
            return false;
        }
    }

    handleHybridTelemetry(dataView, onTelemetryUpdate) {
        try {
            const flags = dataView.getUint16(0, true);
            const watts = dataView.getInt16(2, true);
            
            // Cadence
            if (flags & 0x20) {
                let offset = 4;
                if (flags & 0x01) offset += 1;
                if (flags & 0x04) offset += 2;
                if (flags & 0x10) offset += 6;
                
                const crankRevs = dataView.getUint16(offset, true);
                const crankTime = dataView.getUint16(offset + 2, true);
                
                if (this.lastCrankTime !== -1 && crankTime !== this.lastCrankTime) {
                    let timeDiff = (crankTime - this.lastCrankTime + 65536) % 65536;
                    let revsDiff = (crankRevs - this.lastCrankRevs + 65536) % 65536;

                    const rpm = Math.round((revsDiff / timeDiff) * 1024 * 60);
                    if (rpm >= 0 && rpm < 220) this.currentCadence = rpm;
                }
                this.lastCrankRevs = crankRevs;
                this.lastCrankTime = crankTime;
            }

            const now = performance.now();
            if (this.lastTime === 0) this.lastTime = now;
            const deltaSeconds = (now - this.lastTime) / 1000.0;
            this.lastTime = now;

            let currentGrade = 0;
            let currentEle = 0;
            let currentLat = 0;
            let currentLon = 0;
            
            if (window.totalRouteDistance > 0 && typeof window.WasmGetRoutePoint === 'function') {
                const ptJson = window.WasmGetRoutePoint(Number(this.totalDistanceMeters));
                if (ptJson) {
                    const pt = JSON.parse(ptJson);
                    currentGrade = Number(pt.grade || 0); 
                    currentEle = Number(pt.elevation || pt.ele || 0);
                    currentLat = Number(pt.lat || 0);
                    currentLon = Number(pt.lon || 0);

                    if (this.lastElevation > 0 && currentEle > this.lastElevation) {
                        this.elevationGain += (currentEle - this.lastElevation);
                    }
                    this.lastElevation = currentEle;

                    if (Math.abs(currentGrade - this.lastSentGrade) > 0.15) {
                        this.updateTrainerGrade(currentGrade);
                        this.lastSentGrade = currentGrade;
                    }
                }
            }

            const weight = Number(window.ui?.riderWeight || 75);
            const bikeWeight = Number(window.ui?.bikeWeight || 9);
            const speedMS = window.WasmCalculateSpeed(Number(watts), currentGrade, weight, bikeWeight);
            
            if ((watts > 0 || currentGrade < -2) && window.isRecording) {
                this.totalDistanceMeters += (speedMS * deltaSeconds);
            }

            const payload = {
                power: watts,
                cadence: this.currentCadence,
                heart_rate: this.currentHR,
                speed: speedMS * 3.6,
                grade: currentGrade,
                total_dist: this.totalDistanceMeters,
                elevation_gain: this.elevationGain,
                lat: currentLat,
                lon: currentLon 
            };

            onTelemetryUpdate(payload);

        } catch (err) {
            console.error("Capacitor Telemetry Error:", err);
        }
    }

    async updateTrainerGrade(grade) {
        if (!this.trainerDeviceId) return;

        try {
            const rawGrade = Math.round((grade + 200.0) / 0.01);
            const crr = Math.round(0.004 / 0.00005); 

            const payload = new Uint8Array(7);
            payload.fill(0xFF); 
            payload[4] = rawGrade & 0xFF;
            payload[5] = (rawGrade >> 8) & 0xFF;
            payload[6] = crr;

            const msg = this.encodeAntMessage(0x33, payload); // Page 51 (Track Resistance)
            
            // Capacitor requires a DataView for writing
            const dataView = new DataView(msg.buffer);
            
            await BleClient.write(
                this.trainerDeviceId,
                this.FEC_SERVICE_UUID,
                this.FEC_WRITE_UUID,
                dataView
            );
            
            console.log(`Capacitor FE-C: Grade ${grade.toFixed(2)}% sent.`);
        } catch (e) {
            console.error("Capacitor FE-C Write Error:", e);
        }
    }

    encodeAntMessage(page, payload) {
        const msg = new Uint8Array(13);
        msg[0] = 0xA4; 
        msg[1] = 0x09; 
        msg[2] = 0x4F; 
        msg[3] = 0x05; 
        msg[4] = page;
        
        for (let i = 0; i < 7; i++) {
            msg[5 + i] = payload[i];
        }

        let checksum = 0;
        for (let i = 0; i < 12; i++) {
            checksum ^= msg[i];
        }
        msg[12] = checksum;

        return msg;
    }

    async connectHeartRate(onStatusChange) {
        try {
            await this.initBle();
            onStatusChange("Requesting HR...");
            
            const device = await BleClient.requestDevice({
                services: [this.HEART_RATE_SERVICE]
            });

            this.hrDeviceId = device.deviceId;

            await BleClient.connect(this.hrDeviceId, () => {
                onStatusChange("Disconnected");
                this.currentHR = 0;
                this.hrDeviceId = null;
            });

            await BleClient.startNotifications(
                this.hrDeviceId,
                this.HEART_RATE_SERVICE,
                this.HEART_RATE_MEASURE,
                (dataView) => {
                    const flags = dataView.getUint8(0);
                    const is16bit = flags & 0x01;
                    this.currentHR = is16bit ? dataView.getUint16(1, true) : dataView.getUint8(1);
                }
            );

            onStatusChange("HR Connected");
            return true;
        } catch (error) {
            console.error("Capacitor HR Error:", error);
            onStatusChange("HR Error");
            return false;
        }
    }

    async disconnectTrainer() {
        if (this.trainerDeviceId) {
            await BleClient.disconnect(this.trainerDeviceId);
        }
    }

    async disconnectHeartRate() {
        if (this.hrDeviceId) {
            await BleClient.disconnect(this.hrDeviceId);
        }
    }

    async sendTargetPower(watts) {
        if (!this.trainerDeviceId) return;

        try {
            const rawPower = Math.round(watts / 0.25);
            
            const payload = new Uint8Array(7);
            payload.fill(0xFF); 
            payload[5] = rawPower & 0xFF;
            payload[6] = (rawPower >> 8) & 0xFF;

            const msg = this.encodeAntMessage(0x31, payload); // Page 49
            
            const dataView = new DataView(msg.buffer);
            await BleClient.write(this.trainerDeviceId, this.FEC_SERVICE_UUID, this.FEC_WRITE_UUID, dataView);
            
            console.log(`Capacitor FE-C: ERG Target Power ${watts}W sent.`);
        } catch (e) {
            console.error("Capacitor ERG Write Error:", e);
        }
    }
}