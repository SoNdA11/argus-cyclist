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
      <trkpt lat="-23.563800" lon="-46.654100"><ele>760.0</ele></trkpt>
      <trkpt lat="-23.563620" lon="-46.653910"><ele>763.0</ele></trkpt>
      <trkpt lat="-23.563430" lon="-46.653700"><ele>767.0</ele></trkpt>
      <trkpt lat="-23.563230" lon="-46.653470"><ele>772.0</ele></trkpt>
      <trkpt lat="-23.563030" lon="-46.653250"><ele>778.0</ele></trkpt>
      <trkpt lat="-23.562830" lon="-46.653000"><ele>785.0</ele></trkpt>
      <trkpt lat="-23.562620" lon="-46.652780"><ele>792.0</ele></trkpt>
      <trkpt lat="-23.562400" lon="-46.652570"><ele>799.0</ele></trkpt>
      <trkpt lat="-23.562150" lon="-46.652360"><ele>806.0</ele></trkpt>
      <trkpt lat="-23.561890" lon="-46.652170"><ele>813.0</ele></trkpt>
      <trkpt lat="-23.561620" lon="-46.651980"><ele>820.0</ele></trkpt>
      <trkpt lat="-23.561350" lon="-46.651770"><ele>828.0</ele></trkpt>
      <trkpt lat="-23.561090" lon="-46.651560"><ele>835.0</ele></trkpt>
      <trkpt lat="-23.560820" lon="-46.651340"><ele>842.0</ele></trkpt>
      <trkpt lat="-23.560560" lon="-46.651130"><ele>850.0</ele></trkpt>
      <trkpt lat="-23.560300" lon="-46.650910"><ele>857.0</ele></trkpt>
      <trkpt lat="-23.560050" lon="-46.650680"><ele>864.0</ele></trkpt>
      <trkpt lat="-23.559790" lon="-46.650470"><ele>871.0</ele></trkpt>
      <trkpt lat="-23.559540" lon="-46.650240"><ele>878.0</ele></trkpt>
      <trkpt lat="-23.559300" lon="-46.650020"><ele>884.0</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

func GetBuiltInKOMSegmentGPX() string {
	return builtInKOMSegmentGPX
}