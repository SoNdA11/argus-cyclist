// fit2csv extrai os registros de um arquivo .FIT gerado pelo Argus para CSV,
// convertendo as escalas do perfil FIT de volta para unidades do texto.
// Uso: go run ./TCC/registro-software/scripts/fit2csv <arquivo.fit> > saida.csv
package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"strconv"

	"github.com/muktihari/fit/decoder"
	"github.com/muktihari/fit/profile/mesgdef"
	"github.com/muktihari/fit/profile/untyped/mesgnum"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "uso: fit2csv <arquivo.fit>")
		os.Exit(2)
	}
	f, err := os.Open(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer f.Close()

	fitFile, err := decoder.New(f, decoder.WithNoComponentExpansion()).Decode()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	w := csv.NewWriter(os.Stdout)
	defer w.Flush()
	w.Write([]string{"t_s", "dist_km", "alt_m", "speed_kmh", "power_w", "hr_bpm", "cad_rpm"})

	var t0 int64
	n := 0
	for i := range fitFile.Messages {
		msg := &fitFile.Messages[i]
		if msg.Num != mesgnum.Record {
			continue
		}
		r := mesgdef.NewRecord(msg)
		ts := r.Timestamp.Unix()
		if n == 0 {
			t0 = ts
		}
		n++
		w.Write([]string{
			strconv.FormatInt(ts-t0, 10),
			strconv.FormatFloat(float64(r.Distance)/100/1000, 'f', 3, 64),
			strconv.FormatFloat(float64(r.EnhancedAltitude)/5-500, 'f', 1, 64),
			strconv.FormatFloat(float64(r.EnhancedSpeed)/1000*3.6, 'f', 1, 64),
			strconv.Itoa(int(r.Power)),
			strconv.Itoa(int(r.HeartRate)),
			strconv.Itoa(int(r.Cadence)),
		})
	}
	fmt.Fprintf(os.Stderr, "%d registros\n", n)
}
