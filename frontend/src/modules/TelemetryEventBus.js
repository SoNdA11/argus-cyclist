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

export class TelemetryEventBus {
    constructor() {
        this.subscribers = [];
    }

    /**
     * Subscribe to telemetry events.
     * @param {Function} callback - Function called with telemetry data.
     */
    subscribe(callback) {
        this.subscribers.push(callback);
    }

    /**
     * Unsubscribe from telemetry events.
     * @param {Function} callback - The callback to remove.
     */
    unsubscribe(callback) {
        this.subscribers = this.subscribers.filter(sub => sub !== callback);
    }

    /**
     * Publish new telemetry data to all subscribers.
     * @param {Object} data - The telemetry data object.
     */
    publish(data) {
        this.subscribers.forEach(callback => callback(data));
    }
}

export const telemetryBus = new TelemetryEventBus();
