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

package domain

import "time"

type AIConversation struct {
	ID        uint        `gorm:"primaryKey"`
	Title     string      `gorm:"size:255"`
	Model     string      `gorm:"size:50"`
	CreatedAt time.Time
	UpdatedAt time.Time
	Messages  []AIMessage `gorm:"foreignKey:ConversationID;constraint:OnDelete:CASCADE"`
}

type AIMessage struct {
	ID             uint      `gorm:"primaryKey"`
	ConversationID uint      `gorm:"index"`
	Role           string    `gorm:"size:10"`
	Content        string    `gorm:"type:text"`
	HasWorkout     bool
	WorkoutJSON    string    `gorm:"type:text"`
	CreatedAt      time.Time
}
