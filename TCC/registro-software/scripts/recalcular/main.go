// recalcular reprocessa arquivos .FIT do Argus e compara as métricas
// calculadas sobre as notificações brutas (método antigo, ~3 amostras/s)
// com as calculadas sobre a série reamostrada a 1 Hz (método corrigido).
// Não altera o banco de dados. Uso:
//
//	go run ./TCC/registro-software/scripts/recalcular arquivo1.fit ... > saida.csv
package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	argusfit "argus-cyclist/internal/service/fit"

	"github.com/muktihari/fit/decoder"
	"github.com/muktihari/fit/profile/mesgdef"
	"github.com/muktihari/fit/profile/untyped/mesgnum"
)

func mmp(data []int, window int) int {
	if len(data) < window || window <= 0 {
		return 0
	}
	best, sum := 0, 0
	for i, p := range data {
		sum += p
		if i >= window {
			sum -= data[i-window]
		}
		if i >= window-1 && sum/window > best {
			best = sum / window
		}
	}
	return best
}

func main() {
	w := csv.NewWriter(os.Stdout)
	defer w.Flush()
	w.Write([]string{"arquivo", "notificacoes", "segundos_ativos", "taxa_hz",
		"np_antigo", "np_novo", "dec_antigo", "dec_novo",
		"mmp60_antigo", "mmp60_novo", "mmp300_antigo", "mmp300_novo",
		"mmp1200_antigo", "mmp1200_novo"})

	for _, path := range os.Args[1:] {
		f, err := os.Open(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, path, err)
			continue
		}
		ff, err := decoder.New(f, decoder.WithNoComponentExpansion()).Decode()
		f.Close()
		if err != nil {
			fmt.Fprintln(os.Stderr, path, err)
			continue
		}

		var rawP, rawHR, p1, hr1 []int
		var rs argusfit.SecondResampler
		var prev int64
		first := true
		for i := range ff.Messages {
			m := &ff.Messages[i]
			if m.Num != mesgnum.Record {
				continue
			}
			r := mesgdef.NewRecord(m)
			ts := r.Timestamp.Unix()
			dt := 0.0
			if !first {
				dt = float64(ts - prev)
				if dt > 5 { // pausa
					dt = 0
				}
			}
			first = false
			prev = ts
			p, hr := int(r.Power), int(r.HeartRate)
			if r.Power == 0xFFFF {
				p = 0
			}
			if r.HeartRate == 0xFF {
				hr = 0
			}
			rawP = append(rawP, p)
			rawHR = append(rawHR, hr)
			ps, hs := rs.Add(dt, p, hr)
			p1 = append(p1, ps...)
			hr1 = append(hr1, hs...)
		}
		if len(p1) == 0 {
			continue
		}
		itoa := strconv.Itoa
		ftoa := func(v float64) string { return strconv.FormatFloat(v, 'f', 2, 64) }
		w.Write([]string{
			filepath.Base(path), itoa(len(rawP)), itoa(len(p1)),
			ftoa(float64(len(rawP)) / float64(len(p1))),
			itoa(argusfit.CalculateNormalizedPower(rawP)), itoa(argusfit.CalculateNormalizedPower(p1)),
			ftoa(argusfit.CalculateAerobicDecoupling(rawP, rawHR)), ftoa(argusfit.CalculateAerobicDecoupling(p1, hr1)),
			itoa(mmp(rawP, 60)), itoa(mmp(p1, 60)),
			itoa(mmp(rawP, 300)), itoa(mmp(p1, 300)),
			itoa(mmp(rawP, 1200)), itoa(mmp(p1, 1200)),
		})
	}
}
