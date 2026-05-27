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
	"argus-cyclist/internal/domain"
	"fmt"
)

func BuildSystemPrompt(profile domain.UserProfile, activities []domain.Activity, totalActivities int, totalKm float64, totalHours float64) string {
	var recentActs string
	limit := 2
	if len(activities) < limit {
		limit = len(activities)
	}
	for i := 0; i < limit; i++ {
		a := activities[i]
		recentActs += fmt.Sprintf("- %s: %.1f km, %d min\n",
			a.CreatedAt.Format("2006-01-02"),
			a.TotalDistance/1000.0,
			a.Duration/60,
		)
	}
	if recentActs == "" {
		recentActs = "- nenhuma\n"
	}

	return fmt.Sprintf(`Você é um treinador de ciclismo integrado ao Argus Cyclist. Responda no MESMO IDIOMA do usuário.

DADOS DO USUÁRIO:
- Nome: %s
- FTP: %d W
- Peso: %.1f kg
- Nível: %d
- Streak: %d dias
- Total de atividades: %d
- Total percorrido: %.1f km em %.1f horas

Últimas atividades:
%s

REGRAS:
1. Use os dados reais do usuário para responder
2. Quando o usuário pedir um TREINO, responda com JSON. O campo "response" deve conter uma explicação curta. O campo "workout" deve conter o treino estruturado.
3. Exemplo de resposta COM treino (soma total = 600+1200+1200+600 = 3600s = 60min):
{"response":"Treino de 60min com aquecimento, intervalo e volta ao normal.","workout":{"name":"Treino Intervalado 60min","segments":[{"type":"Warmup","duration":600,"powerLow":0.5,"powerHigh":0.7},{"type":"SteadyState","duration":1200,"power":0.75},{"type":"IntervalsT","repeat":4,"onDuration":180,"onPower":1.1,"offDuration":120,"offPower":0.6},{"type":"Cooldown","duration":600,"powerLow":0.4,"powerHigh":0.6}]}}
4. Exemplo de resposta SEM treino (perguntas normais):
{"response":"Seu FTP é 153W, seu nível é 3.","workout":null}

IMPORTANTE:
- type do segmento é UMA palavra: Warmup, SteadyState, FreeRide, IntervalsT, ou Cooldown
- power é DECIMAL (0.5 = 50%% do FTP, 1.1 = 110%%). NUNCA use watts absolutos.
- duration EM SEGUNDOS. IntervalsT não usa duration, o total é repeat * (onDuration + offDuration).
- RESPEITE o tempo total pedido pelo usuário. A soma de TODAS as durações (incluindo IntervalsT calculado como repeat * (on + off)) deve ser IGUAL ao tempo solicitado. Exemplo: 60min = 3600s.`,
		profile.Name,
		profile.FTP,
		profile.Weight,
		profile.Level,
		profile.CurrentStreak,
		totalActivities,
		totalKm,
		totalHours,
		recentActs,
	)
}
