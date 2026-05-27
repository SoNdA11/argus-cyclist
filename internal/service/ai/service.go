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

package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultBaseURL = "http://127.0.0.1:11434"
const defaultModel = "qwen2.5:3b"
const requestTimeout = 300 * time.Second

type Service struct {
	client  *http.Client
	baseURL string
}

func NewService() *Service {
	return &Service{
		client: &http.Client{
			Timeout: requestTimeout,
		},
		baseURL: defaultBaseURL,
	}
}

func (s *Service) SetBaseURL(url string) {
	s.baseURL = url
}

func (s *Service) Chat(model string, messages []OllamaMessage) (*OllamaChatResponse, error) {
	if model == "" {
		model = defaultModel
	}

	req := OllamaChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   false,
		Format:   "json",
		Options: map[string]interface{}{
			"num_predict": 2048,
			"temperature": 0.5,
			"num_ctx":     2048,
		},
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := s.client.Post(s.baseURL+"/api/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to call Ollama API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var chatResp OllamaChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &chatResp, nil
}

func (s *Service) CheckConnection() bool {
	resp, err := s.client.Get(s.baseURL + "/api/tags")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (s *Service) GetActiveModel() string {
	resp, err := s.client.Get(s.baseURL + "/api/tags")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var tagsResp OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tagsResp); err != nil {
		return ""
	}

	if len(tagsResp.Models) == 0 {
		return ""
	}

	for _, m := range tagsResp.Models {
		if m.Name == "qwen2.5:3b" {
			return m.Name
		}
	}
	for _, m := range tagsResp.Models {
		if strings.Contains(m.Name, "4b") || strings.Contains(m.Name, "3b") || strings.Contains(m.Name, "mini") {
			return m.Name
		}
	}
	return tagsResp.Models[0].Name
}

func (s *Service) ListModels() ([]string, error) {
	resp, err := s.client.Get(s.baseURL + "/api/tags")
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ollama: %w", err)
	}
	defer resp.Body.Close()

	var tagsResp OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tagsResp); err != nil {
		return nil, fmt.Errorf("failed to parse model list: %w", err)
	}

	models := make([]string, len(tagsResp.Models))
	for i, m := range tagsResp.Models {
		models[i] = m.Name
	}
	return models, nil
}
