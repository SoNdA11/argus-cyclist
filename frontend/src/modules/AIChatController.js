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

export class AIChatController {
    constructor() {
        this.overlay = document.getElementById('aiChatOverlay');
        this.messagesEl = document.getElementById('aiChatMessages');
        this.inputEl = document.getElementById('aiChatInput');
        this.sendBtn = document.getElementById('btnAISend');
        this.closeBtn = document.getElementById('btnCloseAIChat');
        this.convListEl = document.getElementById('aiConversations');
        this.newConvBtn = document.getElementById('btnAINewConversation');
        this.workoutBar = document.getElementById('aiWorkoutBar');
        this.workoutNameEl = document.getElementById('aiWorkoutName');
        this.saveWorkoutBtn = document.getElementById('btnAISaveWorkout');
        this.statusDot = document.getElementById('aiConnectionStatus');
        this.modelLabel = document.getElementById('aiModelLabel');

        this.currentConversationID = null;
        this.pendingWorkoutMessageID = null;
        this.isLoading = false;

        this.init();
    }

    init() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.closeBtn.addEventListener('click', () => this.hide());
        this.newConvBtn.addEventListener('click', () => this.newConversation());
        this.saveWorkoutBtn.addEventListener('click', () => this.saveWorkout());

        document.getElementById('btnOpenAIChat').addEventListener('click', () => this.show());

