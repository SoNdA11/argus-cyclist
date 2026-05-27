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

package sqlite

import (
	"argus-cyclist/internal/domain"
	"fmt"
	"time"
)

type AIRepo struct {
	state *DBState
}

func NewAIRepository(state *DBState) domain.AIRepository {
	return &AIRepo{state: state}
}

func (r *AIRepo) NewConversation(title string, model string) (domain.AIConversation, error) {
	if r.state.UserDB == nil {
		return domain.AIConversation{}, fmt.Errorf("user database not loaded")
	}

	conv := domain.AIConversation{
		Title:     title,
		Model:     model,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := r.state.UserDB.Create(&conv).Error; err != nil {
		return domain.AIConversation{}, fmt.Errorf("failed to create conversation: %w", err)
	}
	return conv, nil
}

func (r *AIRepo) ListConversations() ([]domain.AIConversation, error) {
	if r.state.UserDB == nil {
		return nil, fmt.Errorf("user database not loaded")
	}

	var conversations []domain.AIConversation
	if err := r.state.UserDB.Order("updated_at desc").Find(&conversations).Error; err != nil {
		return nil, fmt.Errorf("failed to list conversations: %w", err)
	}
	return conversations, nil
}

func (r *AIRepo) GetConversation(id uint) (domain.AIConversation, error) {
	if r.state.UserDB == nil {
		return domain.AIConversation{}, fmt.Errorf("user database not loaded")
	}

	var conversation domain.AIConversation
	if err := r.state.UserDB.Preload("Messages").First(&conversation, id).Error; err != nil {
		return domain.AIConversation{}, fmt.Errorf("conversation not found: %w", err)
	}
	return conversation, nil
}

func (r *AIRepo) DeleteConversation(id uint) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("user database not loaded")
	}

	if err := r.state.UserDB.Delete(&domain.AIConversation{}, id).Error; err != nil {
		return fmt.Errorf("failed to delete conversation: %w", err)
	}
	return nil
}

func (r *AIRepo) SaveMessage(msg *domain.AIMessage) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("user database not loaded")
	}

	if err := r.state.UserDB.Create(msg).Error; err != nil {
		return fmt.Errorf("failed to save message: %w", err)
	}
	return nil
}

func (r *AIRepo) GetMessageByID(id uint) (domain.AIMessage, error) {
	if r.state.UserDB == nil {
		return domain.AIMessage{}, fmt.Errorf("user database not loaded")
	}

	var msg domain.AIMessage
	if err := r.state.UserDB.First(&msg, id).Error; err != nil {
		return domain.AIMessage{}, fmt.Errorf("message not found: %w", err)
	}
	return msg, nil
}

func (r *AIRepo) GetMessages(conversationID uint) ([]domain.AIMessage, error) {
	if r.state.UserDB == nil {
		return nil, fmt.Errorf("user database not loaded")
	}

	var messages []domain.AIMessage
	if err := r.state.UserDB.Where("conversation_id = ?", conversationID).Order("created_at asc").Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("failed to get messages: %w", err)
	}
	return messages, nil
}

func (r *AIRepo) UpdateConversation(id uint, title string, updatedAt time.Time) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("user database not loaded")
	}

	if err := r.state.UserDB.Model(&domain.AIConversation{}).Where("id = ?", id).Updates(map[string]interface{}{
		"title":      title,
		"updated_at": updatedAt,
	}).Error; err != nil {
		return fmt.Errorf("failed to update conversation: %w", err)
	}
	return nil
}
