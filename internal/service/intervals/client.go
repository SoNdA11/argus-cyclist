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

package intervals

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	BaseURL = "https://intervals.icu/api/v1"
	timeout = 60 * time.Second
)

func basicAuth(apiKey string) string {
	// Intervals.icu personal API key convention:
	// username is the literal string "API_KEY" and the password is the API key.
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("API_KEY:"+apiKey))
}

// UploadFitFile uploads a .fit file to Intervals.icu.
// The athlete id "0" resolves to the athlete that owns the API key.
func UploadFitFile(apiKey, filePath, name string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open .fit file: %v", err)
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return fmt.Errorf("failed to create form file: %v", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return fmt.Errorf("failed to copy file contents: %v", err)
	}
	writer.Close()

	url := fmt.Sprintf("%s/athlete/0/activities", BaseURL)
	if name != "" {
		url += "?name=" + name
	}

	req, err := http.NewRequest(http.MethodPost, url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", basicAuth(apiKey))
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request to intervals.icu failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("intervals.icu API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	return nil
}
