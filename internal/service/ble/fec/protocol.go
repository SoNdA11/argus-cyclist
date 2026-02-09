// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package fec

import (
	"encoding/binary"
)

// UUIDs - FE-C over BLE
const (
	ServiceUUID    = "6e40fec1-b5a3-f393-e0a9-e50e24dcca9e"
	CharReadUUID   = "6e40fec2-b5a3-f393-e0a9-e50e24dcca9e" // FEC2 (Notify)
	CharWriteUUID  = "6e40fec3-b5a3-f393-e0a9-e50e24dcca9e" // FEC3 (Write)
)

// ANT+ Message Constants
const (
	SyncByte    = 0xA4
	MsgIDAck    = 0x4F
	DefaultChan = 0x05
)

// Data Pages
const (
	PageBasicResistance = 48  // 0x30
	PageTargetPower      = 49  // 0x31
	PageWindResistance   = 50  // 0x32
	PageTrackResistance  = 51  // 0x33
	PageUserConfig       = 55  // 0x37
	PageCommandStatus    = 71  // 0x47
	PageGeneralFEData    = 16  // 0x10
	PageTrainerSpecific  = 25  // 0x19
)

// EncodeMessage constructs a 13-byte ANT+ message to be sent via BLE.
func EncodeMessage(page byte, payload [7]byte) []byte {
	msg := make([]byte, 13)
	msg[0] = SyncByte
	msg[1] = 0x09 // Length (9 bytes: ID + Channel + 7 bytes payload)
	msg[2] = MsgIDAck
	msg[3] = DefaultChan
	msg[4] = page
	copy(msg[5:12], payload[:])
	
	// Checksum XOR
	var checksum byte = 0
	for i := 0; i < 12; i++ {
		checksum ^= msg[i]
	}
	msg[12] = checksum
	
	return msg
}

// EncodeTargetPower (Page 49) - Mode ERG
func EncodeTargetPower(watts float64) []byte {
	// Resolução: 0.25W
	rawPower := uint16(watts / 0.25)
	
	// In the ANT+ FE-C protocol, Page 49 defines the target power.
	// Bytes 5-9: Reserved (0xFF)
	// Bytes 10-11: Power (LSB, MSB)
	p := [7]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF}
	binary.LittleEndian.PutUint16(p[5:7], rawPower)
	
	return EncodeMessage(PageTargetPower, p)
}

// EncodeTrackResistance (Page 51) - Simulation Mode (Grid)
func EncodeTrackResistance(grade float64) []byte {
	// Grid: resolution 0.01%, offset 200.00%
	// Ex: 5% -> (5 + 200) / 0.01 = 20500
	rawGrade := uint16((grade + 200.0) / 0.01)
	
	// Crr: resolution 0.00005 (Auuki standard: 0.004 -> 80)
	crr := byte(0.004 / 0.00005)
	
	p := [7]byte{0xFF, 0xFF, 0xFF, 0xFF}
	binary.LittleEndian.PutUint16(p[4:6], rawGrade)
	p[6] = crr
	
	return EncodeMessage(PageTrackResistance, p)
}

// EncodeWindResistance (Page 50)
func EncodeWindResistance() []byte {
	p := [7]byte{0x00, 0x00, 0x00, 0x00}
	p[4] = byte(0.51 / 0.01) // windResistance
	p[5] = 127               // windSpeed (0 + 127)
	p[6] = byte(1.0 / 0.01)  // draftingFactor
	return EncodeMessage(PageWindResistance, p)
}

// EncodeBasicResistance (Page 48) - Used to reset or set manual resistance.
func EncodeBasicResistance(resistance float64) []byte {
	// Resolution: 0.5% (0 a 100%)
	// Ex: 50% -> 100
	rawRes := byte(resistance / 0.5)
	p := [7]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}
	p[6] = rawRes
	
	return EncodeMessage(PageBasicResistance, p)
}

// EncodeUserConfig (Page 55) - Important for initializing some reels
func EncodeUserConfig(userWeight, bikeWeight float64) []byte {
	// User Weight: resolution 0.01kg
	uWeight := uint16(userWeight / 0.01)
	// Bike Weight: resolution 0.05kg (Uint12)
	bWeight := uint16(bikeWeight / 0.05) & 0x0FFF
	
	p := [7]byte{}
	binary.LittleEndian.PutUint16(p[0:2], uWeight)
	p[2] = 0xFF // Reserved
	
	p[3] = byte((bWeight&0x0F)<<4) | 0x0F 
	p[4] = byte(bWeight >> 4)
	p[5] = byte(0.7 / 0.01) // wheelDiameter (0.7m)
	p[6] = 0x00             // gearRatio
	
	return EncodeMessage(PageUserConfig, p)
}

// DecodeTrainerData decodes the received notifications (FEC2)
func DecodeTrainerData(data []byte) (power int16, cadence uint8) {
	if len(data) < 13 || data[0] != SyncByte {
		return -1, 0
	}
	
	page := data[4]
	switch page {
	case PageTrainerSpecific: // Page 25
		// Cadence: Byte 6
		cadence = data[6]
		// Power: Byte 9 e 10 (Uint12)
		combined := binary.LittleEndian.Uint16(data[9:11])
		power = int16(combined & 0x0FFF)
		return power, cadence
	}
	
	return -1, 0
}