        document.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                this.inputEl.value = prompt;
                this.sendMessage();
            });
        });

        this.checkConnection();
    }

    show() {
        if (window.isRecording) return;
        this.overlay.classList.remove('hidden');
        this.loadConversations();
        this.checkConnection();
        this.updateModelLabel();
        setTimeout(() => this.inputEl.focus(), 100);
    }

    async updateModelLabel() {
        try {
            const model = await window.go.main.App.AIGetActiveModel();
            this.modelLabel.textContent = model || 'unknown';
        } catch {
            this.modelLabel.textContent = 'unknown';
        }
    }

    hide() {
        this.overlay.classList.add('hidden');
        this.pendingWorkoutMessageID = null;
        this.workoutBar.classList.add('hidden');
    }

    async checkConnection() {
        try {
            const connected = await window.go.main.App.AICheckConnection();
            this.statusDot.style.color = connected ? '#10b981' : '#ef4444';
            this.statusDot.style.textShadow = connected
                ? '0 0 6px rgba(16,185,129,0.5)'
                : '0 0 6px rgba(239,68,68,0.5)';
        } catch {
            this.statusDot.style.color = '#ef4444';
        }
    }

    async loadConversations() {
        try {
            const convs = await window.go.main.App.AIListConversations();
            this.convListEl.innerHTML = '';
            if (!convs || convs.length === 0) {
                this.convListEl.innerHTML = '<div class="ai-conv-empty">No conversations yet</div>';
                return;
            }
            convs.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'ai-conv-item' + (conv.ID === this.currentConversationID ? ' active' : '');
                item.dataset.convId = conv.ID;
                const date = new Date(conv.UpdatedAt);
                const label = conv.Title || 'Chat ' + date.toLocaleDateString();
                item.innerHTML = `
                    <div class="ai-conv-item-title">${this.escapeHtml(label)}</div>
                    <div class="ai-conv-item-date">${date.toLocaleDateString()}</div>
                    <div class="ai-conv-actions">
                        <button class="ai-conv-action" title="Rename" data-action="rename">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="ai-conv-action ai-conv-action-del" title="Delete" data-action="delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                `;
                const titleEl = item.querySelector('.ai-conv-item-title');
                titleEl.addEventListener('click', (e) => { e.stopPropagation(); this.selectConversation(conv.ID); });
                item.querySelectorAll('.ai-conv-action').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const action = btn.dataset.action;
                        if (action === 'delete') this.deleteConversation(conv.ID);
                        if (action === 'rename') this.renameConversation(conv.ID, conv.Title || '');
                    });
                });
                this.convListEl.appendChild(item);
            });
        } catch (err) {
            console.error('Failed to load conversations:', err);
        }
    }

    async deleteConversation(id) {
        if (!confirm('Delete this conversation and all its messages?')) return;
        try {
            await window.go.main.App.AIDeleteConversation(id);
            if (this.currentConversationID === id) {
                this.currentConversationID = null;
                this.messagesEl.innerHTML = '';
                this.showWelcome();
            }
            this.loadConversations();
        } catch (err) {
            alert('Failed to delete: ' + err);
        }
    }

    async renameConversation(id, currentTitle) {
        const title = prompt('Rename conversation:', currentTitle);
        if (title === null || title.trim() === '' || title === currentTitle) return;
        try {
            await window.go.main.App.AIRenameConversation(id, title.trim());
            this.loadConversations();
        } catch (err) {
            alert('Failed to rename: ' + err);
        }
    }

    selectConversation(id) {
        this.currentConversationID = id;
        this.loadMessages(id);
        this.convListEl.querySelectorAll('.ai-conv-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.convId) === id);
        });
    }

    async loadMessages(conversationID) {
        try {
            const conv = await window.go.main.App.AIGetConversation(conversationID);
            this.messagesEl.innerHTML = '';
            if (conv.Messages && conv.Messages.length > 0) {
                conv.Messages.forEach(msg => this.appendMessage(msg.Role, msg.Content, msg.HasWorkout, msg.ID, msg.WorkoutJSON));
            } else {
                this.showWelcome();
            }
            this.scrollToBottom();
        } catch (err) {
            console.error('Failed to load messages:', err);
        }
    }

    async newConversation() {
        const title = prompt('Conversation title (optional):');
        if (title === null) return;
        try {
            const model = await window.go.main.App.AIGetActiveModel() || 'qwen2.5:3b';
            const conv = await window.go.main.App.AINewConversation(title || 'New Chat', model);
            this.currentConversationID = conv.ID;
            this.showWelcome();
            this.loadConversations();
            this.inputEl.focus();
        } catch (err) {
            console.error('Failed to create conversation:', err);
            alert('Failed to create conversation: ' + err);
        }
    }

    showWelcome() {
        this.messagesEl.innerHTML = `
            <div class="ai-welcome">
                <div class="ai-welcome-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3584e4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9.5"/>
                        <polyline points="12,2.5 12,7 9,10" stroke-width="1.2"/>
                        <polyline points="12,21.5 12,17 15,14" stroke-width="1.2"/>
                        <polyline points="2.5,12 7,12 10,15" stroke-width="1.2"/>
                        <polyline points="21.5,12 17,12 14,9" stroke-width="1.2"/>
                        <polyline points="7,4 8,6 11,6" stroke-width=".8" opacity=".4"/>
                        <polyline points="17,4 16,6 13,6" stroke-width=".8" opacity=".4"/>
                        <polyline points="4,17 6,16 6,13" stroke-width=".8" opacity=".4"/>
                        <polyline points="20,17 18,16 18,13" stroke-width=".8" opacity=".4"/>
                        <circle cx="12" cy="2.5" r="1.4" fill="#3584e4"/>
                        <circle cx="12" cy="21.5" r="1.4" fill="#3584e4"/>
                        <circle cx="2.5" cy="12" r="1.4" fill="#3584e4"/>
                        <circle cx="21.5" cy="12" r="1.4" fill="#3584e4"/>
                        <circle cx="7" cy="4" r=".8" fill="#3584e4" opacity=".5"/>
                        <circle cx="17" cy="4" r=".8" fill="#3584e4" opacity=".5"/>
                        <circle cx="4" cy="17" r=".8" fill="#3584e4" opacity=".5"/>
                        <circle cx="20" cy="17" r=".8" fill="#3584e4" opacity=".5"/>
                        <rect x="9" y="9" width="6" height="6" rx="1.2" fill="rgba(53,132,228,0.08)"/>
                        <line x1="9" y1="10" x2="7.5" y2="10" stroke-width=".8"/>
                        <line x1="9" y1="12" x2="7.5" y2="12" stroke-width=".8"/>
                        <line x1="9" y1="14" x2="7.5" y2="14" stroke-width=".8"/>
                        <line x1="15" y1="10" x2="16.5" y2="10" stroke-width=".8"/>
                        <line x1="15" y1="12" x2="16.5" y2="12" stroke-width=".8"/>
                        <line x1="15" y1="14" x2="16.5" y2="14" stroke-width=".8"/>
                    </svg>
                </div>
                <h2>AI Cycling Coach</h2>
                <p>Your intelligent training partner powered by Argus Cyclist data.<br>
                Ask me to create custom workouts, analyze your performance,<br>
                explain training concepts, or plan your next session.<br>
                I use your real FTP, activity history, and goals to personalize everything.<br>
                <span style="color:#6b7280;font-size:13px;">Works in Portuguese or English — workouts auto-save as ZWO files.</span></p>
                <div class="ai-suggestions">
                    <button class="ai-chip" data-prompt="Create a 45-minute endurance workout at 65% FTP">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Endurance Workout
                    </button>
                    <button class="ai-chip" data-prompt="Analyze my recent performance and suggest improvements">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        Analyze Performance
                    </button>
                    <button class="ai-chip" data-prompt="What is TSS and how should I use it to plan my training?">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Explain TSS
                    </button>
                    <button class="ai-chip" data-prompt="Create a VO2max interval workout with 3-minute intervals">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                        VO2max Intervals
                    </button>
                </div>
            </div>
        `;
        document.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                this.inputEl.value = prompt;
                this.sendMessage();
            });
        });
    }

    async sendMessage() {
        const text = this.inputEl.value.trim();
        if (!text || this.isLoading) return;

        if (!this.currentConversationID) {
            const model = await window.go.main.App.AIGetActiveModel() || 'qwen2.5:3b';
            const conv = await window.go.main.App.AINewConversation('New Chat', model);
            this.currentConversationID = conv.ID;
            this.loadConversations();
        }

        this.isLoading = true;
        this.inputEl.value = '';
        this.appendMessage('user', text, false, null);
        this.showLoading();
        this.pendingWorkoutMessageID = null;
        this.workoutBar.classList.add('hidden');

        try {
            const result = await window.go.main.App.AIChat(this.currentConversationID, text);
            this.removeLoading();
            this.removeWelcome();
            this.appendMessage('assistant', result.response, result.has_workout, result.message_id, result.workout_json, result.saved_workout_path);

            if (result.has_workout) {
                this.pendingWorkoutMessageID = result.message_id;
                this.workoutNameEl.textContent = result.workout_name || 'Workout Ready';
                this.workoutBar.classList.remove('hidden');
            }

            this.loadConversations();
        } catch (err) {
            this.removeLoading();
            this.appendMessage('assistant', 'Error: ' + err, false, null);
            console.error('AI Chat error:', err);
        }

        this.isLoading = false;
        this.inputEl.focus();
    }

    async saveWorkout() {
        if (!this.pendingWorkoutMessageID) return;
        this.saveWorkoutBtn.disabled = true;
        this.saveWorkoutBtn.textContent = 'Saving...';

        try {
            const path = await window.go.main.App.AISaveWorkoutAsZWO(this.pendingWorkoutMessageID);
            this.saveWorkoutBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved';
            this.saveWorkoutBtn.style.background = '#10b981';

            if (window.ui && window.ui.els && window.ui.els.btnAction) {
                window.ui.els.btnAction.classList.remove('hidden');
            }

            setTimeout(() => {
                this.saveWorkoutBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save as ZWO';
                this.saveWorkoutBtn.style.background = '';
                this.saveWorkoutBtn.disabled = false;
            }, 3000);
        } catch (err) {
            this.saveWorkoutBtn.innerHTML = 'Failed';
            this.saveWorkoutBtn.style.background = '#ef4444';
            console.error('Save workout error:', err);
            setTimeout(() => {
                this.saveWorkoutBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save as ZWO';
                this.saveWorkoutBtn.style.background = '';
                this.saveWorkoutBtn.disabled = false;
            }, 3000);
        }
    }

    appendMessage(role, content, hasWorkout, messageID, workoutJSON, savedPath) {
        const div = document.createElement('div');
        div.className = 'ai-msg ai-msg-' + role;

        const avatar = document.createElement('div');
        avatar.className = 'ai-msg-avatar';
        if (role === 'user') {
            avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3584e4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12,3 12,8 9,11" stroke-width="1"/><polyline points="12,21 12,16 15,13" stroke-width="1"/><polyline points="3,12 8,12 11,15" stroke-width="1"/><polyline points="21,12 16,12 13,9" stroke-width="1"/><circle cx="12" cy="3" r="1.1" fill="#3584e4"/><circle cx="12" cy="21" r="1.1" fill="#3584e4"/><circle cx="3" cy="12" r="1.1" fill="#3584e4"/><circle cx="21" cy="12" r="1.1" fill="#3584e4"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="#3584e4" opacity=".5"/></svg>';
        } else {
            avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12,3 12,8 9,11" stroke-width="1"/><polyline points="12,21 12,16 15,13" stroke-width="1"/><polyline points="3,12 8,12 11,15" stroke-width="1"/><polyline points="21,12 16,12 13,9" stroke-width="1"/><circle cx="12" cy="3" r="1.1" fill="#9ca3af"/><circle cx="12" cy="21" r="1.1" fill="#9ca3af"/><circle cx="3" cy="12" r="1.1" fill="#9ca3af"/><circle cx="21" cy="12" r="1.1" fill="#9ca3af"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="#9ca3af" opacity=".5"/></svg>';
        }

        const bubble = document.createElement('div');
        bubble.className = 'ai-msg-bubble';
        const textEl = document.createElement('div');
        textEl.textContent = content;
        bubble.appendChild(textEl);

        if (role === 'assistant' && hasWorkout && workoutJSON) {
            try {
                const plan = JSON.parse(workoutJSON);
                const card = document.createElement('div');
                card.className = 'ai-workout-card';
                let segHtml = '';
                let totalSec = 0;
                if (plan.segments) {
                    plan.segments.forEach((seg, i) => {
                        let dur = seg.duration || 0;
                        if (dur === 0 && seg.type === 'IntervalsT') {
                            const rep = seg.repeat || 3;
                            const onD = seg.onDuration || 60;
                            const offD = seg.offDuration || 120;
                            dur = rep * (onD + offD);
                        }
                        totalSec += dur;
                        const min = Math.round(dur / 60) || 0;
                        let type = (seg.type || 'Unknown').replace(/\|.*$/, '');
                        let detail = '';
                        if (type === 'Warmup' || type === 'Cooldown') {
                            const pl = seg.powerLow ? Math.round(seg.powerLow * 100) : 50;
                            const ph = seg.powerHigh ? Math.round(seg.powerHigh * 100) : 70;
                            detail = `${pl}-${ph}% FTP`;
                        } else if (type === 'SteadyState' || type === 'FreeRide') {
                            const p = seg.power ? Math.round(seg.power * 100) : 75;
                            detail = `${p}% FTP`;
                        } else if (type === 'IntervalsT') {
                            const rep = seg.repeat || 3;
                            const onMin = Math.round((seg.onDuration || 60) / 60);
                            const offMin = Math.round((seg.offDuration || 120) / 60);
                            const onP = Math.round((seg.onPower || 1.0) * 100);
                            const offP = Math.round((seg.offPower || 0.5) * 100);
                            detail = `${rep}x ${onMin}min on @ ${onP}% / ${offMin}min off @ ${offP}%`;
                        } else {
                            const pl = seg.powerLow ? Math.round(seg.powerLow * 100) : 0;
                            const ph = seg.powerHigh ? Math.round(seg.powerHigh * 100) : 0;
                            const p = seg.power ? Math.round(seg.power * 100) : 0;
                            detail = p ? `${p}% FTP` : (pl || ph ? `${pl}-${ph}% FTP` : '');
                        }
                        segHtml += `<div class="ai-wk-seg">
                            <span class="ai-wk-seg-type">${type}</span>
                            <span class="ai-wk-seg-dur">${min}min</span>
                            <span class="ai-wk-seg-detail">${detail}</span>
                        </div>`;
                    });
                }
                const totalMin = Math.round(totalSec / 60);
                card.innerHTML = `
                    <div class="ai-wk-header">
                        <div class="ai-wk-header-info">
                            <strong>${this.escapeHtml(plan.name || 'Workout')}</strong>
                            <span class="ai-wk-total">${totalMin} min</span>
                        </div>
                        ${savedPath ? '<div class="ai-wk-saved">ZWO saved</div>' : ''}
                    </div>
                    <div class="ai-wk-segments">${segHtml}</div>
                `;
                bubble.appendChild(card);
            } catch (e) {
                console.warn('Failed to render workout card:', e);
            }
        }

        div.appendChild(avatar);
        div.appendChild(bubble);
        this.messagesEl.appendChild(div);
        this.scrollToBottom();
    }

    showLoading() {
        const div = document.createElement('div');
        div.className = 'ai-msg ai-msg-assistant ai-msg-loading';
        div.id = 'aiLoadingMsg';
        div.innerHTML = `
            <div class="ai-msg-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9"/>
                    <polyline points="12,3 12,8 9,11" stroke-width="1"/>
                    <polyline points="12,21 12,16 15,13" stroke-width="1"/>
                    <polyline points="3,12 8,12 11,15" stroke-width="1"/>
                    <polyline points="21,12 16,12 13,9" stroke-width="1"/>
                    <circle cx="12" cy="3" r="1.1" fill="#9ca3af"/>
                    <circle cx="12" cy="21" r="1.1" fill="#9ca3af"/>
                    <circle cx="3" cy="12" r="1.1" fill="#9ca3af"/>
                    <circle cx="21" cy="12" r="1.1" fill="#9ca3af"/>
                    <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="#9ca3af" opacity=".5"/>
                </svg>
            </div>
            <div class="ai-msg-bubble ai-thinking">
                <span class="ai-dot"></span>
                <span class="ai-dot"></span>
                <span class="ai-dot"></span>
            </div>
        `;
        this.messagesEl.appendChild(div);
        this.scrollToBottom();
    }

    removeLoading() {
        const el = document.getElementById('aiLoadingMsg');
        if (el) el.remove();
    }

    removeWelcome() {
        const welcome = this.messagesEl.querySelector('.ai-welcome');
        if (welcome) welcome.remove();
    }

    scrollToBottom() {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
}
