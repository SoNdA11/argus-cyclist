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

package main

import (
	"embed"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {

	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "argus-cyclist",
		Width:  1920,
		Height: 1080,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		Linux: &linux.Options{
			WebviewGpuPolicy: linuxGpuPolicy(),
		},
		OnStartup:  app.Startup,
		OnShutdown: app.Shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

// linuxGpuPolicy selects the WebKitGTK hardware-acceleration policy.
// Without explicit Linux options Wails v2 falls back to WebviewGpuPolicyNever
// (software rendering), which makes WebGL (MapLibre and the 3D scene) unusable.
// ARGUS_GPU_POLICY=never|ondemand restores the old behaviour on machines whose
// GPU driver misbehaves under WebKitGTK.
func linuxGpuPolicy() linux.WebviewGpuPolicy {
	switch strings.ToLower(os.Getenv("ARGUS_GPU_POLICY")) {
	case "never":
		return linux.WebviewGpuPolicyNever
	case "ondemand":
		return linux.WebviewGpuPolicyOnDemand
	default:
		return linux.WebviewGpuPolicyAlways
	}
}
