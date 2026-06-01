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
	limit := 10
	if len(activities) < limit {
		limit = len(activities)
	}
	for i := 0; i < limit; i++ {
		a := activities[i]
		hrStr := ""
		if a.AvgHR > 0 {
			hrStr = fmt.Sprintf(", FC %d bpm", a.AvgHR)
			if a.MaxHR > 0 {
				hrStr = fmt.Sprintf(", FC %d-%d bpm", a.AvgHR, a.MaxHR)
			}
		}
		elevStr := ""
		if a.ElevationGain > 0 {
			elevStr = fmt.Sprintf(", elev %.0f m", a.ElevationGain)
		}
		powerStr := ""
		if a.AvgPower > 0 {
			powerStr = fmt.Sprintf(", %d W avg", a.AvgPower)
		}
		tssStr := ""
		if a.TSS > 0 {
			tssStr = fmt.Sprintf(", TSS %.0f", a.TSS)
		}
		npStr := ""
		if a.NormalizedPower > 0 {
			npStr = fmt.Sprintf(", NP %d", a.NormalizedPower)
		}
		ifStr := ""
		if a.IntensityFactor > 0 {
			ifStr = fmt.Sprintf(", IF %.2f", a.IntensityFactor)
		}
		recentActs += fmt.Sprintf("- %s: %.1f km, %d min%s%s%s%s%s%s\n",
			a.CreatedAt.Format("2006-01-02"),
			a.TotalDistance/1000.0,
			a.Duration/60,
			powerStr,
			npStr,
			tssStr,
			ifStr,
			hrStr,
			elevStr,
		)
	}
	if recentActs == "" {
		recentActs = "- nenhuma\n"
	}

	avgTSS := 0.0
	avgIF := 0.0
	avgNP := 0.0
	count := 0
	for _, a := range activities {
		if a.TSS > 0 {
			avgTSS += a.TSS
			count++
		}
		if a.IntensityFactor > 0 {
			avgIF += a.IntensityFactor
		}
		if a.NormalizedPower > 0 {
			avgNP += float64(a.NormalizedPower)
		}
	}
	aggStr := ""
	if count > 0 {
		avgTSS /= float64(count)
		avgIF /= float64(count)
		avgNP /= float64(count)
		aggStr = fmt.Sprintf(
			"\nMÉDIAS DOS TREINOS:\n- TSS médio: %.0f\n- IF médio: %.2f\n- NP médio: %.0f W\n",
			avgTSS, avgIF, avgNP,
		)
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
%s
Últimas atividades (mais recentes primeiro):
%s
REGRAS:
1. Use os dados reais do usuário para responder, incluindo TSS, NP, IF, FC e elevação quando relevante
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
		aggStr,
		recentActs,
	)
}
