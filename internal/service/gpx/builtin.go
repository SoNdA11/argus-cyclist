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

package gpx

const builtInKOMSegmentGPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Argus Cyclist">
  <trk>
    <name>Argus KOM Event Segment</name>
    <trkseg>
      <trkpt lat="-23.560000" lon="-46.650000"><ele>760.0</ele></trkpt>
      <trkpt lat="-23.555500" lon="-46.645500"><ele>760.0</ele></trkpt>
      <trkpt lat="-23.551000" lon="-46.641000"><ele>770.0</ele></trkpt>
      <trkpt lat="-23.546500" lon="-46.636500"><ele>784.0</ele></trkpt>
      <trkpt lat="-23.542000" lon="-46.632000"><ele>802.0</ele></trkpt>
      <trkpt lat="-23.537500" lon="-46.627500"><ele>824.0</ele></trkpt>
      <trkpt lat="-23.533000" lon="-46.623000"><ele>850.0</ele></trkpt>
      <trkpt lat="-23.528500" lon="-46.618500"><ele>872.0</ele></trkpt>
      <trkpt lat="-23.524000" lon="-46.614000"><ele>884.0</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

func GetBuiltInKOMSegmentGPX() string {
	return builtInKOMSegmentGPX
}
