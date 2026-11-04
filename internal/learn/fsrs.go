package learn

import "math"

// FSRS, the spaced repetition of Anki since 2023: each card keeps a
// stability, the days after which it is still recalled nine times out of
// ten, and a difficulty from 1 to 10. An answer is graded Again, Hard, Good
// or Easy. Days are whole: a card seen again the same day takes the
// short-term rule.
//
// The same numbers as ts-fsrs 5.4 (FSRS-6, its default parameters, no fuzz),
// rounded the same way; the web app applies the same rule to games played
// offline (web/src/utils/learn/fsrs.js), and both are checked against the
// cases of testdata/fsrs.json.

// Grades of an answer.
const (
	Again = 1
	Hard  = 2
	Good  = 3
	Easy  = 4
)

var fsrsW = [21]float64{
	0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
	0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912,
	0.0658, 0.1542,
}

const (
	fsrsSMin = 0.001
	fsrsSMax = 36500
)

var (
	fsrsDecay  = -fsrsW[20]
	fsrsFactor = round8(math.Exp(math.Log(0.9)/fsrsDecay) - 1)
)

// round8 rounds as ts-fsrs does, to eight decimals.
func round8(x float64) float64 { return math.Round(x*1e8) / 1e8 }

func clampF(x, lo, hi float64) float64 { return math.Min(math.Max(x, lo), hi) }

// Retrievability is the chance to recall a card of stability s after
// elapsed days.
func Retrievability(elapsed int, s float64) float64 {
	return round8(math.Pow(1+fsrsFactor*float64(elapsed)/s, fsrsDecay))
}

func initDifficulty(g int) float64 {
	return round8(fsrsW[4] - math.Exp(float64(g-1)*fsrsW[5]) + 1)
}

func nextDifficulty(d float64, g int) float64 {
	delta := -fsrsW[6] * float64(g-3)
	next := d + round8(delta*(10-d)/9)
	return clampF(round8(fsrsW[7]*initDifficulty(Easy)+(1-fsrsW[7])*next), 1, 10)
}

func recallStability(d, s, r float64, g int) float64 {
	hard, easy := 1.0, 1.0
	if g == Hard {
		hard = fsrsW[15]
	}
	if g == Easy {
		easy = fsrsW[16]
	}
	return round8(clampF(s*(1+math.Exp(fsrsW[8])*(11-d)*math.Pow(s, -fsrsW[9])*
		(math.Exp((1-r)*fsrsW[10])-1)*hard*easy), fsrsSMin, fsrsSMax))
}

func forgetStability(d, s, r float64) float64 {
	return round8(clampF(fsrsW[11]*math.Pow(d, -fsrsW[12])*(math.Pow(s+1, fsrsW[13])-1)*
		math.Exp((1-r)*fsrsW[14]), fsrsSMin, fsrsSMax))
}

func shortTermStability(s float64, g int) float64 {
	sinc := math.Pow(s, -fsrsW[19]) * math.Exp(fsrsW[17]*(float64(g)-3+fsrsW[18]))
	if g >= Hard {
		sinc = math.Max(sinc, 1)
	}
	return round8(clampF(s*sinc, fsrsSMin, fsrsSMax))
}

// NextState is a card's stability and difficulty after grade g, elapsed
// days after its last review; a card never seen has both at 0.
func NextState(stability, difficulty float64, elapsed, g int) (float64, float64) {
	if stability == 0 && difficulty == 0 {
		return math.Max(fsrsW[g-1], 0.1), clampF(initDifficulty(g), 1, 10)
	}
	r := Retrievability(elapsed, stability)
	var next float64
	switch {
	case elapsed == 0:
		next = shortTermStability(stability, g)
	case g == Again:
		floor := round8(stability / math.Exp(fsrsW[17]*fsrsW[18]))
		next = clampF(floor, fsrsSMin, forgetStability(difficulty, stability, r))
	default:
		next = recallStability(difficulty, stability, r, g)
	}
	return next, nextDifficulty(difficulty, g)
}

// Interval is the days before a card of stability s comes back, for the
// share of cards to recall wanted (0.9 for nine in ten), within maxDays.
func Interval(s, retention float64, maxDays int) int {
	modifier := round8((math.Pow(retention, 1/fsrsDecay) - 1) / fsrsFactor)
	days := max(1, int(math.Round(s*modifier)))
	return min(days, maxDays)
}
