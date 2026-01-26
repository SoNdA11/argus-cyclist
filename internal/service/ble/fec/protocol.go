package fec

import (
	"encoding/binary"
)

// UUIDs para FE-C over BLE
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

// EncodeMessage constrói uma mensagem ANT+ de 13 bytes para ser enviada via BLE
func EncodeMessage(page byte, payload [7]byte) []byte {
	msg := make([]byte, 13)
	msg[0] = SyncByte
	msg[1] = 0x09 // Length
	msg[2] = MsgIDAck
	msg[3] = DefaultChan
	msg[4] = page
	copy(msg[5:12], payload[:])
	
	var checksum byte = 0
	for i := 0; i < 12; i++ {
		checksum ^= msg[i]
	}
	msg[12] = checksum
	
	return msg
}

// EncodeTargetPower (Página 49) - Modo ERG
func EncodeTargetPower(watts float64) []byte {
	rawPower := uint16(watts / 0.25)
	p := [7]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF}
	binary.LittleEndian.PutUint16(p[5:7], rawPower)
	return EncodeMessage(PageTargetPower, p)
}

// EncodeTrackResistance (Página 51) - Modo Simulação (Grade)
func EncodeTrackResistance(grade float64) []byte {
	rawGrade := uint16((grade + 200.0) / 0.01)
	crr := byte(0.004 / 0.00005)
	p := [7]byte{0xFF, 0xFF, 0xFF, 0xFF}
	binary.LittleEndian.PutUint16(p[4:6], rawGrade)
	p[6] = crr
	return EncodeMessage(PageTrackResistance, p)
}

// EncodeWindResistance (Página 50) - Usado na inicialização do Auuki
func EncodeWindResistance() []byte {
	// Valores padrão do Auuki: windResistance=0.51, windSpeed=0 (offset 127), drafting=1.0
	p := [7]byte{0x00, 0x00, 0x00, 0x00}
	p[4] = byte(0.51 / 0.01) // windResistance
	p[5] = 127               // windSpeed (0 + 127)
	p[6] = byte(1.0 / 0.01)  // draftingFactor
	return EncodeMessage(PageWindResistance, p)
}

// EncodeBasicResistance (Página 48)
func EncodeBasicResistance(resistance float64) []byte {
	rawRes := byte(resistance / 0.5)
	p := [7]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}
	p[6] = rawRes
	return EncodeMessage(PageBasicResistance, p)
}

// EncodeUserConfig (Página 55) - Codificação exata do Auuki
func EncodeUserConfig(userWeight, bikeWeight float64) []byte {
	uWeight := uint16(userWeight / 0.01)
	bWeight := uint16(bikeWeight / 0.05) & 0x0FFF
	
	p := [7]byte{}
	binary.LittleEndian.PutUint16(p[0:2], uWeight)
	p[2] = 0xFF // Reserved
	
	// combined1 = (bikeWeight & 0xF) << 4 + diameterOffset (0xF)
	p[3] = byte((bWeight&0x0F)<<4) | 0x0F 
	p[4] = byte(bWeight >> 4)
	p[5] = byte(0.7 / 0.01) // wheelDiameter (0.7m)
	p[6] = 0x00             // gearRatio
	
	return EncodeMessage(PageUserConfig, p)
}

// DecodeTrainerData decodifica as notificações recebidas (FEC2)
func DecodeTrainerData(data []byte) (power int16, cadence uint8) {
	if len(data) < 13 || data[0] != SyncByte {
		return -1, 0
	}
	
	page := data[4]
	switch page {
	case PageTrainerSpecific: // Página 25
		cadence = data[6]
		combined := binary.LittleEndian.Uint16(data[9:11])
		power = int16(combined & 0x0FFF)
		return power, cadence
	}
	return -1, 0
}
